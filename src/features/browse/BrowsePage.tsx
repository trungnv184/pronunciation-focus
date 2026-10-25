import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useVideoIndex } from "../../data/loadIndex";
import type { Video } from "../../data/schema";
import {
  SORTS,
  activeFilters,
  applyFilters,
  clearFilters,
  facetedChannelCounts,
  facetedTagCounts,
  filtersToSearchParams,
  isFilterActive,
  removeFilter,
  searchParamsToFilters,
  type ActiveFilter,
  type Filters,
  type Sort,
} from "./filters";
import { FilterPanel } from "./FilterPanel";
import { SORT_LABELS, activeFilterLabel } from "./labels";
import { VideoCard } from "./VideoCard";
import styles from "./BrowsePage.module.css";

const SKELETON_CARDS = 6;
const filterKey = (f: ActiveFilter) => JSON.stringify(f);

/** Channel titles in index order, then any extra titles found on videos. */
function channelTitles(channels: readonly { title: string }[], videos: readonly Video[]): string[] {
  const present = new Set(videos.map((v) => v.channelTitle));
  const ordered = channels.map((c) => c.title).filter((t) => present.has(t));
  return [...new Set([...ordered, ...present])];
}

export default function BrowsePage() {
  const state = useVideoIndex();
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Videos phát âm · Pronunciation videos</h1>
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} onRetry={state.retry} />}
      {state.status === "ready" && (
        <Browser videos={state.index.videos} channels={state.index.channels} />
      )}
    </div>
  );
}

function Browser({ videos, channels }: { videos: Video[]; channels: readonly { title: string }[] }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => searchParamsToFilters(params), [params]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const lastAdded = useRef<ActiveFilter | null>(null);
  const panelId = useId();
  const searchId = useId();
  const sortId = useId();

  const results = useMemo(() => applyFilters(videos, filters), [videos, filters]);
  const tagCounts = useMemo(() => facetedTagCounts(videos, filters), [videos, filters]);
  const channelCounts = useMemo(() => facetedChannelCounts(videos, filters), [videos, filters]);
  const channelList = useMemo(() => channelTitles(channels, videos), [channels, videos]);
  const active = activeFilters(filters);

  const change = useCallback(
    (next: Filters, opts: { replace?: boolean } = {}) => {
      const before = new Set(activeFilters(filters).map(filterKey));
      const added = activeFilters(next).filter((f) => !before.has(filterKey(f)));
      if (added.length > 0) lastAdded.current = added[added.length - 1];
      setParams(filtersToSearchParams(next), { replace: opts.replace, preventScrollReset: true });
    },
    [filters, setParams],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    toggleRef.current?.focus();
  }, []);

  /** The filter the empty state offers to remove: the most recently added one still active. */
  const lastFilter =
    lastAdded.current && isFilterActive(filters, lastAdded.current)
      ? lastAdded.current
      : active[active.length - 1];

  return (
    <div className={styles.layout}>
      <FilterPanel
        id={panelId}
        filters={filters}
        onChange={change}
        channels={channelList}
        tagCounts={tagCounts}
        channelCounts={channelCounts}
        resultCount={results.length}
        open={sheetOpen}
        onClose={closeSheet}
      />

      <section className={styles.results} aria-label="Kết quả · Results">
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <label htmlFor={searchId} className={styles.label}>
              Tìm kiếm · Search
            </label>
            <input
              id={searchId}
              type="search"
              className={styles.input}
              value={filters.q}
              placeholder="vd. âm cuối, th…"
              autoComplete="off"
              onChange={(e) => change({ ...filters, q: e.target.value }, { replace: true })}
            />
          </div>
          <div className={styles.sort}>
            <label htmlFor={sortId} className={styles.label}>
              Sắp xếp · Sort
            </label>
            <select
              id={sortId}
              className={styles.input}
              value={filters.sort}
              onChange={(e) => change({ ...filters, sort: e.target.value as Sort })}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.summary}>
          <p className={styles.count} role="status" aria-live="polite">
            {results.length} / {videos.length} video · Showing {results.length} of {videos.length} videos
          </p>
          <button
            ref={toggleRef}
            type="button"
            className={styles.filterToggle}
            aria-expanded={sheetOpen}
            aria-controls={panelId}
            onClick={() => setSheetOpen(true)}
          >
            Bộ lọc · Filters{active.length > 0 ? ` (${active.length})` : ""}
          </button>
        </div>

        {results.length === 0 ? (
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>Không có video phù hợp · No matching videos</h2>
            {active.length === 0 ? (
              <p>
                Chưa có video nào. <span className={styles.en}>There are no videos yet.</span>
              </p>
            ) : (
              <p>
                Thử bỏ bớt một bộ lọc. <span className={styles.en}>Try removing a filter.</span>
              </p>
            )}
            {active.length > 0 && (
            <div className={styles.emptyActions}>
              {lastFilter && active.length > 1 && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => change(removeFilter(filters, lastFilter))}
                >
                  Bỏ lọc cuối · Remove last filter: {activeFilterLabel(lastFilter, filters)}
                </button>
              )}
              <button
                type="button"
                className={active.length > 1 ? styles.secondaryButton : styles.primaryButton}
                onClick={() => change(clearFilters(filters))}
              >
                Xóa bộ lọc · Clear all
              </button>
            </div>
            )}
          </div>
        ) : (
          <ul className={styles.grid} aria-label="Danh sách video · Video list">
            {results.map((video) => (
              <li key={video.id}>
                <VideoCard video={video} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Đang tải video… · Loading videos…</span>
      <ul className={styles.grid} aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }, (_, i) => (
          <li key={i} className={styles.skeletonCard}>
            <div className={styles.skeletonThumb} />
            <div className={styles.skeletonLine} />
            <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <h2 className={styles.emptyTitle}>Không tải được danh sách video · Couldn’t load the videos</h2>
      <p>
        Kiểm tra kết nối mạng rồi thử lại.{" "}
        <span className={styles.en}>Check your connection and try again.</span>
      </p>
      <p className={styles.errorDetail}>{error.message}</p>
      <button type="button" className={styles.primaryButton} onClick={onRetry}>
        Thử lại · Retry
      </button>
    </div>
  );
}
