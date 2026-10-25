import { TAG_BY_ID } from "../../data/taxonomy";
import type { ActiveFilter, Duration, Filters, Sort } from "./filters";

/** Bilingual UI copy for browse controls: Vietnamese first, English second. */

export const DURATION_LABELS: Record<Duration, { vi: string; en: string }> = {
  any: { vi: "Tất cả", en: "Any" },
  short: { vi: "< 5 phút", en: "Short" },
  medium: { vi: "5–15 phút", en: "Medium" },
  long: { vi: "> 15 phút", en: "Long" },
};

export const SORT_LABELS: Record<Sort, string> = {
  newest: "Mới nhất · Newest",
  shortest: "Ngắn nhất · Shortest",
};

/** Short label for an active filter, used by the empty state's "remove last filter" button. */
export function activeFilterLabel(f: ActiveFilter, filters: Filters): string {
  switch (f.kind) {
    case "tag":
      return `${TAG_BY_ID[f.id].labelVi} · ${TAG_BY_ID[f.id].labelEn}`;
    case "channel":
      return f.title;
    case "duration": {
      const d = DURATION_LABELS[filters.duration];
      return `${d.vi} · ${d.en}`;
    }
    case "q":
      return `“${filters.q.trim()}”`;
    case "hideShorts":
      return "Ẩn Shorts · Hide Shorts";
  }
}
