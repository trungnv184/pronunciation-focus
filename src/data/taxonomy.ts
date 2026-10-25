/**
 * Pronunciation taxonomy for Vietnamese learners of English.
 *
 * Keywords are matched by `src/data/tagger.ts` against the NFC title and against a
 * diacritic-stripped copy (so "am cuoi" in an unaccented title still matches `âm cuối`).
 * Rules for writing keywords:
 * - Never use the `g` flag (the tagger adds it where it needs to count matches).
 * - Avoid `\b` next to Vietnamese letters (`\b` is ASCII-only); it works on the stripped copy.
 * - Avoid upper-case escapes such as `\S` / `\W`; keyword sources are diacritic-stripped too.
 */

export const TAG_GROUP_IDS = [
  "endings",
  "consonants",
  "vowels",
  "stress",
  "rhythm-intonation",
  "foundations",
] as const;
export type TagGroupId = (typeof TAG_GROUP_IDS)[number];

export type TagGroup = { id: TagGroupId; labelVi: string; labelEn: string };

export const TAG_GROUPS: readonly TagGroup[] = [
  { id: "endings", labelVi: "Âm cuối", labelEn: "Endings" },
  { id: "consonants", labelVi: "Phụ âm", labelEn: "Consonants" },
  { id: "vowels", labelVi: "Nguyên âm", labelEn: "Vowels" },
  { id: "stress", labelVi: "Trọng âm", labelEn: "Stress" },
  { id: "rhythm-intonation", labelVi: "Nối âm & ngữ điệu", labelEn: "Rhythm & intonation" },
  { id: "foundations", labelVi: "Nền tảng", labelEn: "Foundations" },
];

export const TAG_IDS = [
  "final-consonants",
  "s-es-endings",
  "ed-endings",
  "th-sounds",
  "s-sh",
  "r-l",
  "ch-j-zh",
  "consonant-clusters",
  "v-w",
  "short-long-vowels",
  "ae-e",
  "schwa",
  "diphthongs",
  "word-stress",
  "sentence-stress",
  "linking-connected-speech",
  "reductions",
  "intonation",
  "ipa-basics",
  "minimal-pairs",
] as const;
export type TagId = (typeof TAG_IDS)[number];

export type Tag = {
  id: TagId;
  group: TagGroupId;
  labelVi: string;
  labelEn: string;
  ipa?: string;
  keywords: RegExp[];
};

/** Ordered by how often each problem affects Vietnamese speakers, within each group. */
export const TAGS: readonly Tag[] = [
  // ── endings ───────────────────────────────────────────────────────────────
  {
    id: "final-consonants",
    group: "endings",
    labelVi: "Âm cuối",
    labelEn: "Final consonants",
    keywords: [
      /âm cuối|phụ âm cuối/i,
      /ending sounds?|final (consonants?|sounds?)|end(ing)? consonants?/i,
      /dropp?(ed|ing)? (the |your )?(final|last|ending) (sounds?|consonants?)/i,
    ],
  },
  {
    id: "s-es-endings",
    group: "endings",
    labelVi: "Đuôi -s / -es",
    labelEn: "-s / -es endings",
    ipa: "/s/ /z/ /ɪz/",
    keywords: [
      /\b-?s\s*(\/|and|&|or)\s*-?es\b/i,
      /đuôi\s*["'“]?-?s\b|âm\s*["'“]?-?s\s*cuối/i,
      /(-|\b)s['"’”]? endings?|ending -?s\b|final -?s\b|plural -?s\b|third[- ]person -?s\b/i,
    ],
  },
  {
    id: "ed-endings",
    group: "endings",
    labelVi: "Đuôi -ed",
    labelEn: "-ed endings",
    ipa: "/t/ /d/ /ɪd/",
    keywords: [
      /(^|[^a-z])-ed\b|\bed['"’”]? endings?|ending -?ed\b/i,
      /đuôi\s*["'“]?-?ed\b/i,
      /past tense (endings?|verbs? pronunciation)|pronounc\w* (of )?(the )?past tense/i,
    ],
  },
  // ── consonants ────────────────────────────────────────────────────────────
  {
    id: "th-sounds",
    group: "consonants",
    labelVi: "Âm th",
    labelEn: "TH sounds",
    ipa: "/θ/ /ð/",
    keywords: [/θ|ð/, /\bth\b|th sounds?|âm\s*["'“]?th\b/i, /(voiced|unvoiced|voiceless) th\b/i],
  },
  {
    id: "s-sh",
    group: "consonants",
    labelVi: "Âm s và sh",
    labelEn: "S vs SH",
    ipa: "/s/ /ʃ/",
    keywords: [
      /(?<!t)ʃ|\/\s*(s|sh)\s*\//,
      /\bs\b\s*(vs\.?|and|or|&|\/|và)\s*\bsh\b|\bsh\b\s*(vs\.?|and|or|&|\/|và)\s*\bs\b/i,
      /\bsh sounds?|âm\s*["'“]?sh\b/i,
    ],
  },
  {
    id: "r-l",
    group: "consonants",
    labelVi: "Âm r, l và n",
    labelEn: "R, L and N",
    ipa: "/r/ /l/ /n/",
    keywords: [
      /\br\b\s*(vs\.?|and|or|&|\/|và)\s*\bl\b|\bl\b\s*(vs\.?|and|or|&|\/|và)\s*\b(r|n)\b|\bn\b\s*(vs\.?|and|or|&|\/|và)\s*\bl\b/i,
      /american r\b|the r sound|\br sounds?|\bl sounds?|dark l\b|light l\b|âm\s*["'“]?(r|l)\b/i,
      /ɹ|ɫ|\/\s*(r|l)\s*\//,
    ],
  },
  {
    id: "ch-j-zh",
    group: "consonants",
    labelVi: "Âm ch, j và zh",
    labelEn: "CH, J and ZH",
    ipa: "/tʃ/ /dʒ/ /ʒ/",
    keywords: [
      /tʃ|dʒ|ʒ|\/\s*ch\s*\//,
      /\bch\b\s*(vs\.?|and|or|&|\/|và)\s*\b(j|sh)\b|\bj\b\s*(vs\.?|and|or|&|\/|và)\s*\bch\b/i,
      /\b(ch|j|zh) sounds?|âm\s*["'“]?(ch|j|zh)\b/i,
    ],
  },
  {
    id: "consonant-clusters",
    group: "consonants",
    labelVi: "Cụm phụ âm",
    labelEn: "Consonant clusters",
    keywords: [/consonant (clusters?|blends?)|cụm phụ âm|phụ âm (kép|ghép)/i, /\bclusters?\b/i],
  },
  {
    id: "v-w",
    group: "consonants",
    labelVi: "Âm v và w",
    labelEn: "V vs W",
    ipa: "/v/ /w/",
    keywords: [
      /\bv\b\s*(vs\.?|and|or|&|\/|và)\s*\bw\b|\bw\b\s*(vs\.?|and|or|&|\/|và)\s*\bv\b/i,
      /\b(v|w) sounds?\b|\/\s*(v|w)\s*\//i,
    ],
  },
  // ── vowels ────────────────────────────────────────────────────────────────
  {
    id: "short-long-vowels",
    group: "vowels",
    labelVi: "Nguyên âm ngắn và dài",
    labelEn: "Short vs long vowels",
    ipa: "/ɪ/ /iː/ /ʊ/ /uː/",
    keywords: [
      /iː|uː|ɑː|ɔː|ɜː|ɪ|ʊ/,
      /(short|long) (vs\.?|and|or|&) (short|long)|(short|long) vowels?/i,
      /nguyên âm (dài|ngắn)|âm (dài|ngắn)|\bi\W{1,4}ee\b/i,
      /ship\W{0,5}(vs\.?\W{0,3})?sheep|sheep\W{0,5}(vs\.?\W{0,3})?ship|full\W{0,5}(vs\.?\W{0,3})?fool|live\W{0,5}(vs\.?\W{0,3})?leave/i,
    ],
  },
  {
    id: "ae-e",
    group: "vowels",
    labelVi: "Âm æ và e",
    labelEn: "/æ/ vs /e/",
    ipa: "/æ/ /e/",
    keywords: [
      /æ/,
      /\bae\b|short a\b|ash vowel/i,
      /bad\W{0,5}(vs\.?\W{0,3})?bed|bed\W{0,5}(vs\.?\W{0,3})?bad|man\W{0,5}(vs\.?\W{0,3})?men|pan\W{0,5}(vs\.?\W{0,3})?pen/i,
    ],
  },
  {
    id: "schwa",
    group: "vowels",
    labelVi: "Âm schwa /ə/",
    labelEn: "Schwa",
    ipa: "/ə/",
    keywords: [/schwa|ə(?![ʊ])/i, /nguyên âm yếu|weak vowels?|vowel reduction|giảm nguyên âm/i],
  },
  {
    id: "diphthongs",
    group: "vowels",
    labelVi: "Nguyên âm đôi",
    labelEn: "Diphthongs",
    ipa: "/aɪ/ /eɪ/ /oʊ/",
    keywords: [/diphthongs?|nguyên âm đôi/i, /aɪ|eɪ|ɔɪ|aʊ|oʊ|əʊ/],
  },
  // ── stress ────────────────────────────────────────────────────────────────
  {
    id: "word-stress",
    group: "stress",
    labelVi: "Trọng âm từ",
    labelEn: "Word stress",
    keywords: [
      /word stress|syllable stress|\b(two|three|multi)[- ]syllables?\b|stress(ed)? syllables?|which syllable|stress (patterns?|rules?)/i,
      /trọng âm(?!\s*(câu|cau))|nhấn âm/i,
    ],
  },
  {
    id: "sentence-stress",
    group: "stress",
    labelVi: "Trọng âm câu & nhịp điệu",
    labelEn: "Sentence stress & rhythm",
    keywords: [
      /sentence stress|stress (in|on) (a )?sentences?|content words?|function words?/i,
      /trọng âm câu|nhấn (mạnh )?câu|nhịp điệu/i,
      /\brhythm\b|stress[- ]timed/i,
    ],
  },
  // ── rhythm & intonation ──────────────────────────────────────────────────
  {
    id: "linking-connected-speech",
    group: "rhythm-intonation",
    labelVi: "Nối âm",
    labelEn: "Linking & connected speech",
    keywords: [/\blinking\b|connected speech|link(ing)? words|liaison|assimilation/i, /nối âm|đồng hóa âm/i],
  },
  {
    id: "reductions",
    group: "rhythm-intonation",
    labelVi: "Âm rút gọn & nuốt âm",
    labelEn: "Reductions",
    keywords: [
      /reductions?|reduced (forms?|sounds?|words?)|weak forms?|\b(wanna|gonna|gotta|kinda)\b/i,
      /flap(ped)? t\b|\bflap\b|glottal stop|stop t\b|true t\b|elision/i,
      /nuốt âm|giảm âm|rút gọn|âm câm/i,
    ],
  },
  {
    id: "intonation",
    group: "rhythm-intonation",
    labelVi: "Ngữ điệu",
    labelEn: "Intonation",
    keywords: [
      /intonation|rising (and|&|vs\.?) falling|(rising|falling) (tone|pitch)/i,
      /ngữ điệu|lên giọng|xuống giọng/i,
    ],
  },
  // ── foundations ──────────────────────────────────────────────────────────
  {
    id: "ipa-basics",
    group: "foundations",
    labelVi: "Bảng phiên âm IPA",
    labelEn: "IPA basics",
    keywords: [
      /\bipa\b|international phonetic alphabet|phonetic (alphabet|symbols?|chart)|\b44 sounds|all (the )?(\d+ )?sounds (of|in) english/i,
      /phiên âm|bảng âm/i,
    ],
  },
  {
    id: "minimal-pairs",
    group: "foundations",
    labelVi: "Cặp từ dễ nhầm",
    labelEn: "Minimal pairs",
    keywords: [
      /minimal pairs?|hear the difference|sound the same|commonly confused (sounds|words)/i,
      /cặp (âm|từ) (tối thiểu|dễ nhầm)|(âm|từ) dễ nhầm/i,
    ],
  },
];

export const TAG_BY_ID: Readonly<Record<TagId, Tag>> = Object.fromEntries(
  TAGS.map((t) => [t.id, t]),
) as Record<TagId, Tag>;

export const GROUP_BY_ID: Readonly<Record<TagGroupId, TagGroup>> = Object.fromEntries(
  TAG_GROUPS.map((g) => [g.id, g]),
) as Record<TagGroupId, TagGroup>;

export function isTagId(value: string): value is TagId {
  return (TAG_IDS as readonly string[]).includes(value);
}
