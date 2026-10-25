import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "../../data/format";
import { ERROR_COPY, RATINGS } from "../practice/copy";
import { playAudio, playSegment, sleep } from "../practice/playback";
import {
  countForVideo,
  deleteAllForVideo,
  deleteAttempt,
  listAttempts,
  saveAttempt,
  setRating,
  toBlob,
  type Attempt,
  type Rating,
  type Segment,
} from "../practice/storage";
import { MAX_RECORDING_SEC, maxRecordingSec, useRecorder, type Recording } from "../practice/useRecorder";
import type { PlayerControls } from "./useYouTubePlayer";
import styles from "./PracticePanel.module.css";

/**
 * Shadow & record panel: Listen (model A–B segment) → Record (3-2-1, mic only open while
 * recording) → Compare (model, short pause, then the learner) → Try again.
 *
 * The YouTube iframe's audio is cross-origin and can't be captured, so the comparison is
 * sequential. Recordings live only in this browser's IndexedDB; nothing is sent anywhere.
 */
export type PracticePanelProps = {
  videoId: string;
  segment: { start: number; end: number } | null;
  player: PlayerControls;
};

const COUNTDOWN_FROM = 3;
const COMPARE_GAP_MS = 700;

type Phase = "listening" | "countdown" | "comparing" | null;

const SAVE_FAILED =
  "Không lưu được bản thu (bộ nhớ trình duyệt bị chặn hoặc đầy). Bạn vẫn có thể so sánh lần thu vừa rồi. · " +
  "Couldn't save the recording (browser storage is blocked or full). You can still compare the last take.";
const STORAGE_FAILED =
  "Không truy cập được bộ nhớ trình duyệt. · Couldn't access browser storage.";
const PLAYBACK_BLOCKED =
  "Trình duyệt không phát được bản thu. Hãy nhấn Phát ở danh sách bên dưới. · " +
  "The browser didn't play the recording. Press Play in the list below.";

const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export default function PracticePanel({ videoId, segment, player }: PracticePanelProps) {
  const segStart = segment?.start ?? null;
  const segEnd = segment?.end ?? null;

  const [phase, setPhase] = useState<Phase>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [listenFirst, setListenFirst] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [videoCount, setVideoCount] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  // Async flows read the latest player through a ref (the controls object changes every render).
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });

  const flowRef = useRef<AbortController | null>(null);
  const audioRef = useRef<{ audio: HTMLAudioElement; url: string; ctrl: AbortController } | null>(
    null,
  );
  const recordSegmentRef = useRef<Segment | null>(null);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshIdRef.current;
    try {
      const [list, count] = await Promise.all([
        segStart !== null && segEnd !== null
          ? listAttempts(videoId, { start: segStart, end: segEnd })
          : Promise.resolve<Attempt[]>([]),
        countForVideo(videoId),
      ]);
      if (id !== refreshIdRef.current) return;
      setAttempts(list);
      setVideoCount(count);
    } catch {
      // IndexedDB unavailable (private mode, old browser, tests without it): show an empty list.
      if (id !== refreshIdRef.current) return;
      setAttempts([]);
      setVideoCount(0);
    }
  }, [videoId, segStart, segEnd]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRecorded = useCallback(
    async (rec: Recording) => {
      const seg = recordSegmentRef.current;
      if (!seg) return;
      try {
        const data = await rec.blob.arrayBuffer();
        await saveAttempt(videoId, seg, { data, mimeType: rec.mimeType });
        await refresh();
      } catch {
        setNotice(SAVE_FAILED);
      }
    },
    [videoId, refresh],
  );

  const recorder = useRecorder({
    maxDurationSec:
      segStart !== null && segEnd !== null ? maxRecordingSec(segEnd - segStart) : MAX_RECORDING_SEC,
    onRecorded: handleRecorded,
  });
  const { release: releaseMic, reset: resetRecorder, ensurePermission, start: startRecording } =
    recorder;

  const stopAudio = useCallback(() => {
    const current = audioRef.current;
    audioRef.current = null;
    if (current) {
      current.ctrl.abort();
      current.audio.pause();
      current.audio.removeAttribute("src");
      URL.revokeObjectURL(current.url);
    }
    setPlayingKey(null);
  }, []);

  /**
   * Create the audio element inside the click handler: iOS only lets an element play later
   * (after the model segment) if it was set up during a user gesture.
   */
  const prepareAudio = (blob: Blob) => {
    stopAudio();
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    audio.load();
    const entry = { audio, url, ctrl: new AbortController() };
    audioRef.current = entry;
    return entry;
  };

  const finishAudio = (audio: HTMLAudioElement) => {
    if (audioRef.current?.audio === audio) stopAudio();
  };

  const beginFlow = () => {
    flowRef.current?.abort();
    const ctrl = new AbortController();
    flowRef.current = ctrl;
    return ctrl;
  };

  const endFlow = (ctrl: AbortController) => {
    if (flowRef.current !== ctrl) return;
    flowRef.current = null;
    setPhase(null);
    setCountdown(null);
  };

  // Unmount: cancel any flow (pauses the player) and release audio. The recorder hook closes the mic.
  useEffect(
    () => () => {
      flowRef.current?.abort();
      flowRef.current = null;
      stopAudio();
    },
    [stopAudio],
  );

  const segmentNow = (): Segment | null =>
    segStart !== null && segEnd !== null ? { start: segStart, end: segEnd } : null;

  const runSegment = (seg: Segment, signal: AbortSignal) =>
    playSegment(playerRef.current, seg, { signal, rate: playerRef.current.rate || 1 });

  const handleListen = async () => {
    const seg = segmentNow();
    if (!seg) return;
    const ctrl = beginFlow();
    stopAudio();
    releaseMic(); // iOS: the mic must be closed before YouTube plays
    setNotice(null);
    setPhase("listening");
    await runSegment(seg, ctrl.signal);
    endFlow(ctrl);
  };

  const handleRecord = async () => {
    const seg = segmentNow();
    if (!seg) return;
    const ctrl = beginFlow();
    stopAudio();
    setNotice(null);
    playerRef.current.pause(); // keep the model out of the recording
    resetRecorder();

    // First click only: the permission prompt shows now, not after the countdown.
    const allowed = await ensurePermission();
    if (!allowed || ctrl.signal.aborted) {
      endFlow(ctrl);
      return;
    }

    if (listenFirst) {
      setPhase("listening");
      const result = await runSegment(seg, ctrl.signal);
      if (result === "aborted") {
        endFlow(ctrl);
        return;
      }
    }

    setPhase("countdown");
    for (let n = COUNTDOWN_FROM; n > 0; n--) {
      setCountdown(n);
      if (!(await sleep(1000, ctrl.signal))) {
        endFlow(ctrl);
        return;
      }
    }
    endFlow(ctrl); // from here the recorder's own status drives the UI
    recordSegmentRef.current = seg;
    await startRecording();
  };

  const latestBlob = (): Blob | null => {
    const latest = attempts[0];
    if (latest) return toBlob(latest);
    return recorder.recording?.blob ?? null;
  };

  const handleCompare = async () => {
    const seg = segmentNow();
    const blob = latestBlob();
    if (!seg || !blob) return;
    const ctrl = beginFlow();
    releaseMic();
    setNotice(null);
    const { audio, ctrl: audioCtrl } = prepareAudio(blob);
    setPhase("comparing");

    const result = await runSegment(seg, ctrl.signal);
    if (result === "aborted" || !(await sleep(COMPARE_GAP_MS, ctrl.signal))) {
      finishAudio(audio);
      endFlow(ctrl);
      return;
    }
    const played = await playAudio(audio, audioCtrl.signal);
    if (played === "blocked") setNotice(PLAYBACK_BLOCKED);
    finishAudio(audio);
    endFlow(ctrl);
  };

  const handleStop = () => {
    if (recorder.status === "recording") {
      recorder.stop();
      return;
    }
    const ctrl = flowRef.current;
    ctrl?.abort();
    stopAudio();
    if (ctrl) endFlow(ctrl);
  };

  const handlePlayAttempt = async (attempt: Attempt) => {
    if (playingKey === attempt.key) {
      stopAudio();
      return;
    }
    flowRef.current?.abort();
    releaseMic();
    playerRef.current.pause();
    setNotice(null);
    const { audio, ctrl } = prepareAudio(toBlob(attempt));
    setPlayingKey(attempt.key);
    const played = await playAudio(audio, ctrl.signal);
    if (played === "blocked") setNotice(PLAYBACK_BLOCKED);
    finishAudio(audio);
  };

  const handleDeleteAttempt = async (attempt: Attempt) => {
    if (playingKey === attempt.key) stopAudio();
    try {
      await deleteAttempt(attempt.key);
    } catch {
      setNotice(STORAGE_FAILED);
    }
    await refresh();
  };

  const handleRate = async (attempt: Attempt, value: Rating) => {
    const next = attempt.rating === value ? undefined : value;
    setAttempts((list) =>
      list.map((a) => {
        if (a.key !== attempt.key) return a;
        const updated: Attempt = { ...a };
        if (next === undefined) delete updated.rating;
        else updated.rating = next;
        return updated;
      }),
    );
    try {
      await setRating(attempt.key, next);
    } catch {
      setNotice(STORAGE_FAILED);
      await refresh();
    }
  };

  const handleDeleteAll = async () => {
    stopAudio();
    resetRecorder();
    try {
      await deleteAllForVideo(videoId);
    } catch {
      setNotice(STORAGE_FAILED);
    }
    setConfirmingDelete(false);
    await refresh();
  };

  const isRecording = recorder.status === "recording";
  const busy = phase !== null || isRecording || recorder.status === "requesting";
  const canRecord = recorder.status !== "unsupported";
  const hasAttempt = attempts.length > 0 || recorder.recording !== null;
  const errorCopy = recorder.error ? ERROR_COPY[recorder.error] : null;
  const maxSec =
    segStart !== null && segEnd !== null ? Math.round(maxRecordingSec(segEnd - segStart)) : 0;

  let statusText = "";
  if (phase === "listening") statusText = "Đang phát đoạn mẫu… · Playing the model…";
  else if (phase === "countdown" && countdown !== null)
    statusText = `Chuẩn bị… ${countdown} · Get ready… ${countdown}`;
  else if (phase === "comparing") statusText = "So sánh: mẫu rồi đến giọng bạn · Comparing: model, then you";
  else if (recorder.status === "requesting")
    statusText = "Đang xin quyền dùng micro… · Asking for microphone access…";
  else if (isRecording) statusText = "Đang thu âm, hãy nói theo! · Recording, speak now!";

  return (
    <section className={styles.card} aria-labelledby="practice-heading">
      <h2 id="practice-heading" className={styles.title}>
        Luyện nói theo · Shadowing
      </h2>
      <p className={styles.muted}>
        Nghe đoạn A–B, nói theo và thu âm, rồi so sánh. · Listen to the A–B part, repeat it while
        recording, then compare.
      </p>

      {segStart === null || segEnd === null ? (
        <p className={styles.hint}>Hãy đặt điểm A và B trước · Set A and B first</p>
      ) : (
        <>
          <p className={styles.segment}>
            Đoạn · Part{" "}
            <span className={styles.time}>
              {formatDuration(segStart)}–{formatDuration(segEnd)}
            </span>
            <span className={styles.muted}>
              {" "}
              · Tự dừng sau {maxSec} giây · Stops after {maxSec} s
            </span>
          </p>

          {errorCopy && (
            <div className={styles.error} role="alert">
              <p className={styles.errorTitle}>{errorCopy.title}</p>
              <p>{errorCopy.body}</p>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={handleListen}
              disabled={busy || !player.ready}
            >
              Nghe · Listen
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={handleRecord}
              disabled={busy || !canRecord || (listenFirst && !player.ready)}
            >
              {hasAttempt ? "Thử lại · Try again" : "Thu âm · Record"}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={handleCompare}
              disabled={busy || !hasAttempt || !player.ready}
            >
              So sánh · Compare
            </button>
            {busy && (
              <button type="button" className={styles.danger} onClick={handleStop}>
                {isRecording ? "Dừng thu · Stop recording" : "Dừng · Stop"}
              </button>
            )}
          </div>

          {canRecord && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={listenFirst}
                onChange={(e) => setListenFirst(e.target.checked)}
                disabled={busy}
              />
              Nghe trước rồi thu · play the segment first, then record
            </label>
          )}

          <p className={styles.status} role="status" aria-live="polite">
            {statusText}
          </p>
          {phase === "countdown" && countdown !== null && (
            <p className={styles.countdown} aria-hidden="true">
              {countdown}
            </p>
          )}
          {isRecording && (
            <div className={styles.meter} aria-hidden="true">
              <div
                className={styles.meterFill}
                style={{ transform: `scaleX(${recorder.level.toFixed(2)})` }}
              />
            </div>
          )}
        </>
      )}

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {attempts.length > 0 && (
        <section className={styles.attemptsBox} aria-labelledby="attempts-heading">
          <h3 id="attempts-heading" className={styles.subtitle}>
            Bản thu gần đây · Recent attempts
          </h3>
          <ol className={styles.attempts}>
            {attempts.map((attempt) => {
              const date = dateFormat.format(attempt.createdAt);
              const playing = playingKey === attempt.key;
              return (
                <li key={attempt.key} className={styles.attempt}>
                  <time className={styles.date} dateTime={new Date(attempt.createdAt).toISOString()}>
                    {date}
                  </time>
                  <div className={styles.row}>
                    <button
                      type="button"
                      className={styles.small}
                      onClick={() => handlePlayAttempt(attempt)}
                      disabled={busy}
                      aria-label={
                        playing
                          ? `Dừng bản thu lúc ${date} · Stop attempt from ${date}`
                          : `Phát bản thu lúc ${date} · Play attempt from ${date}`
                      }
                    >
                      {playing ? "Dừng · Stop" : "Phát · Play"}
                    </button>
                    <button
                      type="button"
                      className={styles.small}
                      onClick={() => handleDeleteAttempt(attempt)}
                      disabled={busy}
                      aria-label={`Xóa bản thu lúc ${date} · Delete attempt from ${date}`}
                    >
                      Xóa · Delete
                    </button>
                    <div
                      className={styles.ratings}
                      role="group"
                      aria-label={`Tự đánh giá bản thu lúc ${date} · Rate attempt from ${date}`}
                    >
                      {RATINGS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          className={styles.rating}
                          aria-pressed={attempt.rating === r.value}
                          aria-label={r.label}
                          title={r.label}
                          onClick={() => handleRate(attempt, r.value)}
                        >
                          <span aria-hidden="true">{r.emoji}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <p className={styles.privacy}>
        Bản thu chỉ lưu trên máy này và không bao giờ được tải lên. · Recordings stay on this device
        and are never uploaded.
      </p>

      {videoCount > 0 &&
        (confirmingDelete ? (
          <div className={styles.confirm} role="group" aria-label="Xác nhận xóa · Confirm delete">
            <p>
              Xóa tất cả {videoCount} bản thu của video này? Không thể hoàn tác. · Delete all{" "}
              {videoCount} recordings for this video? This can&apos;t be undone.
            </p>
            <div className={styles.row}>
              <button type="button" className={styles.danger} onClick={handleDeleteAll}>
                Xóa hết · Delete all
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => setConfirmingDelete(false)}
              >
                Hủy · Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.link}
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            Xóa tất cả bản thu · Delete all recordings
          </button>
        ))}
    </section>
  );
}
