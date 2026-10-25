import type { VideoIndex } from "./schema";

/** YouTube API Services policy: stored API data must be refreshed at least every 30 days. */
export const MAX_DATA_AGE_DAYS = 30;

/** Returns an error message when API-sourced data is too old, else null. Seed data is exempt. */
export function staleDataError(index: Pick<VideoIndex, "source" | "generatedAt">, now: Date = new Date()): string | null {
  if (index.source !== "youtube-api") return null;
  const ageDays = (now.getTime() - new Date(index.generatedAt).getTime()) / 86_400_000;
  if (ageDays <= MAX_DATA_AGE_DAYS) return null;
  return `generatedAt ${index.generatedAt} is ${Math.floor(ageDays)} days old (max ${MAX_DATA_AGE_DAYS}); run the "Refresh video data" workflow`;
}
