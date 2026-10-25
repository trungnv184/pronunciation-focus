import type { Channel } from "./schema";
import { TAGS, type TagId } from "./taxonomy";
import { normalize, stripMarks } from "./text";

const GENERAL_PRONUNCIATION = /pronunciation|pronounc(e|ing)|accent|\bIPA\b|phonetics?|phát âm/i;

/**
 * Titles that are never lessons, even if a keyword matched: course reviews, ads, dubbing
 * contests, motivational quote shorts.
 */
const NOT_A_LESSON = /review khóa học|review cuối khóa|course review|testimonial|lồng tiếng|khai giảng|quote of the day/i;

/**
 * `\b` in JS is ASCII-only, so in "thứ" it sees a boundary between "th" and "ứ".
 * Keywords are compiled with a Unicode-aware boundary instead.
 */
const WORD = "[\\p{L}\\p{N}_]";
const UNICODE_BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`;

function compile(source: string, flags: string): RegExp {
  const unicodeSource = source.replace(/\\b/g, UNICODE_BOUNDARY);
  const f = flags.replace("g", "");
  return new RegExp(unicodeSource, f.includes("u") ? f : f + "u");
}

/**
 * Each keyword plus a diacritic-free twin, so unaccented Vietnamese titles ("am cuoi") still
 * match. The twin is only used on text without diacritics: stripping is lossy, and
 * "đám cưới" (wedding) would otherwise match "âm cuối" (final sound).
 */
type Matcher = { plain: RegExp; folded: RegExp };

function toMatcher(re: RegExp): Matcher {
  return { plain: compile(re.source, re.flags), folded: compile(stripMarks(re.source), re.flags) };
}

function withGlobal(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
}

const TAG_MATCHERS: { id: TagId; matchers: Matcher[] }[] = TAGS.map((t) => ({
  id: t.id,
  matchers: t.keywords.map(toMatcher),
}));
const GENERAL_MATCHER = toMatcher(GENERAL_PRONUNCIATION);
const NOT_A_LESSON_MATCHER = toMatcher(NOT_A_LESSON);

function hasMarks(text: string): boolean {
  return stripMarks(text) !== text;
}

function inTitle(m: Matcher, title: string, titleFolded: string): boolean {
  return hasMarks(title) ? m.plain.test(title) : m.plain.test(title) || m.folded.test(titleFolded);
}

/** Description hits count only when repeated: one mention is usually sponsor/footer noise. */
function inDescription(m: Matcher, desc: string, descFolded: string): boolean {
  const count = (re: RegExp, text: string) => [...text.matchAll(withGlobal(re))].length;
  const hits = hasMarks(desc) ? count(m.plain, desc) : Math.max(count(m.plain, desc), count(m.folded, descFolded));
  return hits >= 2;
}

type TagInput = { title: string; description?: string };

const RELATED_SECTION =
  /^\s*(related videos?|watch (next|more)|more videos|other videos|you might also like|xem thêm|video liên quan)\b[\s\S]*/im;
const NOISE_LINE = /https?:\/\/|^\s*[#►▶➡👉]/u;

/**
 * Drops link lists, hashtags, "related videos" sections and any channel boilerplate lines
 * (see `findBoilerplateLines`), because they name other lessons' sounds.
 */
export function cleanDescription(desc: string, boilerplate?: ReadonlySet<string>): string {
  return desc
    .replace(RELATED_SECTION, "")
    .split("\n")
    .filter((line) => !NOISE_LINE.test(line) && !boilerplate?.has(normalize(line)))
    .join("\n");
}

/**
 * Lines that appear in at least `minShare` of a channel's descriptions (course ads, footers).
 * Needs a handful of descriptions to be meaningful; returns an empty set for fewer than 4.
 */
export function findBoilerplateLines(descriptions: readonly string[], minShare = 0.4): Set<string> {
  const result = new Set<string>();
  if (descriptions.length < 4) return result;
  const counts = new Map<string, number>();
  for (const d of descriptions) {
    const lines = new Set(d.split("\n").map(normalize).filter((l) => l.length >= 12));
    for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  for (const [line, n] of counts) if (n / descriptions.length >= minShare) result.add(line);
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Removes the channel's own name ("… | PHÁT ÂM HAY") so it can't count as a keyword hit. */
function withoutChannelName(title: string, channel: Channel): string {
  const name = stripMarks(normalize(channel.title));
  if (!name) return title;
  const folded = stripMarks(title);
  // NFC Vietnamese letters are single code units, so indices line up and accents survive.
  if (folded.length !== title.length) return folded.replace(new RegExp(escapeRegExp(name), "giu"), " ");
  let out = title;
  for (const m of [...folded.matchAll(new RegExp(escapeRegExp(name), "gi"))].reverse()) {
    out = out.slice(0, m.index) + " " + out.slice(m.index + m[0].length);
  }
  return out;
}

function prepare(input: TagInput, channel: Channel) {
  const title = normalize(withoutChannelName(normalize(input.title), channel));
  const desc = normalize(cleanDescription(input.description ?? ""));
  return { title, titleFolded: stripMarks(title), desc, descFolded: stripMarks(desc) };
}

export function tagVideo(input: TagInput, channel: Channel): TagId[] {
  const p = prepare(input, channel);
  return TAG_MATCHERS.filter(({ matchers }) =>
    matchers.some((m) => inTitle(m, p.title, p.titleFolded) || inDescription(m, p.desc, p.descFolded)),
  ).map(({ id }) => id);
}

export function isPronunciationVideo(
  input: TagInput & { tags: TagId[] },
  channel: Channel,
): boolean {
  const p = prepare(input, channel);
  if (inTitle(NOT_A_LESSON_MATCHER, p.title, p.titleFolded)) return false;
  if (channel.allPronunciation || input.tags.length > 0) return true;
  // Title only: channel footers ("master the American accent!") would match every upload.
  return inTitle(GENERAL_MATCHER, p.title, p.titleFolded);
}
