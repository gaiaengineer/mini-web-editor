import type { JSONContent } from "@tiptap/core";
import { strFromU8, unzipSync } from "fflate";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { importDocx } from "@/import";
import { blocks, normalize, plainText } from "@/import/test-helpers";
import { buildDocx, type WordImages } from "./index";

const text = (value: string, ...marks: string[]) => ({
  type: "text",
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const p = (...content: object[]) => ({ type: "paragraph", content });
const doc = (...content: object[]): JSONContent => ({ type: "doc", content });
const meta = { title: "The Ledger", author: "A. Writer" };

const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
const image = { type: "bookImage", attrs: { assetId: "a1", mimeType: "image/png", alt: "A map", textAlign: "center" } };
const images: WordImages = new Map([["a1", { bytes: PIXEL, type: "image/png", width: 1, height: 1 }]]);

const documentXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)["word/document.xml"]);

async function html(bytes: Uint8Array) {
  return (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
}

async function readBack(bytes: Uint8Array) {
  const stored: Blob[] = [];
  const result = await importDocx(bytes, {
    fileName: "back.docx",
    saveImage: async (blob) => {
      stored.push(blob);
      return "stored";
    },
  });
  if (!result.ok) throw new Error(result.reason);
  return { ...result, stored };
}

describe("buildDocx", () => {
  it("keeps accepted chapters, italics, a centered line and an image, with no suggestion", async () => {
    const book = doc(
      { type: "heading", attrs: { level: 1 }, content: [text("The Flood")] },
      p(text("It "), text("really", "italic"), text(" rained.")),
      { type: "paragraph", attrs: { textAlign: "center" }, content: [text("A centered line")] },
      image,
      { type: "paragraph", attrs: { suggestHeading: true, suggestAlign: "left" }, content: [text("Waiting line")] },
    );
    const { bytes } = await buildDocx(book, meta, images);
    const back = await readBack(bytes);
    const kinds = blocks(back.content);
    expect(kinds.find((block) => plainText(block) === "The Flood")).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(JSON.stringify(back.content)).toContain('"italic"');
    expect(kinds.find((block) => plainText(block) === "A centered line")?.attrs?.textAlign).toBe("center");
    expect(back.stored).toHaveLength(1);
    const waiting = kinds.find((block) => plainText(block) === "Waiting line");
    expect(waiting?.type).toBe("paragraph");
    expect(documentXml(bytes)).not.toMatch(/suggest/i);
  });

  it("keeps every word in order, including Cyrillic", async () => {
    const book = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Глава вторая")] },
      p(text("Дождь шёл три дня. "), text("Bold", "bold"), { type: "hardBreak" }, text("next line")),
      { type: "blockquote", content: [p(text("A quoted line"))] },
    );
    const raw = await mammoth.extractRawText({ buffer: Buffer.from((await buildDocx(book, { title: "", author: "" })).bytes) });
    expect(normalize(raw.value).replace(/\s/g, "")).toBe(
      "Глававторая Дождьшёлтридня.Boldnextline Aquotedline".replace(/\s/g, ""),
    );
  });

  describe("generated pages", () => {
    const h = (value: string) => ({ type: "heading", attrs: { level: 1 }, content: [text(value)] });
    const pages = { ...meta, subtitle: "A novel", copyright: { year: "2019", isbn: "123" } };

    it("opens with the title page and copyright page, once each", async () => {
      const opening = doc(h("The Ledger"), p(text("Words.")));
      const raw = await mammoth.extractRawText({ buffer: Buffer.from((await buildDocx(opening, pages)).bytes) });
      expect(normalize(raw.value)).toBe("The Ledger A novel A. Writer © 2019 A. Writer. All rights reserved. ISBN 123 Words.");
    });

    it("adds a table of contents with its chapters already filled in", async () => {
      const { bytes } = await buildDocx(doc(h("One"), p(text("x")), h("Two"), p(text("y"))), pages);
      const xml = documentXml(bytes);
      expect(xml).toContain("TOC ");
      expect(xml.indexOf(">One<")).toBeLessThan(xml.lastIndexOf(">One<"));
      expect(xml.indexOf("ISBN 123")).toBeLessThan(xml.indexOf("TOC "));
    });

    it("has no table of contents with fewer than two chapters", async () => {
      expect(documentXml((await buildDocx(doc(p(text("Words."))), pages)).bytes)).not.toContain("TOC ");
    });

    it("starts the main text on a new page", async () => {
      const { bytes } = await buildDocx(doc(p(text("Words."))), pages);
      expect(documentXml(bytes)).toContain('w:type="page"');
    });
  });

  it("writes lists as lists", async () => {
    const item = (value: string) => ({ type: "listItem", content: [p(text(value))] });
    const book = doc(
      { type: "bulletList", content: [item("Bread"), item("Salt")] },
      { type: "orderedList", content: [item("First"), item("Second")] },
    );
    const page = await html((await buildDocx(book, { title: "", author: "" })).bytes);
    expect(page).toContain("<ul><li>Bread</li><li>Salt</li></ul>");
    expect(page).toContain("<ol><li>First</li><li>Second</li></ol>");
  });

  it("keeps a link's address and drops an unsafe one", async () => {
    const link = (href: string, value: string) => ({ ...text(value), marks: [{ type: "link", attrs: { href } }] });
    const book = doc(p(link("https://example.com/", "Example"), text(" "), link("javascript:alert(1)", "Bad")));
    const page = await html((await buildDocx(book, { title: "", author: "" })).bytes);
    expect(page).toContain('<a href="https://example.com/">Example</a>');
    expect(page).toContain("Bad");
    expect(page).not.toContain("javascript:");
  });

  it("keeps a scene break without adding any text", async () => {
    const book = doc(p(text("One.")), { type: "horizontalRule" }, p(text("Two.")));
    const raw = await mammoth.extractRawText({ buffer: Buffer.from((await buildDocx(book, { title: "", author: "" })).bytes) });
    expect(normalize(raw.value)).toBe("One. Two.");
  });

  it("writes a chapter subtitle in Word's Subtitle style, and reads it back as one", async () => {
    const book = doc({ type: "heading", attrs: { level: 1 }, content: [text("Chapter 1")] }, { type: "subtitle", content: [text("A rainy night")] }, p(text("It rained.")));
    const bytes = (await buildDocx(book, { title: "", author: "" })).bytes;
    expect(documentXml(bytes)).toMatch(/<w:pStyle w:val="Subtitle"\/>.*A rainy night/s);
    expect(blocks((await readBack(bytes)).content).map((block) => block.type)).toEqual(["heading", "subtitle", "paragraph"]);
  });

  it("writes footnotes as Word footnotes", async () => {
    const book = doc(p(text("She paid."), { type: "footnote", attrs: { note: [text("A debt of "), text("honor", "italic")] } }));
    const files = unzipSync((await buildDocx(book, { title: "", author: "" })).bytes);
    expect(strFromU8(files["word/document.xml"])).toContain("w:footnoteReference");
    const notes = strFromU8(files["word/footnotes.xml"]);
    expect(notes).toContain("A debt of ");
    expect(notes).toContain("honor");
    const back = await readBack((await buildDocx(book, { title: "", author: "" })).bytes);
    expect(JSON.stringify(back.content)).toContain('"type":"footnote"');
  });

  it("writes a scene break in the book's divider style", async () => {
    const book = doc(p(text("One.")), { type: "horizontalRule" }, p(text("Two.")));
    const page = await html((await buildDocx(book, { title: "", author: "", divider: "stars" })).bytes);
    expect(page).toContain("<p>One.</p><p>* * *</p><p>Two.</p>");
  });

  it("leaves out a missing image and counts it", async () => {
    const result = await buildDocx(doc(p(text("Words.")), image), { title: "", author: "" });
    expect(result.missingImages).toBe(1);
    expect((await readBack(result.bytes)).stored).toHaveLength(0);
  });

  it("limits a large image to the page width", async () => {
    const large: WordImages = new Map([["a1", { bytes: PIXEL, type: "image/png", width: 3000, height: 1500 }]]);
    const { bytes } = await buildDocx(doc(image), { title: "", author: "" }, large);
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(documentXml(bytes))!;
    expect(Number(cx)).toBe(576 * 9525);
    expect(Number(cy)).toBe(288 * 9525);
  });

  it("limits a tall image to the page height", async () => {
    const tall: WordImages = new Map([["a1", { bytes: PIXEL, type: "image/png", width: 1000, height: 2000 }]]);
    const { bytes } = await buildDocx(doc(image), { title: "", author: "" }, tall);
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(documentXml(bytes))!;
    expect(Number(cy)).toBe(860 * 9525);
    expect(Number(cx)).toBe(430 * 9525);
  });

  it("starts a numbered list where the book's list starts", async () => {
    const item = (value: string) => ({ type: "listItem", content: [p(text(value))] });
    const book = doc({ type: "orderedList", attrs: { start: 5 }, content: [item("Fifth"), item("Sixth")] }, p(text("Between.")), {
      type: "orderedList",
      content: [item("First")],
    });
    const files = unzipSync((await buildDocx(book, { title: "", author: "" })).bytes);
    expect(strFromU8(files["word/numbering.xml"])).toContain('<w:start w:val="5"/>');
  });

  it("marks only the runs that have emphasis", async () => {
    const xml = documentXml((await buildDocx(doc(p(text("Plain "), text("loud", "bold"))), { title: "", author: "" })).bytes);
    expect(xml).toContain("<w:b/>");
    expect(xml).not.toContain('w:val="false"');
  });

  it("builds a valid file for an empty book", async () => {
    const { bytes } = await buildDocx(doc(), { title: "", author: "" });
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe("PK");
    await expect(html(bytes)).resolves.toBeDefined();
  });
});
