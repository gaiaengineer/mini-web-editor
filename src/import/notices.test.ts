import type { JSONContent } from "@tiptap/core";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { importDocx } from "./index";
import {
  blockTypes,
  endnoteReference,
  footnoteReference,
  IMAGE,
  makeDocx,
  normalize,
  paragraph,
  plainText,
  run,
  table,
  textBox,
} from "./test-helpers";

async function book(body: string[], options?: Parameters<typeof makeDocx>[1]) {
  const result = await importDocx(makeDocx(body, options), { fileName: "a.docx", saveImage: async () => "" });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const rawText = async (body: string[], options?: Parameters<typeof makeDocx>[1]) =>
  normalize((await mammoth.extractRawText({ buffer: Buffer.from(makeDocx(body, options)) })).value);

describe("import notices", () => {
  describe("footnotes", () => {
    const footnotes = (content: Parameters<typeof plainText>[0]) =>
      JSON.stringify(content).match(/"type":"footnote"/g)?.length ?? 0;
    const notesOf = (content: JSONContent) =>
      (content.content ?? []).flatMap((block) => block.content ?? []).filter((node) => node.type === "footnote").map((node) => node.attrs?.note);

    it("become footnotes in place, holding their note, with no notice", async () => {
      const body = [
        paragraph("Chapter One", { style: "Heading1" }),
        paragraph(run("She paid the debt.") + footnoteReference(1) + run(" Then it rained.")),
      ];
      const result = await book(body, { footnotes: { 1: "A debt of honor." } });
      expect(result.notices).toEqual([]);
      expect(blockTypes(result.content)).toEqual(["heading", "paragraph"]);
      expect(notesOf(result.content)).toEqual([[{ type: "text", text: "A debt of honor." }]]);
      expect(normalize(plainText(result.content))).toBe("Chapter One She paid the debt. Then it rained.");
    });

    it("keep endnotes the same way", async () => {
      const result = await book([paragraph(run("She paid.") + endnoteReference(1))], { endnotes: { 1: "A debt of honor." } });
      expect(footnotes(result.content)).toBe(1);
      expect(notesOf(result.content)).toEqual([[{ type: "text", text: "A debt of honor." }]]);
      expect(JSON.stringify(result.content)).not.toContain("#endnote");
    });

    it("keep a note's italics", async () => {
      const note = run("See ") + run("The Ledger", { italic: true }) + run(".");
      const result = await book([paragraph(run("She paid.") + footnoteReference(1))], { footnotes: { 1: note } });
      expect(notesOf(result.content)[0]).toEqual([
        { type: "text", text: "See " },
        { type: "text", text: "The Ledger", marks: [{ type: "italic" }] },
        { type: "text", text: "." },
      ]);
    });

    it("leave no list of notes or divider behind", async () => {
      const body = [paragraph(run("One.") + footnoteReference(1)), paragraph(run("Two.") + footnoteReference(2))];
      const result = await book(body, { footnotes: { 1: "First.", 2: "Second." } });
      expect(blockTypes(result.content)).toEqual(["paragraph", "paragraph"]);
      expect(footnotes(result.content)).toBe(2);
    });
  });

  it("reports a table and keeps all its text", async () => {
    const body = [paragraph("Prices in the market."), table("Bread", "Two coins")];
    const result = await book(body);
    expect(result.notices).toEqual([{ kind: "table", near: "Prices in the market." }]);
    expect(normalize(plainText(result.content))).toBe(await rawText(body));
  });

  it("reports a text box and keeps its text once", async () => {
    const body = [paragraph("Before the sign."), paragraph(textBox("Closed for rain")), paragraph("After the sign.")];
    const result = await book(body);
    expect(result.notices).toEqual([{ kind: "textBox", near: "Closed for rain" }]);
    expect(plainText(result.content).match(/Closed for rain/g)).toHaveLength(1);
  });

  it("adds no scene break around a text box", async () => {
    const body = [paragraph("Before."), paragraph(textBox("Closed for rain")), paragraph("After.")];
    expect(blockTypes((await book(body)).content)).not.toContain("horizontalRule");
  });

  it("reports a text box with several paragraphs", async () => {
    const result = await book([paragraph("Before."), paragraph(textBox("Closed for rain", "Back on Monday"))]);
    expect(result.notices).toEqual([{ kind: "textBox", near: "Closed for rain" }]);
  });

  it("doesn't mistake an earlier paragraph containing the same words for the text box", async () => {
    const body = [paragraph("A sign said Closed and nothing else."), paragraph(textBox("Closed"))];
    expect((await book(body)).notices).toEqual([{ kind: "textBox", near: "Closed" }]);
  });

  it("tells the author when an image couldn't be saved", async () => {
    const file = makeDocx([paragraph("Before."), paragraph(IMAGE), paragraph("After.")], { image: "png" });
    const result = await importDocx(file, {
      fileName: "a.docx",
      saveImage: async () => {
        throw new Error("storage full");
      },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.notices).toEqual([{ kind: "image", near: "Before." }]);
    expect(blockTypes(result.content)).toEqual(["paragraph", "paragraph"]);
  });

  it("tells the author about an image format readers can't show, and doesn't save it", async () => {
    const saved: Blob[] = [];
    const file = makeDocx([paragraph("Before."), paragraph(IMAGE)], { image: "emf" });
    const result = await importDocx(file, {
      fileName: "a.docx",
      saveImage: async (image) => {
        saved.push(image);
        return "asset";
      },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(saved).toHaveLength(0);
    expect(result.notices).toEqual([{ kind: "image", near: "Before." }]);
  });

  it("names the nearest heading before the affected content", async () => {
    const body = [
      paragraph("Chapter Two", { style: "Heading1" }),
      paragraph("Some text."),
      paragraph("More text."),
      table("A cell"),
    ];
    expect((await book(body)).notices).toEqual([{ kind: "table", near: "Chapter Two" }]);
  });

  it("uses only the opening words of a long paragraph", async () => {
    const body = [paragraph("One two three four five six seven eight nine ten."), table("A cell")];
    expect((await book(body)).notices).toEqual([{ kind: "table", near: "One two three four five six…" }]);
  });

  it("reports nothing for a plain manuscript", async () => {
    expect((await book([paragraph("Just text.")])).notices).toEqual([]);
  });
});
