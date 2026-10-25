import { describe, expect, it } from "vitest";
import type { Channel } from "./schema";
import { cleanDescription, findBoilerplateLines, isPronunciationVideo, tagVideo } from "./tagger";
import type { TagId } from "./taxonomy";

const en: Channel = { handle: "@general", title: "General English", lang: "en", allPronunciation: false };
const vi: Channel = { handle: "@phatamhay", title: "Phát Âm Hay", lang: "vi", allPronunciation: false };
const allPron: Channel = { handle: "@emma", title: "Pronunciation with Emma", lang: "en", allPronunciation: true };

function tags(title: string, channel: Channel = en, description?: string): TagId[] {
  return tagVideo({ title, description }, channel);
}

function isPron(title: string, channel: Channel = en, description?: string): boolean {
  const t = tagVideo({ title, description }, channel);
  return isPronunciationVideo({ title, description, tags: t }, channel);
}

describe("tagVideo — English titles", () => {
  it.each<[string, TagId]>([
    ["How to Pronounce TH — /θ/ and /ð/", "th-sounds"],
    ["The TH sound made easy", "th-sounds"],
    ["Pronouncing -ED endings: /t/, /d/ or /ɪd/", "ed-endings"],
    ["How to Pronounce Words with '-s' Endings", "s-es-endings"],
    ["Stop dropping final consonants!", "final-consonants"],
    ["Ending sounds every learner forgets", "final-consonants"],
    ["S vs SH: sea or she?", "s-sh"],
    ["Pray or Play? R and L practice", "r-l"],
    ["Master the Dark L", "r-l"],
    ["Consonant Sound / tʃ / as in chair", "ch-j-zh"],
    ["Consonant clusters: strengths, sixths", "consonant-clusters"],
    ["V vs W: vest or west?", "v-w"],
    ["Short and long vowels: ship vs sheep", "short-long-vowels"],
    ["Bad or bed? The /æ/ vowel", "ae-e"],
    ["The schwa: the most common sound in English", "schwa"],
    ["Diphthong Sound / aɪ / as in like", "diphthongs"],
    ["Word stress rules for two-syllable words", "word-stress"],
    ["Sentence stress and content words", "sentence-stress"],
    ["Linking words in connected speech", "linking-connected-speech"],
    ["Wanna, gonna, gotta: reductions", "reductions"],
    ["Rising and falling intonation", "intonation"],
    ["The IPA chart explained", "ipa-basics"],
    ["Minimal pairs practice", "minimal-pairs"],
  ])("%s → %s", (title, tag) => {
    expect(tags(title)).toContain(tag);
  });
});

describe("tagVideo — Vietnamese titles", () => {
  it.each<[string, TagId]>([
    ["Cách sửa lỗi âm cuối", "final-consonants"],
    ["Cach sua loi am cuoi", "final-consonants"],
    ["Phát âm đuôi -ed chuẩn", "ed-endings"],
    ["Phát âm đuôi s/es dễ nhớ", "s-es-endings"],
    ["Ngữ điệu nâng cao: where are you from?", "intonation"],
    ["Nối Âm Trong Tiếng Anh Mỹ", "linking-connected-speech"],
    ["Trọng âm từ có 2 âm tiết", "word-stress"],
    ["Trọng âm câu trong tiếng Anh", "sentence-stress"],
    ["Nguyên âm dài và ngắn", "short-long-vowels"],
    ["Bảng phiên âm IPA cho người mới", "ipa-basics"],
    ["Phân biệt âm l và n", "r-l"],
    ["\"Nuốt Âm\" Trong Tiếng Anh Mỹ", "reductions"],
    ["Nguyên âm đôi trong tiếng Anh", "diphthongs"],
  ])("%s → %s", (title, tag) => {
    expect(tags(title, vi)).toContain(tag);
  });

  it("matches decomposed (NFD) Vietnamese input", () => {
    expect(tags("Cách sửa lỗi âm cuối".normalize("NFD"), vi)).toContain("final-consonants");
  });

  it("handles đ in titles", () => {
    expect(tags("Đuôi -ed: đọc sao cho đúng?", vi)).toContain("ed-endings");
  });

  it("does not see the TH sound in Vietnamese words like thứ / thành / thế", () => {
    expect(tags("Làm thế nào để phát âm đúng mọi thứ", vi)).not.toContain("th-sounds");
    expect(tags("Hướng dẫn phát âm 5 thành ngữ", vi)).not.toContain("th-sounds");
  });
});

describe("isPronunciationVideo", () => {
  it.each([
    ["My morning routine vlog", false],
    ["5 better ways to say 'yes' in English", false],
    ["Is it furniture or furnitures?", false],
    ["What does 'run of the mill' mean?", false],
    ["10 English words you pronounce INCORRECTLY", true],
    ["How to sound more British | Pronunciation lesson", true],
    ["Reduce your accent in 10 minutes", true],
  ] as const)("%s → %s", (title, expected) => {
    expect(isPron(title)).toBe(expected);
  });

  it("matches Vietnamese 'phát âm' with and without diacritics", () => {
    expect(isPron("Hướng dẫn phát âm: what does he like?", vi)).toBe(true);
    expect(isPron("Huong dan phat am chuan", vi)).toBe(true);
  });

  it("ignores the channel's own name in the title", () => {
    expect(isPron("Vocabulary About Wedding | PHAT AM HAY", vi)).toBe(false);
    expect(isPron("Từ vựng về đám cưới | PHÁT ÂM HAY", vi)).toBe(false);
  });

  it("rejects course reviews and dubbing contests", () => {
    expect(isPron("Review Khóa Học | Ngọc Hoa | My Pronunciation Learning Journey", vi)).toBe(false);
  });

  it("accepts everything from an all-pronunciation channel", () => {
    expect(isPron("Silent letters in English", allPron)).toBe(true);
  });

  it("does not use the description for the general pronunciation check", () => {
    expect(isPron("My morning vlog", en, "Learn the American accent! accent accent pronunciation")).toBe(false);
  });
});

describe("description matching", () => {
  it("needs at least two keyword hits in the description", () => {
    expect(tags("Lesson 12", allPron, "Today: intonation.")).not.toContain("intonation");
    expect(tags("Lesson 12", allPron, "Intonation basics. Rising intonation vs falling.")).toContain("intonation");
  });

  it("is stable across repeated calls (no stateful /g regex)", () => {
    const d = "Intonation basics. Rising intonation vs falling.";
    for (let i = 0; i < 3; i++) expect(tags("Lesson", allPron, d)).toContain("intonation");
  });

  it("ignores related-video lists and link lines", () => {
    const d = "About the /h/ sound.\n\nRelated Videos:\n► Consonant Sound /θ/ as in think\n► TH sound /ð/\n";
    expect(tags("Consonant Sound / h / as in home", allPron, d)).not.toContain("th-sounds");
    expect(cleanDescription("keep\nhttps://x.y/z\n#tag\n► link")).toBe("keep");
  });

  it("findBoilerplateLines detects lines shared by many descriptions", () => {
    const footer = "Khóa học ngữ điệu nâng cao — đăng ký ngay";
    const descs = ["a lesson one here", "b lesson two here", "c lesson three here", "d lesson four here"].map(
      (d) => `${d}\n${footer}`,
    );
    const bp = findBoilerplateLines(descs);
    expect(bp.has(footer)).toBe(true);
    expect(bp.has("a lesson one here")).toBe(false);
    expect(findBoilerplateLines(descs.slice(0, 2)).size).toBe(0);
  });
});
