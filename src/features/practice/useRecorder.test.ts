import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RECORDING_SEC,
  maxRecordingSec,
  pickMimeType,
  useRecorder,
  type UseRecorderOptions,
} from "./useRecorder";

describe("pickMimeType", () => {
  it("prefers webm/opus", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to audio/mp4 (Safari/iOS)", () => {
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("returns undefined (browser default) when nothing matches", () => {
    expect(pickMimeType(() => false)).toBeUndefined();
  });

  it("treats a throwing check as unsupported", () => {
    const isSupported = (t: string) => {
      if (t.startsWith("audio/webm")) throw new Error("boom");
      return true;
    };
    expect(pickMimeType(isSupported)).toBe("audio/mp4");
  });
});

describe("maxRecordingSec", () => {
  it("is twice the segment plus 2 s", () => {
    expect(maxRecordingSec(3)).toBe(8);
    expect(maxRecordingSec(5.5)).toBe(13);
  });

  it("is capped at 30 s", () => {
    expect(maxRecordingSec(14)).toBe(MAX_RECORDING_SEC);
    expect(maxRecordingSec(120)).toBe(30);
  });

  it("handles empty or invalid lengths", () => {
    expect(maxRecordingSec(0)).toBe(2);
    expect(maxRecordingSec(Number.NaN)).toBe(2);
  });
});

// ---- Fakes ---------------------------------------------------------------------------------

type FakeTrack = { stop: ReturnType<typeof vi.fn> };

function makeStream() {
  const tracks: FakeTrack[] = [{ stop: vi.fn() }];
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream };
}

let supportedTypes: string[] = [];

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn((t: string) => supportedTypes.includes(t));

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  options: { mimeType?: string } | undefined;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    public stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.options = options;
    this.mimeType = options?.mimeType ?? "audio/default";
    FakeMediaRecorder.instances.push(this);
  }

  start = vi.fn(() => {
    this.state = "recording";
  });

  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
    this.onstop?.();
  });
}

const audioContexts: Array<{ close: ReturnType<typeof vi.fn> }> = [];

class FakeAudioContext {
  state = "running";
  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });
  resume = vi.fn(() => Promise.resolve());
  constructor() {
    audioContexts.push(this);
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return {
      fftSize: 512,
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(160),
    };
  }
}

let getUserMedia: ReturnType<typeof vi.fn>;
let lastStream: ReturnType<typeof makeStream> | null;

function installMediaDevices(impl?: () => Promise<MediaStream>) {
  getUserMedia = vi.fn(
    impl ??
      (() => {
        lastStream = makeStream();
        return Promise.resolve(lastStream.stream);
      }),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

beforeEach(() => {
  supportedTypes = ["audio/webm;codecs=opus", "audio/mp4"];
  FakeMediaRecorder.instances = [];
  audioContexts.length = 0;
  lastStream = null;
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  installMediaDevices();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

function setup(options: Partial<UseRecorderOptions> = {}) {
  const onRecorded = vi.fn();
  const hook = renderHook(() => useRecorder({ maxDurationSec: 8, onRecorded, ...options }));
  return { ...hook, onRecorded };
}

describe("useRecorder", () => {
  it("starts idle and does not ask for the mic on mount", () => {
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("is unsupported without MediaRecorder and never calls getUserMedia", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const { result } = setup();
    expect(result.current.status).toBe("unsupported");
    expect(result.current.error).toBe("unsupported");
    let started = true;
    await act(async () => {
      started = await result.current.start();
    });
    expect(started).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("is unsupported without navigator.mediaDevices", () => {
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    const { result } = setup();
    expect(result.current.status).toBe("unsupported");
    expect(result.current.error).toBe("unsupported");
  });

  it("reports an insecure context", () => {
    vi.stubGlobal("isSecureContext", false);
    const { result } = setup();
    expect(result.current.status).toBe("unsupported");
    expect(result.current.error).toBe("insecure");
  });

  it("goes to denied when permission is refused", async () => {
    installMediaDevices(() => Promise.reject(new DOMException("nope", "NotAllowedError")));
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("denied");
    expect(result.current.error).toBe("permission");
  });

  it("detects a missing microphone", async () => {
    installMediaDevices(() => Promise.reject(new DOMException("none", "NotFoundError")));
    const { result } = setup();
    await act(async () => {
      await result.current.ensurePermission();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("no-mic");
  });

  it("records with the picked MIME type and stops every track on stop", async () => {
    const { result, onRecorded } = setup();
    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });
    expect(result.current.status).toBe("recording");
    const rec = FakeMediaRecorder.instances[0]!;
    expect(rec.options).toEqual({ mimeType: "audio/webm;codecs=opus" });
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(lastStream!.tracks[0]!.stop).not.toHaveBeenCalled();

    act(() => result.current.stop());

    expect(result.current.status).toBe("stopped");
    expect(lastStream!.tracks[0]!.stop).toHaveBeenCalled();
    expect(audioContexts[0]!.close).toHaveBeenCalled();
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const recording = onRecorded.mock.calls[0]![0] as { blob: Blob; mimeType: string };
    expect(recording.mimeType).toBe("audio/webm;codecs=opus");
    expect(recording.blob.size).toBeGreaterThan(0);
    expect(result.current.recording).toBe(recording);
  });

  it("uses audio/mp4 when webm is unsupported, else the browser default", async () => {
    supportedTypes = ["audio/mp4"];
    const { result, unmount } = setup();
    await act(async () => {
      await result.current.start();
    });
    expect(FakeMediaRecorder.instances[0]!.options).toEqual({ mimeType: "audio/mp4" });
    unmount();

    supportedTypes = [];
    const second = setup();
    await act(async () => {
      await second.result.current.start();
    });
    expect(FakeMediaRecorder.instances[1]!.options).toBeUndefined();
  });

  it("stops the tracks on unmount without reporting a recording", async () => {
    const { result, unmount, onRecorded } = setup();
    await act(async () => {
      await result.current.start();
    });
    const track = lastStream!.tracks[0]!;
    unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances[0]!.state).toBe("inactive");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("auto-stops after maxDurationSec", async () => {
    vi.useFakeTimers();
    const { result, onRecorded } = setup({ maxDurationSec: 8 });
    await act(async () => {
      await result.current.start();
    });
    act(() => vi.advanceTimersByTime(7999));
    expect(result.current.status).toBe("recording");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBe("stopped");
    expect(lastStream!.tracks[0]!.stop).toHaveBeenCalled();
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it("ensurePermission asks once and closes the mic straight away", async () => {
    const { result } = setup();
    let ok = false;
    await act(async () => {
      ok = await result.current.ensurePermission();
    });
    expect(ok).toBe(true);
    expect(result.current.status).toBe("idle");
    expect(lastStream!.tracks[0]!.stop).toHaveBeenCalled();
    await act(async () => {
      ok = await result.current.ensurePermission();
    });
    expect(ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("release closes the mic mid-recording and drops the result", async () => {
    const { result, onRecorded } = setup();
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.release());
    expect(lastStream!.tracks[0]!.stop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("reports an empty recording as failed", async () => {
    const { result, onRecorded } = setup();
    await act(async () => {
      await result.current.start();
    });
    const rec = FakeMediaRecorder.instances[0]!;
    rec.stop.mockImplementation(() => {
      rec.state = "inactive";
      rec.onstop?.();
    });
    act(() => result.current.stop());
    expect(result.current.error).toBe("failed");
    expect(result.current.status).toBe("idle");
    expect(onRecorded).not.toHaveBeenCalled();
    expect(lastStream!.tracks[0]!.stop).toHaveBeenCalled();
  });
});
