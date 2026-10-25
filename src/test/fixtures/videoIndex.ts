import { VideoIndexSchema, type Video, type VideoIndex } from "../../data/schema";

/**
 * Fixed index for every UI test (Steps 4–7). Never read `public/data/videos.json` in tests:
 * it is regenerated weekly from the YouTube API.
 *
 * IDs are fake but well-formed. Two videos have no `publishedAt` (like seed data).
 */
const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const v = (video: Omit<Video, "thumbnail" | "isShort">): Video => ({
  ...video,
  thumbnail: thumb(video.id),
  isShort: video.durationSec <= 180,
});

export const fixtureVideos: Video[] = [
  v({ id: "th000000001", channelId: "UCemma000000000000000001", channelTitle: "Pronunciation with Emma", title: "How to Pronounce TH — /θ/ and /ð/", publishedAt: "2026-10-01T10:00:00Z", durationSec: 720, tags: ["th-sounds"] }),
  v({ id: "th000000002", channelId: "UCsounds0000000000000001", channelTitle: "Sounds American", title: "Thin or Thing? TH minimal pairs", publishedAt: "2026-09-20T10:00:00Z", durationSec: 150, tags: ["th-sounds", "minimal-pairs"] }),
  v({ id: "ed000000001", channelId: "UCrachel0000000000000001", channelTitle: "Rachel's English", title: "-ED Endings: /t/, /d/ or /ɪd/?", publishedAt: "2026-09-10T10:00:00Z", durationSec: 540, tags: ["ed-endings"] }),
  v({ id: "fc000000001", channelId: "UCmoon000000000000000001", channelTitle: "Moon ESL - Phát âm tiếng Anh", title: "Cách sửa lỗi âm cuối", publishedAt: "2026-08-30T10:00:00Z", durationSec: 156, tags: ["final-consonants"] }),
  v({ id: "fc000000002", channelId: "UCmoon000000000000000001", channelTitle: "Moon ESL - Phát âm tiếng Anh", title: "Đồng âm và âm cuối: luyện tập phát âm", publishedAt: "2026-08-15T10:00:00Z", durationSec: 1260, tags: ["final-consonants", "minimal-pairs"] }),
  v({ id: "ss000000001", channelId: "UCsounds0000000000000001", channelTitle: "Sounds American", title: "Words with -s Endings", publishedAt: "2026-07-01T10:00:00Z", durationSec: 563, tags: ["s-es-endings"] }),
  v({ id: "rl000000001", channelId: "UCsounds0000000000000001", channelTitle: "Sounds American", title: "Pray or Play? R and L", publishedAt: "2026-06-01T10:00:00Z", durationSec: 478, tags: ["r-l", "minimal-pairs"] }),
  v({ id: "vw000000001", channelId: "UCemma000000000000000001", channelTitle: "Pronunciation with Emma", title: "Short and long vowels: ship vs sheep", publishedAt: "2026-05-01T10:00:00Z", durationSec: 1100, tags: ["short-long-vowels"] }),
  v({ id: "in000000001", channelId: "UCphatamhay0000000000001", channelTitle: "Phát Âm Hay", title: "Ngữ điệu câu hỏi", publishedAt: "2026-04-01T10:00:00Z", durationSec: 95, tags: ["intonation"] }),
  v({ id: "ln000000001", channelId: "UCphatamhay0000000000001", channelTitle: "Phát Âm Hay", title: "Nối âm trong tiếng Anh Mỹ", publishedAt: "2026-03-01T10:00:00Z", durationSec: 80, tags: ["linking-connected-speech"] }),
  v({ id: "ws000000001", channelTitle: "Rachel's English", title: "Word stress in two-syllable words", durationSec: 960, tags: ["word-stress"] }),
  v({ id: "ip000000001", channelTitle: "Pronunciation with Emma", title: "The IPA chart explained", durationSec: 2400, tags: ["ipa-basics"] }),
];

export const fixtureIndex: VideoIndex = VideoIndexSchema.parse({
  generatedAt: "2026-10-20T02:00:00Z",
  source: "seed",
  channels: [
    { handle: "@pronunciationwithemma", title: "Pronunciation with Emma", lang: "en", allPronunciation: true },
    { handle: "@rachelsenglish", title: "Rachel's English", lang: "en", allPronunciation: false },
    { handle: "@SoundsAmerican", title: "Sounds American", lang: "en", allPronunciation: true },
    { handle: "@mooneslphatamtienganh", title: "Moon ESL - Phát âm tiếng Anh", lang: "vi", allPronunciation: false },
    { handle: "@phatamhay", title: "Phát Âm Hay", lang: "vi", allPronunciation: false },
  ],
  videos: fixtureVideos,
});
