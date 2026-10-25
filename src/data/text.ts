/** Canonical form for matching: NFC, whitespace collapsed. Keeps diacritics. */
export function normalize(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Removes Vietnamese diacritics but keeps letter case. NFD does not decompose
 * `đ`/`Đ` (they are separate letters), so they are mapped explicitly.
 */
export function stripMarks(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Search key: diacritics removed, `đ` → `d`, lowercased. `fold("Đồng âm") === "dong am"`. */
export function fold(s: string): string {
  return normalize(stripMarks(s)).toLowerCase();
}
