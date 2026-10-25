import { useEffect } from "react";
import type { TagId } from "../../data/taxonomy";
import { logActivity, markStarted, setDone, useProgress } from "../progress/store";
import styles from "./VideoActions.module.css";

/**
 * Progress actions for a video. Opening the page marks the video started and logs today's
 * activity (in an effect, so PlayerPage needs no changes); the toggle marks it done.
 */
export type VideoActionsProps = {
  videoId: string;
  /** Part of the stable contract from Step 5; not needed for tracking yet. */
  tags: TagId[];
};

export default function VideoActions({ videoId }: VideoActionsProps) {
  const progress = useProgress();
  const done = progress.videos[videoId]?.status === "done";

  useEffect(() => {
    markStarted(videoId);
    logActivity();
  }, [videoId]);

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={done}
        onClick={() => setDone(videoId, !done)}
      >
        <span className={styles.check} aria-hidden="true">
          {done ? "✓" : ""}
        </span>
        Đánh dấu đã xong · Mark as done
      </button>
    </div>
  );
}
