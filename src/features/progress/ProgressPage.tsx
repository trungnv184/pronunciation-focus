import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useVideoIndex } from "../../data/loadIndex";
import type { Video } from "../../data/schema";
import { TAG_GROUPS, TAGS } from "../../data/taxonomy";
import { toLocalDate } from "./dates";
import { computeStreak, continueList, groupProgress, tagProgress, weakestGroup } from "./stats";
import { exportJson, importJson, reset, useProgress, type ProgressState } from "./store";
import styles from "./ProgressPage.module.css";

export default function ProgressPage() {
  const progress = useProgress();
  const state = useVideoIndex();
  const streak = useMemo(() => computeStreak(progress.activity, toLocalDate()), [progress.activity]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Tiến độ · Progress</h1>

      <section className={styles.card} aria-labelledby="streak-heading">
        <h2 id="streak-heading" className={styles.cardTitle}>
          Chuỗi ngày luyện tập <span className={styles.en}>· Daily streak</span>
        </h2>
        <dl className={styles.streak}>
          <div>
            <dt>
              Hiện tại <span className={styles.en}>· Current</span>
            </dt>
            <dd>
              <span className={styles.big}>{streak.current}</span> ngày · days
            </dd>
          </div>
          <div>
            <dt>
              Kỷ lục <span className={styles.en}>· Best</span>
            </dt>
            <dd>
              <span className={styles.big}>{streak.best}</span> ngày · days
            </dd>
          </div>
        </dl>
      </section>

      {state.status === "loading" && (
        <p role="status" className={styles.muted}>
          Đang tải video… · Loading videos…
        </p>
      )}
      {state.status === "error" && (
        <div role="alert" className={styles.card}>
          <p>Không tải được danh sách video · Couldn’t load the videos</p>
          <button type="button" className={styles.secondaryButton} onClick={state.retry}>
            Thử lại · Retry
          </button>
        </div>
      )}
      {state.status === "ready" && <IndexStats videos={state.index.videos} progress={progress} />}

      <DataSection />
    </div>
  );
}

function IndexStats({ videos, progress }: { videos: Video[]; progress: ProgressState }) {
  const tags = useMemo(() => tagProgress(videos, progress), [videos, progress]);
  const groups = useMemo(() => groupProgress(videos, progress), [videos, progress]);
  const continueItems = useMemo(() => continueList(videos, progress), [videos, progress]);
  const weakest = useMemo(() => weakestGroup(videos, progress), [videos, progress]);

  return (
    <>
      {weakest && (
        <section className={`${styles.card} ${styles.suggest}`} aria-labelledby="suggest-heading">
          <h2 id="suggest-heading" className={styles.cardTitle}>
            Nên luyện tiếp <span className={styles.en}>· Suggested next</span>
          </h2>
          <p>
            <strong>{weakest.group.labelVi}</strong> <span className={styles.en}>· {weakest.group.labelEn}</span>
            {" — "}
            {weakest.done} / {weakest.available} video đã xong · done
          </p>
          <Link to={`/?tags=${weakest.tags.join(",")}`} className={styles.primaryButton}>
            Luyện nhóm này · Practise {weakest.group.labelEn}
          </Link>
        </section>
      )}

      <section className={styles.card} aria-labelledby="continue-heading">
        <h2 id="continue-heading" className={styles.cardTitle}>
          Tiếp tục xem <span className={styles.en}>· Continue</span>
        </h2>
        {continueItems.length === 0 ? (
          <p className={styles.muted}>
            Chưa có video đang xem dở. <span className={styles.en}>Nothing in progress.</span>
          </p>
        ) : (
          <ul className={styles.continueList}>
            {continueItems.map((video) => (
              <li key={video.id}>
                <Link to={`/watch/${video.id}`}>{video.title}</Link>
                <span className={styles.muted}> · {video.channelTitle}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sounds-heading" className={styles.groups}>
        <h2 id="sounds-heading" className={styles.cardTitle}>
          Theo nhóm âm <span className={styles.en}>· By sound group</span>
        </h2>
        {TAG_GROUPS.filter((g) => groups[g.id].available > 0).map((group) => (
          <section key={group.id} className={styles.card} aria-labelledby={`group-${group.id}`}>
            <h3 id={`group-${group.id}`} className={styles.groupTitle}>
              {group.labelVi} <span className={styles.en}>· {group.labelEn}</span>
              <span className={styles.groupCount}>
                {groups[group.id].done} / {groups[group.id].available}
              </span>
            </h3>
            <ul className={styles.bars}>
              {TAGS.filter((t) => t.group === group.id && tags[t.id].available > 0).map((tag) => {
                const { done, available } = tags[tag.id];
                const labelId = `tag-${tag.id}`;
                return (
                  <li key={tag.id} className={styles.bar}>
                    <span id={labelId} className={styles.barLabel}>
                      {tag.labelVi} <span className={styles.en}>· {tag.labelEn}</span>
                    </span>
                    <progress
                      className={styles.progress}
                      value={done}
                      max={available}
                      aria-labelledby={labelId}
                      aria-valuetext={`${done} / ${available}`}
                    />
                    <span className={styles.barCount} aria-hidden="true">
                      {done} / {available}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}

type Message = { kind: "ok" | "error"; text: string } | null;

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function DataSection() {
  const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState(false);
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pronunciation-focus-progress-${toLocalDate()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = importJson(await readFileText(file));
      setMessage(
        result.ok
          ? {
              kind: "ok",
              text: `Đã nhập ${result.videos} video, ${result.days} ngày · Imported ${result.videos} videos, ${result.days} days`,
            }
          : { kind: "error", text: result.error },
      );
    } catch {
      setMessage({ kind: "error", text: "Không đọc được tệp · Couldn’t read the file" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const onReset = () => {
    reset();
    setConfirming(false);
    setMessage({ kind: "ok", text: "Đã xóa tiến độ · Progress reset" });
  };

  return (
    <section className={styles.card} aria-labelledby="data-heading">
      <h2 id="data-heading" className={styles.cardTitle}>
        Dữ liệu <span className={styles.en}>· Your data</span>
      </h2>
      <p className={styles.muted}>
        Tiến độ chỉ lưu trên thiết bị này. Xuất tệp để sao lưu hoặc chuyển sang máy khác.{" "}
        <span className={styles.en}>Progress is stored on this device only. Export it to back up or move devices.</span>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onExport}>
          Xuất JSON · Export JSON
        </button>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept="application/json,.json"
          className={styles.fileInput}
          onChange={onImport}
        />
        <label htmlFor={fileId} className={styles.secondaryButton}>
          Nhập JSON · Import JSON
        </label>
        {!confirming && (
          <button type="button" className={styles.dangerButton} onClick={() => setConfirming(true)}>
            Xóa tiến độ · Reset progress
          </button>
        )}
      </div>
      {confirming && (
        <div className={styles.confirm} role="group" aria-labelledby="confirm-text">
          <p id="confirm-text">
            Xóa toàn bộ tiến độ? Không thể hoàn tác.{" "}
            <span className={styles.en}>Delete all progress? This can’t be undone.</span>
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.dangerButton} onClick={onReset}>
              Xóa hết · Yes, reset
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setConfirming(false)}>
              Hủy · Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? styles.error : styles.ok}>
          {message.text}
        </p>
      )}
    </section>
  );
}
