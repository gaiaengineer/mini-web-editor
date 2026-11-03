import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { createExtensions } from "@/lib/schema";
import { countBook } from "./bookCounts";

const schema = getSchema(createExtensions(null));
const text = (value: string) => ({ type: "text", text: value });
const p = (...content: object[]) => ({ type: "paragraph", content });
const book = (...content: object[]) => Node.fromJSON(schema, { type: "doc", content });

describe("countBook", () => {
  it("counts words and characters, spaces included", () => {
    expect(countBook(book(p(text("It rained all day."))))).toEqual({ words: 4, characters: 18 });
  });

  it("keeps words in separate paragraphs apart", () => {
    expect(countBook(book(p(text("One")), p(text("two"))))).toEqual({ words: 2, characters: 6 });
  });

  it("keeps words either side of a line break apart", () => {
    expect(countBook(book(p(text("One"), { type: "hardBreak" }, text("two")))).words).toBe(2);
  });

  it("counts a footnote's words but not its marker", () => {
    const note = { type: "footnote", attrs: { note: [text("A debt of honor.")] } };
    expect(countBook(book(p(text("She paid."), note, text(" Then."))))).toEqual({ words: 7, characters: 31 });
  });

  it("counts headings and Cyrillic", () => {
    const heading = { type: "heading", attrs: { level: 1 }, content: [text("Глава вторая")] };
    expect(countBook(book(heading))).toEqual({ words: 2, characters: 12 });
  });

  it("counts an emoji as one character", () => {
    expect(countBook(book(p(text("🙂")))).characters).toBe(1);
  });

  it("gives zero for an empty book", () => {
    expect(countBook(book(p()))).toEqual({ words: 0, characters: 0 });
  });
});
