import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone recorder for shadowing (getUserMedia + MediaRecorder), with a tiny AnalyserNode
 * level meter.
 *
 * iOS note: an open mic track switches the device's audio session to play-and-record, which makes
 * YouTube quiet or routes it to the earpiece. So the mic is opened only for the recording itself:
 * every track is stopped (and the AudioContext closed) as soon as recording stops, on errors, on
 * `release()` and on unmount.
 */

/** Tried in order; Chrome/Firefox take webm/opus, Safari/iOS take mp4. Else the browser default. */
export const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4"] as const;

/** Hard cap on one recording, in seconds. */
export const MAX_RECORDING_SEC = 30;

/** First supported candidate, or `undefined` to let the browser choose. */
export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  for (const type of MIME_CANDIDATES) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // Some engines throw for unknown types; treat as unsupported.
    }
  }
  return undefined;
}

/** Auto-stop time: twice the segment plus 2 s, capped at 30 s. */
export function maxRecordingSec(segmentLengthSec: number): number {
  const len = Number.isFinite(segmentLengthSec) && segmentLengthSec > 0 ? segmentLengthSec : 0;
  return Math.min(len * 2 + 2, MAX_RECORDING_SEC);
}

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "denied"
  | "unsupported";

/**
 * Why the last attempt failed (or why recording is impossible).
 * - `permission`: the learner or browser blocked the mic (status `denied`)
 * - `no-mic`: no input device (status `idle`, can retry after plugging one in)
 * - `insecure`: page is not served over https/localhost (status `unsupported`)
 * - `unsupported`: no MediaRecorder / getUserMedia (status `unsupported`)
 * - `failed`: anything else, e.g. the mic is busy or the recording came out empty (status `idle`)
 */
export type RecorderError = "permission" | "no-mic" | "insecure" | "unsupported" | "failed";

export type Recording = { blob: Blob; mimeType: string };

/** Checks capability without touching the mic. */
export function detectSupportError(): RecorderError | null {
  if (typeof window === "undefined") return "unsupported";
  // `isSecureContext` is undefined in very old engines and in jsdom; only an explicit false counts.
  if (window.isSecureContext === false) return "insecure";
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }
  return null;
}

function classifyError(err: unknown): RecorderError {
  const name = (err as { name?: unknown } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no-mic";
    default:
      return "failed";
  }
}

function statusForError(error: RecorderError): RecorderStatus {
  if (error === "permission") return "denied";
  if (error === "insecure" || error === "unsupported") return "unsupported";
  return "idle";
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

export type UseRecorderOptions = {
  /** Auto-stop after this many seconds (see `maxRecordingSec`). */
  maxDurationSec: number;
  /** Called once per finished, non-empty recording. */
  onRecorded?: (recording: Recording) => void;
};

export type RecorderControls = {
  status: RecorderStatus;
  error: RecorderError | null;
  /** 0–1 input level while recording, for a meter. */
  level: number;
  /** The last finished recording (kept in memory only). */
  recording: Recording | null;
  /**
   * Ask for mic permission once (opening and immediately closing the mic), so the browser prompt
   * appears right after the click rather than after a countdown. Resolves true when allowed.
   */
  ensurePermission: () => Promise<boolean>;
  /** Open the mic and start recording. Resolves true once recording has started. */
  start: () => Promise<boolean>;
  /** Stop recording; the result arrives through `onRecorded` / `recording`. */
  stop: () => void;
  /** Forget the last recording and any error (except a permanent unsupported state). */
  reset: () => void;
  /** Close the mic immediately without keeping a result. Safe to call any time. */
  release: () => void;
};

export function useRecorder({ maxDurationSec, onRecorded }: UseRecorderOptions): RecorderControls {
  const [supportError] = useState(detectSupportError);
  const [status, setStatus] = useState<RecorderStatus>(supportError ? "unsupported" : "idle");
  const [error, setError] = useState<RecorderError | null>(supportError);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);

  const mountedRef = useRef(true);
  const grantedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);

  const onRecordedRef = useRef(onRecorded);
  const maxDurationRef = useRef(maxDurationSec);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
    maxDurationRef.current = maxDurationSec;
  });

  const fail = useCallback((err: RecorderError) => {
    if (!mountedRef.current) return;
    setError(err);
    setStatus(statusForError(err));
  }, []);

  /** Stop every mic track, the meter and the auto-stop timer. */
  const closeMic = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    if (mountedRef.current) setLevel(0);
  }, []);

  const openStream = useCallback(async (): Promise<MediaStream | null> => {
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      grantedRef.current = true;
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      return stream;
    } catch (err) {
      fail(classifyError(err));
      return null;
    }
  }, [fail]);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    if (supportError) return false;
    if (grantedRef.current) return true;
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      const stream = await openStream();
      if (!stream) return false;
      stream.getTracks().forEach((t) => t.stop()); // close right away; reopened for the recording
      if (mountedRef.current) setStatus("idle");
      return true;
    } finally {
      busyRef.current = false;
    }
  }, [openStream, supportError]);

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      void ctx.resume?.().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // never to ctx.destination: that would echo the mic
      const buf = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i]! - 128) / 128;
          sum += v * v;
        }
        const next = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        if (Math.abs(next - last) > 0.02) {
          last = next;
          if (mountedRef.current) setLevel(next);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // The meter is a nicety; recording works without it.
    }
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop(); // `onstop` closes the mic once the final data has been delivered
        return;
      } catch {
        // fall through and clean up by hand
      }
    }
    recorderRef.current = null;
    closeMic();
  }, [closeMic]);

  const start = useCallback(async (): Promise<boolean> => {
    if (supportError || busyRef.current || recorderRef.current) return false;
    busyRef.current = true;
    try {
      setRecording(null);
      const stream = await openStream();
      if (!stream) return false;
      streamRef.current = stream;

      const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        try {
          rec = new MediaRecorder(stream);
        } catch {
          closeMic();
          fail("failed");
          return false;
        }
      }

      const chunks: Blob[] = [];
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (recorderRef.current === rec) recorderRef.current = null;
        closeMic();
        if (!mountedRef.current) return;
        const type = rec.mimeType || mimeType || chunks[0]?.type || "";
        const blob = new Blob(chunks, type ? { type } : undefined);
        if (blob.size === 0) {
          fail("failed");
          return;
        }
        const result: Recording = { blob, mimeType: type };
        setRecording(result);
        setStatus("stopped");
        onRecordedRef.current?.(result);
      };
      rec.onerror = () => {
        if (recorderRef.current === rec) recorderRef.current = null;
        closeMic();
        fail("failed");
      };

      recorderRef.current = rec;
      startMeter(stream);
      // No timeslice: one blob at stop. Some Safari versions produced broken mp4 with timeslices.
      rec.start();
      setStatus("recording");
      timerRef.current = setTimeout(stop, maxDurationRef.current * 1000);
      return true;
    } catch {
      recorderRef.current = null;
      closeMic();
      fail("failed");
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [closeMic, fail, openStream, startMeter, stop, supportError]);

  const release = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        // already stopped
      }
      if (mountedRef.current) setStatus(supportError ? "unsupported" : "idle");
    }
    closeMic();
  }, [closeMic, supportError]);

  const reset = useCallback(() => {
    release();
    setRecording(null);
    setError(supportError);
    setStatus(supportError ? "unsupported" : "idle");
  }, [release, supportError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      release();
    };
  }, [release]);

  return { status, error, level, recording, ensurePermission, start, stop, reset, release };
}
