import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { importDocx, type ImportedBook } from "./index";
import {
  blocks,
  blockTypes,
  footnoteReference,
  IMAGE,
  makeDocx,
  normalize,
  PAGE_BREAK,
  paragraph,
  plainText,
  run,
  TAB,
} from "./test-helpers";

const noImages = async () => "unused";

async function imported(body: string[], options?: Parameters<typeof makeDocx>[1], fileName = "My Novel.docx") {
  const result = await importDocx(makeDocx(body, options), { fileName, saveImage: noImages });
  if (!result.ok) throw new Error(`Import failed: ${result.reason}`);
  return result;
}

async function expectSameWords(body: string[], book: ImportedBook) {
  const raw = await mammoth.extractRawText({ buffer: Buffer.from(makeDocx(body)) });
  expect(normalize(plainText(book.content))).toBe(normalize(raw.value));
}

const marksOn = (book: ImportedBook, text: string) => {
  const found = blocks(book.content)
    .flatMap((block) => block.content ?? [])
    .find((node) => node.text === text);
  return found?.marks?.map((mark) => mark.type);
};

describe("importing a Word file", () => {
  it("keeps every word of a mixed manuscript in order", async () => {
    const body = [
      paragraph("The Rain Ledger", { style: "Title" }),
      paragraph("Chapter One", { style: "Heading1" }),
      paragraph(`${TAB}It rained for the third day.`),
      paragraph(run("She counted the coins", { font: "Comic Sans" })),
      paragraph(),
      paragraph("Nobody came to the door."),
      paragraph("Глава вторая", { style: "Heading1" }),
      paragraph("Дождь шёл три дня.", { align: "both" }),
    ];
    const book = await imported(body);
    const raw = await mammoth.extractRawText({ buffer: Buffer.from(makeDocx(body)) });
    expect(book.title).toBe("The Rain Ledger");
    expect(normalize(plainText(book.content))).toBe(normalize(raw.value).replace("The Rain Ledger ", ""));
  });

  it("removes fonts, sizes and colors", async () => {
    const book = await imported([
      paragraph(run("Loud words", { font: "Comic Sans" })),
      paragraph(run("Quiet words", { font: "Times New Roman" })),
    ]);
    expect(JSON.stringify(book.content)).not.toMatch(/Comic|Times|fontFamily|fontSize|color/);
  });

  it("removes tabs used for indents and keeps paragraphs separate", async () => {
    const book = await imported([paragraph(`${TAB}${run("First.")}`), paragraph(`${TAB}${run("Second.")}`)]);
    expect(blocks(book.content).map(plainText)).toEqual(["First.", "Second."]);
  });

  it("turns Word headings into headings with no suggestion", async () => {
    const book = await imported([
      paragraph("Part One", { style: "Heading1" }),
      paragraph("A section", { style: "Heading2" }),
    ]);
    expect(blocks(book.content).map((block) => [block.type, block.attrs?.level])).toEqual([
      ["heading", 1],
      ["heading", 2],
    ]);
  });

  it("removes blank lines that separate most paragraphs", async () => {
    const book = await imported([
      paragraph("One."),
      paragraph(),
      paragraph("Two."),
      paragraph(),
      paragraph("Three."),
    ]);
    expect(blockTypes(book.content)).toEqual(["paragraph", "paragraph", "paragraph"]);
  });

  it("turns occasional blank lines into scene breaks", async () => {
    const body = Array.from({ length: 200 }, (_, i) => paragraph(`Paragraph ${i}.`));
    for (const position of [150, 100, 50]) body.splice(position, 0, paragraph());
    const book = await imported(body);
    expect(blockTypes(book.content).filter((type) => type === "horizontalRule")).toHaveLength(3);
  });

  describe("scene break limit", () => {
    const WORDY = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const sceneBreaksIn = async (paragraphs: number, text: string, breaks: number) => {
      const body = Array.from({ length: paragraphs }, () => paragraph(text));
      for (let i = breaks; i >= 1; i--) body.splice(i * 2, 0, paragraph());
      const book = await imported(body);
      expect(blockTypes(book.content).filter((type) => type === "paragraph")).toHaveLength(paragraphs);
      return blockTypes(book.content).filter((type) => type === "horizontalRule").length;
    };

    it("keeps a few scene breaks in a short work", async () => {
      expect(await sceneBreaksIn(20, "A short line.", 5)).toBe(5);
    });

    it("treats blank lines as spacing once a short work has too many", async () => {
      expect(await sceneBreaksIn(20, "A short line.", 6)).toBe(0);
    });

    it("keeps one scene break per 1,000 words in a long book", async () => {
      expect(await sceneBreaksIn(120, WORDY, 12)).toBe(12);
    });

    it("treats blank lines as spacing above one per 1,000 words, as in a play", async () => {
      expect(await sceneBreaksIn(120, WORDY, 13)).toBe(0);
    });
  });

  it("adds no scene break beside a heading", async () => {
    const body = Array.from({ length: 50 }, (_, i) => paragraph(`Paragraph ${i}.`));
    body.splice(25, 0, paragraph(), paragraph("Chapter Two", { style: "Heading1" }), paragraph());
    const book = await imported(body);
    expect(blockTypes(book.content)).not.toContain("horizontalRule");
  });

  it("drops a page break without leaving a blank paragraph", async () => {
    const body = Array.from({ length: 20 }, (_, i) => paragraph(`Paragraph ${i}.`));
    body.splice(10, 0, paragraph(PAGE_BREAK));
    const book = await imported(body);
    expect(blockTypes(book.content).every((type) => type === "paragraph")).toBe(true);
    expect(blocks(book.content)).toHaveLength(20);
  });

  it("keeps a centered poem's words, order and alignment", async () => {
    const body = [
      paragraph("Before the poem."),
      paragraph("Rain on the roof", { align: "center" }),
      paragraph("rain on the road", { align: "center" }),
      paragraph("After the poem."),
    ];
    const book = await imported(body);
    expect(blocks(book.content)[1].attrs?.textAlign).toBe("center");
    expect(blocks(book.content)[2].attrs?.textAlign).toBe("center");
    await expectSameWords(body, book);
  });

  it("treats justified text as the book default", async () => {
    const book = await imported([paragraph("Evenly set.", { align: "both" })]);
    expect(blocks(book.content)[0].attrs?.textAlign).toBeNull();
  });

  it("keeps a centered heading as a heading and a centered list as a list", async () => {
    const book = await imported(
      [
        paragraph("Chapter One", { style: "Heading1", align: "center" }),
        paragraph("First item", { list: true, align: "center" }),
      ],
      { list: true },
    );
    expect(blockTypes(book.content)).toEqual(["heading", "orderedList"]);
  });

  it("keeps bold, italic and underline on exactly the same words", async () => {
    const book = await imported([
      paragraph(run("plain ") + run("thought", { italic: true }) + run(" loud", { bold: true }) + run(" line", { underline: true })),
    ]);
    expect(marksOn(book, "thought")).toEqual(["italic"]);
    expect(marksOn(book, " loud")).toEqual(["bold"]);
    expect(marksOn(book, " line")).toEqual(["underline"]);
    expect(marksOn(book, "plain ")).toBeUndefined();
  });

  it("removes comments and accepts tracked changes", async () => {
    const tracked =
      run("Kept. ") +
      '<w:commentReference w:id="0"/>' +
      `<w:ins w:id="1" w:author="Ed">${run("Added.")}</w:ins>` +
      `<w:del w:id="2" w:author="Ed"><w:r><w:delText>Deleted.</w:delText></w:r></w:del>`;
    const book = await imported([paragraph(tracked)], { comments: { 0: "Fix this chapter" } });
    expect(normalize(plainText(book.content))).toBe("Kept. Added.");
  });

  it("takes the title from a Title paragraph", async () => {
    const book = await imported([paragraph("The Rain Ledger", { style: "Title" }), paragraph("Text.")]);
    expect(book.title).toBe("The Rain Ledger");
  });

  it("takes the title from the file name when there is no Title paragraph", async () => {
    expect((await imported([paragraph("Text.")])).title).toBe("My Novel");
  });

  it("saves images and keeps them in place", async () => {
    const saved: Blob[] = [];
    const file = makeDocx([paragraph("Before."), paragraph(IMAGE), paragraph("After.")], { image: "png" });
    const result = await importDocx(file, {
      fileName: "a.docx",
      saveImage: async (image) => {
        saved.push(image);
        return "asset-1";
      },
    });
    if (!result.ok) throw new Error(result.reason);
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe("image/png");
    const image = blocks(result.content)[1];
    expect(image.type).toBe("bookImage");
    expect(image.attrs).toMatchObject({ assetId: "asset-1", mimeType: "image/png", alt: "A red dot" });
  });

  it("keeps a centered image centered", async () => {
    const file = makeDocx([paragraph("Text."), paragraph(IMAGE, { align: "center" })], { image: "png" });
    const result = await importDocx(file, { fileName: "a.docx", saveImage: async () => "asset" });
    if (!result.ok) throw new Error(result.reason);
    expect(blocks(result.content)[1]).toMatchObject({ type: "bookImage", attrs: { textAlign: "center" } });
  });

  it("leaves no empty line around an image in a bold run", async () => {
    const boldImage = IMAGE.replace("<w:r>", "<w:r><w:rPr><w:b/></w:rPr>");
    const file = makeDocx([paragraph("Before."), paragraph(boldImage)], { image: "png" });
    const result = await importDocx(file, { fileName: "a.docx", saveImage: async () => "asset" });
    if (!result.ok) throw new Error(result.reason);
    expect(blockTypes(result.content)).toEqual(["paragraph", "bookImage"]);
  });

  it("imports a file holding only images", async () => {
    const file = makeDocx([paragraph(IMAGE + IMAGE)], { image: "png" });
    const result = await importDocx(file, { fileName: "a.docx", saveImage: async () => "asset" });
    if (!result.ok) throw new Error(result.reason);
    expect(blockTypes(result.content)).toEqual(["bookImage", "bookImage"]);
  });

  it("removes an empty line in a heading style", async () => {
    const book = await imported([
      paragraph("Text."),
      paragraph("", { style: "Heading1" }),
      paragraph("More text."),
    ]);
    expect(blockTypes(book.content)).not.toContain("heading");
  });

  it("keeps text that shares a paragraph with a page break, and its alignment", async () => {
    const body = [
      paragraph("End of scene."),
      paragraph(PAGE_BREAK + run("The Flood"), { align: "center" }),
      paragraph("It rained."),
    ];
    const book = await imported(body);
    expect(blocks(book.content).map(plainText)).toEqual(["End of scene.", "The Flood", "It rained."]);
    expect(blocks(book.content)[1].attrs?.textAlign).toBe("center");
  });

  it("splits a paragraph at a page break in the middle of it", async () => {
    const book = await imported([paragraph(run("Before.") + PAGE_BREAK + run("After."))]);
    expect(blocks(book.content).map(plainText)).toEqual(["Before.", "After."]);
  });

  it("leaves footnote markers out of the title", async () => {
    const file = [paragraph(run("The Ledger") + footnoteReference(1), { style: "Title" }), paragraph("Text.")];
    expect((await imported(file, { footnotes: { 1: "A note." } })).title).toBe("The Ledger");
  });

  it("returns a failure and no book for a file that isn't a Word file", async () => {
    const result = await importDocx(new TextEncoder().encode("not a word file"), {
      fileName: "a.docx",
      saveImage: noImages,
    });
    expect(result).toEqual({ ok: false, reason: "unreadable" });
  });

  it("returns a failure and no book for an empty document", async () => {
    const result = await importDocx(makeDocx([paragraph()]), { fileName: "a.docx", saveImage: noImages });
    expect(result).toEqual({ ok: false, reason: "empty" });
  });
});
