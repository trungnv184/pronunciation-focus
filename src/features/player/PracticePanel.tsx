import type { PlayerControls } from "./useYouTubePlayer";
import styles from "./PracticePanel.module.css";

/**
 * Shadow & record panel. Stub until Step 6 fills it in; keep these props stable.
 */
export type PracticePanelProps = {
  videoId: string;
  segment: { start: number; end: number } | null;
  player: PlayerControls;
};

export default function PracticePanel({ videoId, segment, player }: PracticePanelProps) {
  void videoId;
  void segment;
  void player;
  return (
    <section className={styles.card} aria-labelledby="practice-heading">
      <h2 id="practice-heading" className={styles.title}>
        Luyện nói theo · Shadowing
      </h2>
      <p className={styles.soon}>Sắp ra mắt · Coming soon</p>
    </section>
  );
}
