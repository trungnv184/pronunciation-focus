import type { TagId } from "../../data/taxonomy";

/**
 * Progress actions for a video (mark started / done). Stub until Step 7 fills it in; keep these
 * props stable.
 */
export type VideoActionsProps = {
  videoId: string;
  tags: TagId[];
};

export default function VideoActions({ videoId, tags }: VideoActionsProps) {
  void videoId;
  void tags;
  return null;
}
