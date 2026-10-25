import { Link } from "react-router-dom";
import { formatDuration } from "../../data/format";
import type { Video } from "../../data/schema";
import { TAG_BY_ID } from "../../data/taxonomy";
import styles from "./VideoCard.module.css";

export const MAX_CARD_TAGS = 3;

export type VideoCardProps = {
  video: Video;
  /** Shows the "Đã xong · Done" badge. Wired to progress in Step 7. */
  done?: boolean;
};

export function VideoCard({ video, done = false }: VideoCardProps) {
  const tags = video.tags.slice(0, MAX_CARD_TAGS);
  return (
    <Link to={`/watch/${video.id}`} className={styles.card} data-done={done || undefined}>
      <div className={styles.thumbWrap}>
        <img
          className={styles.thumb}
          src={video.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          width={320}
          height={180}
        />
        <span className={styles.duration}>
          <span className="visually-hidden">Thời lượng · Duration </span>
          {formatDuration(video.durationSec)}
        </span>
        <span className={styles.badgeSlot}>
          {done && <span className={styles.badge}>Đã xong · Done</span>}
        </span>
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{video.title}</h3>
        <p className={styles.channel}>{video.channelTitle}</p>
        {tags.length > 0 && (
          <ul className={styles.tags} aria-label="Chủ đề · Topics">
            {tags.map((id) => (
              <li key={id} className={styles.tag} title={TAG_BY_ID[id].labelEn}>
                {TAG_BY_ID[id].labelVi}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

export default VideoCard;
