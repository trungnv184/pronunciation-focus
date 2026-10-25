import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatDuration } from "../../data/format";
import { useVideoIndex } from "../../data/loadIndex";
import type { Video } from "../../data/schema";
import { TAG_BY_ID } from "../../data/taxonomy";
import { NUDGE_SEC, nudgePoint, setPoint, shouldLoop, toSegment, type LoopPoints } from "./loop";
import PracticePanel from "./PracticePanel";
import { formatRate, orderRates, stepRate } from "./rates";
import { nextVideoWithSameTag } from "./related";
import { useYouTubePlayer } from "./useYouTubePlayer";
import VideoActions from "./VideoActions";
import styles from "./PlayerPage.module.css";

const LOOP_POLL_MS = 200;

/** Keys typed into these elements (or activating them) must not trigger shortcuts. */
const SHORTCUT_IGNORE_SELECTOR = "input, textarea, select, button, [contenteditable]";

export default function PlayerPage() {
  const { videoId = "" } = useParams();
  const { status, index, error, retry } = useVideoIndex();

  if (status === "loading") {
    return (
      <p className={styles.status} role="status">
        Đang tải video… · Loading video…
      </p>
    );
  }

  if (status === "error") {
    return (
      <section className={styles.message} role="alert">
        <h1>Không tải được danh sách video · Could not load the video list</h1>
        <p className={styles.muted}>{error.message}</p>
        <button type="button" className={styles.button} onClick={retry}>
          Thử lại · Try again
        </button>
      </section>
    );
  }

  const video = index.videos.find((v) => v.id === videoId);
  if (!video) {
    return (
      <section className={styles.message} aria-labelledby="not-found-heading">
        <h1 id="not-found-heading">Không tìm thấy video · Video not found</h1>
        <p className={styles.muted}>
          Video này không có trong danh sách của chúng tôi. · This video isn&apos;t in our list.
        </p>
        <Link to="/" className={styles.button}>
          Về danh sách · Back to list
        </Link>
      </section>
    );
  }

  // `key` resets the A–B points, loop and overlay when navigating to another video.
  return (
    <FocusPlayer key={video.id} video={video} next={nextVideoWithSameTag(index.videos, video)} />
  );
}

function FocusPlayer({ video, next }: { video: Video; next: Video | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<LoopPoints>({ a: null, b: null });
  const [looping, setLooping] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Once the learner clicks inside the cross-origin iframe, keys go to YouTube, not to us. Pull
  // focus back to our controls whenever the player changes state, and explain why.
  const handleStateChange = useCallback(() => {
    controlsRef.current?.focus({ preventScroll: true });
    setShowHint(true);
  }, []);

  const player = useYouTubePlayer(hostRef, video.id, { onStateChange: handleStateChange });
  const { getCurrentTime, seekTo, play, pause } = player;
  const duration = video.durationSec;

  const segment = useMemo(() => toSegment(points), [points]);
  const loopActive = looping && segment !== null;

  useEffect(() => {
    if (!loopActive || !segment) return;
    const id = window.setInterval(() => {
      if (shouldLoop(getCurrentTime(), segment.start, segment.end)) seekTo(segment.start);
    }, LOOP_POLL_MS);
    return () => window.clearInterval(id);
  }, [loopActive, segment, getCurrentTime, seekTo]);

  const markPoint = useCallback(
    (which: "a" | "b") => setPoints((p) => setPoint(p, which, getCurrentTime(), duration)),
    [getCurrentTime, duration],
  );
  const movePoint = (which: "a" | "b", delta: number) =>
    setPoints((p) => nudgePoint(p, which, delta, duration));

  const togglePlay = useCallback(() => {
    if (player.state === "playing" || player.state === "buffering") pause();
    else play();
  }, [player.state, play, pause]);

  const toggleLoop = useCallback(() => {
    if (segment) setLooping((on) => !on);
  }, [segment]);

  const changeRate = useCallback(
    (direction: -1 | 1) => player.setRate(stepRate(player.availableRates, player.rate, direction)),
    [player],
  );

  // Keep the document listener stable and read the latest handlers through a ref.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(SHORTCUT_IGNORE_SELECTOR)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const actions: Record<string, () => void> = {
        " ": togglePlay,
        a: () => markPoint("a"),
        b: () => markPoint("b"),
        l: toggleLoop,
        "[": () => changeRate(-1),
        "]": () => changeRate(1),
      };
      const action = actions[key];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      action();
    };
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keyHandlerRef.current(e);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const practiseAgain = () => {
    seekTo(points.a ?? 0);
    play();
  };

  const rates = orderRates(player.availableRates);
  const isPlaying = player.state === "playing" || player.state === "buffering";

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{video.title}</h1>
        <p className={styles.meta}>
          <span>{video.channelTitle}</span>
          <span aria-hidden="true"> · </span>
          <span>
            <span className="visually-hidden">Thời lượng · Duration </span>
            {formatDuration(video.durationSec)}
          </span>
        </p>
        {video.tags.length > 0 && (
          <ul className={styles.tags} aria-label="Âm luyện tập · Sounds">
            {video.tags.map((tagId) => {
              const tag = TAG_BY_ID[tagId];
              return (
                <li key={tagId}>
                  <Link to={`/?tags=${tagId}`} className={styles.tag}>
                    {tag.labelVi} <span className={styles.tagEn}>{tag.labelEn}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <VideoActions videoId={video.id} tags={video.tags} />
      </header>

      <div className={styles.frame}>
        <div ref={hostRef} className={styles.host} />
        {!player.ready && (
          <p className={styles.frameStatus} role="status">
            Đang tải trình phát… · Loading player…
          </p>
        )}
        {player.state === "ended" && (
          <section className={styles.overlay} aria-labelledby="ended-heading">
            <h2 id="ended-heading" className={styles.overlayTitle}>
              Hết video · Video ended
            </h2>
            <div className={styles.overlayActions}>
              <button type="button" className={styles.primary} onClick={practiseAgain}>
                Luyện lại đoạn này? · Practise this part again
              </button>
              <Link to="/" className={styles.button}>
                Về danh sách · Back to list
              </Link>
              {next && (
                <Link to={`/watch/${next.id}`} className={styles.button}>
                  Video tiếp theo · Next video
                  <span className={styles.nextTitle}>{next.title}</span>
                </Link>
              )}
            </div>
          </section>
        )}
      </div>

      <div
        ref={controlsRef}
        tabIndex={-1}
        className={styles.controls}
        role="group"
        aria-label="Điều khiển · Controls"
      >
        {showHint && (
          <p className={styles.hint} role="status">
            Nhấn ra ngoài video để dùng phím tắt · Click outside the video to use shortcuts
          </p>
        )}

        <div className={styles.row}>
          <button
            type="button"
            className={styles.primary}
            onClick={togglePlay}
            disabled={!player.ready}
          >
            {isPlaying ? "Tạm dừng · Pause" : "Phát · Play"}
          </button>
        </div>

        <fieldset className={styles.group}>
          <legend>Lặp đoạn A–B · A–B loop</legend>
          <div className={styles.points}>
            <PointControl
              label="A"
              value={points.a}
              disabled={!player.ready}
              onSet={() => markPoint("a")}
              onNudge={(d) => movePoint("a", d)}
            />
            <PointControl
              label="B"
              value={points.b}
              disabled={!player.ready}
              onSet={() => markPoint("b")}
              onNudge={(d) => movePoint("b", d)}
            />
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.button}
              aria-pressed={loopActive}
              onClick={toggleLoop}
              disabled={!segment}
            >
              {loopActive ? "Đang lặp · Looping" : "Lặp · Loop"}
            </button>
            {(points.a !== null || points.b !== null) && (
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setPoints({ a: null, b: null });
                  setLooping(false);
                }}
              >
                Xoá A–B · Clear A–B
              </button>
            )}
          </div>
        </fieldset>

        {rates.length > 0 && (
          <div className={styles.group} role="group" aria-labelledby="speed-label">
            <span id="speed-label" className={styles.groupLabel}>
              Tốc độ · Speed
            </span>
            <div className={styles.row}>
              {rates.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={styles.chip}
                  aria-pressed={player.rate === r}
                  onClick={() => player.setRate(r)}
                >
                  {formatRate(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        <section className={styles.legend} aria-labelledby="shortcuts-heading">
          <h2 id="shortcuts-heading" className={styles.groupLabel}>
            Phím tắt · Keyboard shortcuts
          </h2>
          <dl className={styles.shortcuts}>
            <div>
              <dt><kbd>Space</kbd></dt>
              <dd>Phát / tạm dừng · Play / pause</dd>
            </div>
            <div>
              <dt><kbd>A</kbd> / <kbd>B</kbd></dt>
              <dd>Đặt A / B · Set A / B</dd>
            </div>
            <div>
              <dt><kbd>L</kbd></dt>
              <dd>Bật / tắt lặp · Loop on / off</dd>
            </div>
            <div>
              <dt><kbd>[</kbd> / <kbd>]</kbd></dt>
              <dd>Chậm hơn / nhanh hơn · Slower / faster</dd>
            </div>
          </dl>
        </section>
      </div>

      <PracticePanel videoId={video.id} segment={segment} player={player} />
    </article>
  );
}

function PointControl({
  label,
  value,
  disabled,
  onSet,
  onNudge,
}: {
  label: "A" | "B";
  value: number | null;
  disabled: boolean;
  onSet: () => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <div className={styles.point}>
      <button type="button" className={styles.button} onClick={onSet} disabled={disabled}>
        Đặt {label} · Set {label}
      </button>
      <output className={styles.time} aria-label={`Điểm ${label} · Point ${label}`}>
        {label}: {value === null ? "—" : formatDuration(value)}
      </output>
      <button
        type="button"
        className={styles.chip}
        onClick={() => onNudge(-NUDGE_SEC)}
        disabled={value === null}
        aria-label={`${label} lùi 1 giây · Move ${label} back 1 s`}
      >
        −1s
      </button>
      <button
        type="button"
        className={styles.chip}
        onClick={() => onNudge(NUDGE_SEC)}
        disabled={value === null}
        aria-label={`${label} tiến 1 giây · Move ${label} forward 1 s`}
      >
        +1s
      </button>
    </div>
  );
}
