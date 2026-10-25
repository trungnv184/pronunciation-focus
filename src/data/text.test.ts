import { describe, expect, it } from "vitest";
import { fold, normalize, stripMarks } from "./text";

describe("text", () => {
  it("folds Vietnamese including đ", () => {
    expect(fold("Đồng âm")).toBe("dong am");
    expect(fold("Phát Âm Hay")).toBe("phat am hay");
    expect(fold("đường")).toBe("duong");
  });

  it("folds decomposed (NFD) input the same as composed input", () => {
    expect(fold("âm cuối".normalize("NFD"))).toBe(fold("âm cuối"));
  });

  it("normalize composes to NFC and collapses whitespace", () => {
    const nfd = "  âm\n cuối ".normalize("NFD");
    expect(normalize(nfd)).toBe("âm cuối");
    expect(normalize(nfd)).toBe("âm cuối".normalize("NFC"));
  });

  it("stripMarks keeps case", () => {
    expect(stripMarks("Đừng ĐỌC")).toBe("Dung DOC");
  });
});
