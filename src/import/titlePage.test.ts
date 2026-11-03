import { describe, expect, it } from "vitest";
import { importDocx } from "./index";
import { blocks, makeDocx, paragraph, plainText } from "./test-helpers";

const LONG = "The rain kept falling on the town through the night and the morning, and nobody in the market could remember a wetter spring than this one.";

async function book(body: string[], fileName = "a.docx") {
  const result = await importDocx(makeDocx(body), { fileName, saveImage: async () => "" });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const firstLine = async (body: string[], fileName?: string) => plainText(blocks((await book(body, fileName)).content)[0]);

describe("typed title page lines", () => {
  it("moves Word's Title and Subtitle lines to the title page", async () => {
    const result = await book([paragraph("The Ledger", { style: "Title" }), paragraph("A Novel", { style: "Subtitle" }), paragraph(LONG)]);
    expect(result.title).toBe("The Ledger");
    expect(result.subtitle).toBe("A Novel");
    expect(plainText(blocks(result.content)[0])).toBe(LONG);
  });

  it("moves an opening line that matches the file name", async () => {
    const result = await book([paragraph("THE LEDGER"), paragraph(LONG)], "The Ledger.docx");
    expect(result.title).toBe("THE LEDGER");
    expect(plainText(blocks(result.content)[0])).toBe(LONG);
  });

  it("moves a by-line to the author", async () => {
    const result = await book([paragraph("The Ledger", { style: "Title" }), paragraph("by Ana María Ruiz"), paragraph(LONG)]);
    expect(result.author).toBe("Ana María Ruiz");
    expect(plainText(blocks(result.content)[0])).toBe(LONG);
  });

  it("recognises a by-line in other languages", async () => {
    const result = await book([paragraph("La lluvia", { style: "Title" }), paragraph("Por Ana Ruiz"), paragraph(LONG)]);
    expect(result.author).toBe("Ana Ruiz");
  });

  it("reports what moved and lists it for the word check", async () => {
    const result = await book([paragraph("The Ledger", { style: "Title" }), paragraph("by Ana Ruiz"), paragraph(LONG)]);
    expect(result.notices).toContainEqual({ kind: "title", near: "" });
    expect(result.movedToPages).toEqual(["The Ledger", "by Ana Ruiz"]);
  });

  it("leaves a later Title-styled line as a heading", async () => {
    const body = [paragraph("The Ledger", { style: "Title" }), paragraph(LONG), paragraph("Part Two", { style: "Title" }), paragraph(LONG)];
    expect(blocks((await book(body)).content).map(plainText)).toContain("Part Two");
  });

  it("leaves a Title-styled line once the text has started", async () => {
    const result = await book([paragraph(LONG), paragraph("Part Two", { style: "Title" }), paragraph(LONG)]);
    expect(blocks(result.content).map(plainText)).toContain("Part Two");
  });

  it("leaves a Subtitle-styled line that doesn't follow the title", async () => {
    const body = [paragraph("The Ledger", { style: "Title" }), paragraph(LONG), paragraph("Part One", { style: "Subtitle" }), paragraph(LONG)];
    const result = await book(body);
    expect(result.subtitle).toBeUndefined();
    expect(blocks(result.content).map(plainText)).toContain("Part One");
  });

  it("leaves a heading that reads like a by-line", async () => {
    const result = await book([paragraph("The Ledger", { style: "Title" }), paragraph("By The Sea", { style: "Heading1" }), paragraph(LONG)]);
    expect(result.author).toBeUndefined();
    expect(blocks(result.content).map(plainText)).toContain("By The Sea");
  });

  it("leaves a sentence that looks like a by-line", async () => {
    expect(await firstLine([paragraph("The Ledger", { style: "Title" }), paragraph("Por fin llegó el barco."), paragraph(LONG)])).toBe("Por fin llegó el barco.");
  });

  it("leaves an opening line that isn't the title", async () => {
    expect(await firstLine([paragraph("A short opening."), paragraph(LONG)], "The Ledger.docx")).toBe("A short opening.");
  });

  it("keeps a title that is all the file holds", async () => {
    expect(await firstLine([paragraph("The Ledger", { style: "Title" })])).toBe("The Ledger");
  });

  it("adds no notice when nothing moved", async () => {
    expect((await book([paragraph(LONG)])).notices).toEqual([]);
  });
});
