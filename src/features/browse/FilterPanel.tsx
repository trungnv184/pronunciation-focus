import { useEffect, useRef, type KeyboardEvent } from "react";
import { TAG_GROUPS, TAGS, type TagId } from "../../data/taxonomy";
import {
  DURATIONS,
  activeFilters,
  clearFilters,
  toggleChannel,
  toggleTag,
  type Filters,
} from "./filters";
import { DURATION_LABELS } from "./labels";
import styles from "./FilterPanel.module.css";

export type FilterPanelProps = {
  id: string;
  filters: Filters;
  onChange: (next: Filters) => void;
  channels: readonly string[];
  tagCounts: Partial<Record<TagId, number>>;
  channelCounts: Record<string, number>;
  resultCount: number;
  /** Mobile bottom sheet state; ignored on desktop where the panel is a sidebar. */
  open: boolean;
  onClose: () => void;
};

export function FilterPanel({
  id,
  filters,
  onChange,
  channels,
  tagCounts,
  channelCounts,
  resultCount,
  open,
  onClose,
}: FilterPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const hasActive = activeFilters(filters).length > 0;

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (open && e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
      <aside
        id={id}
        className={`${styles.panel} ${open ? styles.open : ""}`}
        aria-labelledby={`${id}-title`}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <h2 id={`${id}-title`} className={styles.heading}>
            Bộ lọc · Filters
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={`${styles.sheetOnly} ${styles.closeButton}`}
            onClick={onClose}
          >
            Đóng · Close
          </button>
        </div>

        <button
          type="button"
          className={styles.clearButton}
          onClick={() => onChange(clearFilters(filters))}
          disabled={!hasActive}
        >
          Xóa bộ lọc · Clear all
        </button>

        {TAG_GROUPS.map((group) => (
          <fieldset key={group.id} className={styles.fieldset}>
            <legend className={styles.legend}>
              {group.labelVi} <span className={styles.en}>· {group.labelEn}</span>
            </legend>
            <div className={styles.chips}>
              {TAGS.filter((t) => t.group === group.id).map((tag) => {
                const pressed = filters.tags.includes(tag.id);
                const count = tagCounts[tag.id] ?? 0;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={styles.chip}
                    aria-pressed={pressed}
                    data-empty={count === 0 && !pressed ? "" : undefined}
                    onClick={() => onChange(toggleTag(filters, tag.id))}
                  >
                    <span className={styles.chipVi}>{tag.labelVi}</span>
                    <span className={styles.chipEn}>
                      {tag.labelEn}
                      {tag.ipa && <span className={styles.ipa}> {tag.ipa}</span>}
                    </span>
                    <span className={styles.count}>
                      {count}
                      <span className="visually-hidden"> video</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>
            Thời lượng <span className={styles.en}>· Duration</span>
          </legend>
          <div className={styles.segmented}>
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={filters.duration === d}
                className={styles.segment}
                onClick={() => onChange({ ...filters, duration: d })}
              >
                <span>{DURATION_LABELS[d].vi}</span>
                <span className={styles.en}>{DURATION_LABELS[d].en}</span>
              </button>
            ))}
          </div>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={filters.hideShorts}
              onChange={(e) => onChange({ ...filters, hideShorts: e.target.checked })}
            />
            <span>
              Ẩn Shorts (≤ 3 phút) <span className={styles.en}>· Hide Shorts</span>
            </span>
          </label>
        </fieldset>

        {channels.length > 0 && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
              Kênh <span className={styles.en}>· Channels</span>
            </legend>
            {channels.map((title) => (
              <label key={title} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={filters.channels.includes(title)}
                  onChange={() => onChange(toggleChannel(filters, title))}
                />
                <span className={styles.channelName}>{title}</span>
                <span className={styles.count}>
                  {channelCounts[title] ?? 0}
                  <span className="visually-hidden"> video</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className={`${styles.sheetOnly} ${styles.footer}`}>
          <button type="button" className={styles.showButton} onClick={onClose}>
            Xem {resultCount} kết quả · Show {resultCount} results
          </button>
        </div>
      </aside>
    </>
  );
}
