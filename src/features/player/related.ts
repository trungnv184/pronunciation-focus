import type { Video } from "../../data/schema";

/**
 * The next video that shares the current video's first tag, in index order after the current
 * video and wrapping around. Null when the video has no tags or no other video shares the tag.
 */
export function nextVideoWithSameTag(videos: readonly Video[], current: Video): Video | null {
  const tag = current.tags[0];
  if (!tag) return null;
  const start = videos.findIndex((v) => v.id === current.id);
  for (let step = 1; step <= videos.length; step++) {
    const candidate = videos[(start + step + videos.length) % videos.length];
    if (candidate && candidate.id !== current.id && candidate.tags.includes(tag)) return candidate;
  }
  return null;
}
