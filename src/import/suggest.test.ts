import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { importDocx } from "./index";
import { blocks, makeDocx, normalize, PAGE_BREAK, paragraph, plainText, run } from "./test-helpers";

const LONG = "The rain kept falling on the town through the night and the morning, and nobody in the market could remember a wetter spring than this one.";

async function book(body: string[]) {
  const result = await importDocx(makeDocx(body), { fileName: "a.docx", saveImage: async () => "" });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const suggestedHeadings = async (body: string[]) =>
  blocks((await book(body)).content)
    .filter((block) => block.attrs?.suggestHeading)
    .map(plainText);

const alignSuggestion = async (body: string[], index: number) =>
  blocks((await book(body)).content)[index].attrs?.suggestAlign;

describe("chapter suggestions", () => {
  it("suggests typed chapter lines and leaves them as ordinary paragraphs", async () => {
    const body = ["Chapter 1", LONG, "Глава 2", LONG, "Prologue", LONG, "Chapter 3: The Ledger", LONG].map((text) =>
      paragraph(text),
    );
    expect(await suggestedHeadings(body)).toEqual(["Chapter 1", "Глава 2", "Prologue", "Chapter 3: The Ledger"]);
    const types = blocks((await book(body)).content).map((block) => block.type);
    expect(new Set(types)).toEqual(new Set(["paragraph"]));
  });

  it("suggests a bare number on its own line", async () => {
    expect(await suggestedHeadings([paragraph("1"), paragraph(LONG), paragraph("IV"), paragraph(LONG)])).toEqual([
      "1",
      "IV",
    ]);
  });

  it("suggests a bare number with a period", async () => {
    expect(await suggestedHeadings([paragraph("1."), paragraph(LONG), paragraph("IV."), paragraph(LONG)])).toEqual([
      "1.",
      "IV.",
    ]);
  });

  it("leaves short sentences alone even if they start with a chapter word or look like numerals", async () => {
    const body = ["Book closed.", "Книга упала.", "Civil.", LONG].map((text) => paragraph(text));
    expect(await suggestedHeadings(body)).toEqual([]);
  });

  it("suggests a chapter line that shares a paragraph with its page break", async () => {
    const body = [paragraph(LONG), paragraph(PAGE_BREAK + run("The Long Road Home")), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["The Long Road Home"]);
  });

  it("suggests a short line that opens a new page", async () => {
    const body = [paragraph(LONG), paragraph(PAGE_BREAK), paragraph("The Long Road Home"), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["The Long Road Home"]);
  });

  it("suggests a short bold centered line", async () => {
    const body = [paragraph(LONG), paragraph(run("The Flood", { bold: true }), { align: "center" }), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["The Flood"]);
  });

  it("leaves a sentence that starts with the word chapter alone", async () => {
    expect(await suggestedHeadings([paragraph("Chapter one of my life began when the rain stopped."), paragraph(LONG)])).toEqual([]);
  });

  it("leaves a short line of dialogue alone", async () => {
    expect(await suggestedHeadings([paragraph(LONG), paragraph("“No,” she said."), paragraph(LONG)])).toEqual([]);
  });

  it("suggests a numeral followed by a title in capitals", async () => {
    const body = [paragraph("I. THE LOVERS"), paragraph(LONG), paragraph("XII.  THE HANGED MAN"), paragraph(LONG), paragraph("3) THE FOOL"), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["I. THE LOVERS", "XII. THE HANGED MAN", "3) THE FOOL"]);
  });

  it("suggests a numbered title that trails off", async () => {
    expect(await suggestedHeadings([paragraph("XX. THE LAST WORD..."), paragraph(LONG)])).toEqual(["XX. THE LAST WORD..."]);
  });

  it("leaves numbered points alone", async () => {
    const body = [paragraph("1. Buy some bread"), paragraph(LONG), paragraph("I. AGREE."), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual([]);
  });

  it("suggests Spanish chapter lines", async () => {
    const body = ["Capítulo 1", LONG, "Capítulo segundo", LONG, "Prólogo", LONG, "Epílogo", LONG].map((text) => paragraph(text));
    expect(await suggestedHeadings(body)).toEqual(["Capítulo 1", "Capítulo segundo", "Prólogo", "Epílogo"]);
  });

  it("still suggests clear chapter lines in a book that marked some headings", async () => {
    const body = [paragraph("Foreword", { style: "Heading1" }), paragraph(LONG), paragraph("I. THE LOVERS"), paragraph(LONG), paragraph("Chapter 2"), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["I. THE LOVERS", "Chapter 2"]);
  });

  it("doesn't guess from formatting in a book that marked some headings", async () => {
    const body = [
      paragraph("Foreword", { style: "Heading1" }),
      paragraph(LONG),
      paragraph(PAGE_BREAK + run("A Short Line")),
      paragraph(LONG),
      paragraph(run("The Flood", { bold: true }), { align: "center" }),
      paragraph(LONG),
    ];
    expect(await suggestedHeadings(body)).toEqual([]);
  });

  it("skips a typed table of contents and suggests the chapters themselves", async () => {
    const contents = ["I. THE LOVERS", "II. THE FOOL", "III. THE TOWER"].map((text) => paragraph(text));
    const chapters = ["I. THE LOVERS", "II. THE FOOL", "III. THE TOWER"].flatMap((text) => [paragraph(text), paragraph(LONG)]);
    const lines = blocks((await book([...contents, ...chapters])).content).map((block) => !!block.attrs?.suggestHeading);
    expect(lines).toEqual([false, false, false, true, false, true, false, true, false]);
  });

  it("counts text under a subheading as part of the chapter", async () => {
    const body = [paragraph("Foreword", { style: "Heading1" }), paragraph(LONG), paragraph("I. THE LOVERS"), paragraph("A subtitle", { style: "Heading2" }), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["I. THE LOVERS"]);
  });

  it("leaves a chapter line alone when no text follows it", async () => {
    expect(await suggestedHeadings([paragraph(LONG), paragraph("Chapter 9"), paragraph("The end")])).toEqual([]);
  });

  it("still suggests chapters when the only Word heading style is the book title", async () => {
    const body = [paragraph("The Ledger", { style: "Title" }), paragraph("Chapter 1"), paragraph(LONG)];
    expect(await suggestedHeadings(body)).toEqual(["Chapter 1"]);
  });

  it("still suggests chapters in a book with a subtitle", async () => {
    const body = [
      paragraph("The Ledger", { style: "Title" }),
      paragraph("A Novel", { style: "Subtitle" }),
      paragraph("Chapter 1"),
      paragraph(LONG),
    ];
    expect(await suggestedHeadings(body)).toEqual(["Chapter 1"]);
  });

  it("suggests nothing in a book with no chapters", async () => {
    expect(await suggestedHeadings([paragraph(LONG), paragraph(LONG)])).toEqual([]);
  });
});

describe("alignment suggestions", () => {
  it("suggests aligning a long centered paragraph with the rest of the book, and doesn't apply it", async () => {
    const body = [paragraph(LONG), paragraph(LONG), paragraph(LONG, { align: "center" }), paragraph(LONG)];
    const third = blocks((await book(body)).content)[2];
    expect(third.attrs).toMatchObject({ suggestAlign: "left", textAlign: "center" });
  });

  it("leaves short centered lines such as a poem alone", async () => {
    const body = [paragraph(LONG), paragraph("Rain on the roof", { align: "center" }), paragraph(LONG)];
    expect(await alignSuggestion(body, 1)).toBeNull();
  });

  it("suggests nothing when a book is consistently centered", async () => {
    const body = [paragraph(LONG, { align: "center" }), paragraph(LONG, { align: "center" })];
    expect(await alignSuggestion(body, 0)).toBeNull();
  });
});

it("changes no words when adding suggestions", async () => {
  const body = [paragraph("Chapter 1"), paragraph(LONG, { align: "center" }), paragraph(LONG), paragraph(LONG)];
  const raw = await mammoth.extractRawText({ buffer: Buffer.from(makeDocx(body)) });
  expect(normalize(plainText((await book(body)).content))).toBe(normalize(raw.value));
});

describe("chapter subtitles", () => {
  const types = async (body: string[]) => blocks((await book(body)).content).map((block) => block.type);
  const suggested = async (body: string[]) =>
    blocks((await book(body)).content)
      .filter((block) => block.attrs?.suggestSubtitle)
      .map(plainText);

  it("keeps a line in Word's Subtitle style under a chapter as its subtitle", async () => {
    const body = [paragraph("Chapter 1", { style: "Heading1" }), paragraph("A rainy night", { style: "Subtitle" }), paragraph(LONG)];
    expect(await types(body)).toEqual(["heading", "subtitle", "paragraph"]);
  });

  it("still takes the book's own subtitle to the title page", async () => {
    const result = await book([paragraph("The Ledger", { style: "Title" }), paragraph("A novel", { style: "Subtitle" }), paragraph(LONG)]);
    expect(result.subtitle).toBe("A novel");
    expect(blocks(result.content).map((block) => block.type)).toEqual(["paragraph"]);
  });

  it("suggests a Word H2 right under a chapter heading", async () => {
    const body = [paragraph("I. THE LOVERS", { style: "Heading1" }), paragraph("Not enough", { style: "Heading2" }), paragraph(LONG)];
    expect(await suggested(body)).toEqual(["Not enough"]);
    expect(await types(body)).toEqual(["heading", "heading", "paragraph"]);
  });

  it("suggests a short italic line under a chapter heading", async () => {
    const body = [paragraph("Chapter 1", { style: "Heading1" }), paragraph(run("A rainy night", { italic: true })), paragraph(LONG)];
    expect(await suggested(body)).toEqual(["A rainy night"]);
  });

  it("doesn't suggest a chapter's first sentence, or a section that starts a chapter of its own", async () => {
    expect(await suggested([paragraph("Chapter 1", { style: "Heading1" }), paragraph(run("It rained.", { italic: true })), paragraph(LONG)])).toEqual([]);
    expect(await suggested([paragraph("Part One", { style: "Heading1" }), paragraph("Chapter 1", { style: "Heading2" }), paragraph(LONG)])).toEqual([]);
    expect(await suggested([paragraph("Chapter 1", { style: "Heading1" }), paragraph("Short plain line"), paragraph(LONG)])).toEqual([]);
    expect(await suggested([paragraph("ACT I", { style: "Heading1" }), paragraph(run("Scene 2", { italic: true })), paragraph(LONG)])).toEqual([]);
  });
});
