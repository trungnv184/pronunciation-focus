import { z } from "zod";
import { TAG_IDS } from "./taxonomy";

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Videos at or under this length are treated as Shorts (the API has no Shorts flag). */
export const SHORT_MAX_SEC = 180;

export const DESCRIPTION_MAX = 500;

export const TagIdSchema = z.enum(TAG_IDS);

export const ChannelSchema = z.object({
  handle: z.string().regex(/^@[\w.-]+$/, "handle must look like @name"),
  id: z.string().regex(/^UC[\w-]{22}$/).optional(),
  title: z.string().min(1),
  lang: z.enum(["en", "vi"]),
  allPronunciation: z.boolean(),
  note: z.string().optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const VideoSchema = z
  .object({
    id: z.string().regex(YOUTUBE_ID_RE),
    channelId: z.string().optional(),
    channelTitle: z.string().min(1),
    title: z.string().min(1),
    description: z.string().max(DESCRIPTION_MAX).optional(),
    publishedAt: z.string().datetime({ offset: true }).optional(),
    durationSec: z.number().int().positive(),
    thumbnail: z.string().url(),
    tags: z.array(TagIdSchema),
    isShort: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.isShort !== v.durationSec <= SHORT_MAX_SEC) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isShort"],
        message: `isShort must equal durationSec <= ${SHORT_MAX_SEC}`,
      });
    }
  });
export type Video = z.infer<typeof VideoSchema>;

export const VideoIndexSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    source: z.enum(["youtube-api", "seed"]),
    channels: z.array(ChannelSchema),
    videos: z.array(VideoSchema),
  })
  .superRefine((index, ctx) => {
    if (index.source !== "youtube-api") return;
    index.channels.forEach((c, i) => {
      if (!c.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["channels", i, "id"],
          message: "channel id is required when source is youtube-api",
        });
      }
    });
    index.videos.forEach((v, i) => {
      for (const field of ["channelId", "description", "publishedAt"] as const) {
        if (v[field] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["videos", i, field],
            message: `${field} is required when source is youtube-api`,
          });
        }
      }
    });
  });
export type VideoIndex = z.infer<typeof VideoIndexSchema>;

export const ChannelListSchema = z.array(ChannelSchema).min(1);

export const OverridesSchema = z.object({
  include: z.array(z.string().regex(YOUTUBE_ID_RE)),
  exclude: z.array(z.string().regex(YOUTUBE_ID_RE)),
  addTags: z.record(z.string().regex(YOUTUBE_ID_RE), z.array(TagIdSchema)),
  removeTags: z.record(z.string().regex(YOUTUBE_ID_RE), z.array(TagIdSchema)),
});
export type Overrides = z.infer<typeof OverridesSchema>;

/** Newest first; videos without `publishedAt` (seed data) go last, in input order. */
export function compareNewest(a: Pick<Video, "publishedAt">, b: Pick<Video, "publishedAt">): number {
  if (!a.publishedAt && !b.publishedAt) return 0;
  if (!a.publishedAt) return 1;
  if (!b.publishedAt) return -1;
  return b.publishedAt.localeCompare(a.publishedAt);
}
