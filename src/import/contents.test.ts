import { describe, expect, it } from "vitest";
import { importDocx } from "./index";
import { blocks, makeDocx, paragraph, plainText } from "./test-helpers";

const LONG = "The rain kept falling on the town through the night and the morning, and nobody in the market could remember a wetter spring than this one.";

async function book(body: string[]) {
  const result = await importDocx(makeDocx(body), { fileName: "a.docx", saveImage: async () => "" });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const texts = async (body: string[]) => blocks((await book(body)).content).map(plainText);
const chapter = (title: string) => [paragraph(title), paragraph(LONG)];

describe("a typed table of contents", () => {
  const typed = ["Contents", "I. THE LOVERS", "II. THE FOOL", "III. THE TOWER"].map((line) => paragraph(line));
  const chapters = [...chapter("I. THE LOVERS"), ...chapter("II. THE FOOL"), ...chapter("III. THE TOWER")];

  it("is taken out of the book", async () => {
    expect(await texts([paragraph(LONG), ...typed, ...chapters])).toEqual([
      LONG,
      "I. THE LOVERS",
      LONG,
      "II. THE FOOL",
      LONG,
      "III. THE TOWER",
      LONG,
    ]);
  });

  it("is reported to the author", async () => {
    const { notices } = await book([...typed, ...chapters]);
    expect(notices).toContainEqual({ kind: "contents", near: "" });
  });

  it("leaves a marker where the book's contents page goes, with the author's own title", async () => {
    const { content } = await book([paragraph(LONG), ...typed, ...chapters]);
    expect(blocks(content)[1].attrs?.contentsHere).toBe("Contents");
    expect(blocks(content).filter((block) => block.attrs?.contentsHere)).toHaveLength(1);
  });

  it("recognises other languages and page numbers", async () => {
    const list = ["Índice", "Primero .... 3", "Segundo 12", "Tercero\t40"].map((line) => paragraph(line));
    const body = [...list, ...chapter("Primero"), ...chapter("Segundo"), ...chapter("Tercero")];
    expect((await texts(body))[0]).toBe("Primero");
  });

  it("ignores differences in punctuation between an entry and its chapter", async () => {
    const list = ["Contents", "Author’s note", "The rain", "The end"].map((line) => paragraph(line));
    const body = [...list, ...chapter("Author´s note"), ...chapter("The rain"), ...chapter("The end")];
    expect((await texts(body))[0]).toBe("Author´s note");
  });

  it("keeps a dedication between the list and the first chapter", async () => {
    const body = [...typed, paragraph("For my mother, who stayed."), paragraph("Thanks to Ana."), ...chapters];
    expect((await texts(body)).slice(0, 3)).toEqual(["For my mother, who stayed.", "Thanks to Ana.", "I. THE LOVERS"]);
  });

  it("takes out chapter lines that differ only by number, with or without page numbers", async () => {
    const plain = ["Contents", "Prologue", "Chapter 1", "Chapter 2", "Chapter 3"].map((line) => paragraph(line));
    const paged = ["Contents", "Chapter 1 .... 3", "Chapter 2 .... 9", "Chapter 3 .... 15"].map((line) => paragraph(line));
    const later = ["Prologue", "Chapter 1", "Chapter 2", "Chapter 3"].flatMap(chapter);
    expect((await texts([...plain, ...later]))[0]).toBe("Prologue");
    expect((await texts([...plain, ...later])).filter((line) => line === "Chapter 2")).toHaveLength(1);
    expect((await texts([...paged, ...later]))[0]).toBe("Prologue");
  });

  it("takes out a list made with Word numbering", async () => {
    const list = ["Rain", "Market", "Flood"].map((line) => paragraph(line, { list: true }));
    const body = [paragraph("Contents"), ...list, ...chapter("Rain"), ...chapter("Market"), ...chapter("Flood")];
    const file = makeDocx(body, { list: true });
    const result = await importDocx(file, { fileName: "a.docx", saveImage: async () => "" });
    if (!result.ok) throw new Error(result.reason);
    expect(blocks(result.content).map(plainText)[0]).toBe("Rain");
    expect(result.removedContents).toEqual(["Contents", "Rain", "Market", "Flood"]);
  });

  it("leaves no scene breaks behind where the list was", async () => {
    const spaced = ["Contents", "The Rain", "The Market", "The Flood"].flatMap((line) => [paragraph(line), paragraph()]);
    const body = [...spaced, ...["The Rain", "The Market", "The Flood"].flatMap(chapter)];
    expect(blocks((await book(body)).content)[0].type).toBe("paragraph");
    expect(blocks((await book(body)).content).map((block) => block.type)).not.toContain("horizontalRule");
  });

  it("is found without a title when its entries follow the book in order", async () => {
    const titles = ["The Rain", "The Market", "The Flood", "The Ledger", "The Road", "The Sea"];
    const list = titles.map((line) => paragraph(line));
    const body = [paragraph(LONG), ...list, ...titles.flatMap((title) => [...chapter(title), paragraph(LONG), paragraph(LONG)])];
    expect((await texts(body))[1]).toBe("The Rain");
    expect((await texts(body)).filter((line) => line === "The Rain")).toHaveLength(1);
  });
});

describe("text that only looks like a table of contents", () => {
  it("keeps repeated lines in the middle of a book, such as a play's speakers", async () => {
    const speakers = ["ANA", "PEDRO", "ANA", "PEDRO", "LUIS", "ANA", "LUIS", "PEDRO", "ANA", "PEDRO"].flatMap((name) => [paragraph(name), paragraph("Short line.")]);
    const opening = Array.from({ length: 30 }, () => paragraph(LONG));
    const body = [...opening, ...speakers];
    expect(await texts(body)).toHaveLength(body.length);
  });

  it("keeps a play's cast list", async () => {
    const names = ["ANA", "PEDRO", "LUIS", "MARIA", "JUAN"];
    const scenes = Array.from({ length: 12 }, (_, i) => [paragraph(names[i % 5]), paragraph("A line of speech.")]).flat();
    const body = [paragraph("Personajes"), ...names.map((name) => paragraph(name)), paragraph(LONG), ...scenes];
    expect((await texts(body)).slice(0, 3)).toEqual(["Personajes", "ANA", "PEDRO"]);
  });

  it("keeps a short list with a Contents title that matches nothing later", async () => {
    const body = [paragraph("Contents:"), paragraph("A map"), paragraph("Two dice"), paragraph("A pencil"), paragraph(LONG)];
    expect(await texts(body)).toHaveLength(body.length);
  });

  it("keeps a chapter called Contents whose lines aren't entries", async () => {
    const body = [...chapter("Before"), paragraph("Contents"), paragraph("A short line."), paragraph("Another one."), paragraph("And a third."), paragraph(LONG)];
    expect(await texts(body)).toHaveLength(body.length);
  });

  it("adds no notice to a book without one", async () => {
    expect((await book(chapter("Chapter 1"))).notices).toEqual([]);
  });
});
