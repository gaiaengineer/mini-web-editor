import { describe, expect, it } from "vitest";
import { importDocx } from "./index";
import { blocks, makeDocx, paragraph, plainText } from "./test-helpers";

const LONG = "The rain kept falling on the town through the night and the morning, and nobody in the market could remember a wetter spring than this one, and the river rose until the bridge was gone and the road to the south lay under water for a week.";

async function book(body: string[]) {
  const result = await importDocx(makeDocx(body), { fileName: "a.docx", saveImage: async () => "" });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("typed copyright lines", () => {
  const body = ["© 2019 A. Writer. All rights reserved.", "ISBN 978-3-16-148410-0", "Printed in Spain.", "Chapter 1", LONG, "Chapter 2", LONG];
  const lines = body.map((line) => paragraph(line));

  it("move from the text to the copyright page", async () => {
    const result = await book(lines);
    expect(blocks(result.content).map(plainText)[0]).toBe("Printed in Spain.");
    expect(result.copyright).toEqual({ year: "2019", holder: "A. Writer", isbn: "978-3-16-148410-0" });
  });

  it("are reported to the author", async () => {
    expect((await book(lines)).notices).toContainEqual({ kind: "copyright", near: "" });
  });

  it("are listed for the word check", async () => {
    expect((await book(lines)).movedToPages).toEqual(["© 2019 A. Writer. All rights reserved.", "ISBN 978-3-16-148410-0"]);
  });

  it("keep wording they can't fit into a field", async () => {
    const result = await book(["Todos los derechos reservados por la editorial.", "Chapter 1", LONG].map((line) => paragraph(line)));
    expect(result.copyright?.note).toBe("Todos los derechos reservados por la editorial.");
    expect(blocks(result.content).map(plainText)[0]).toBe("Chapter 1");
  });

  it("stay when the main text has already started", async () => {
    const result = await book([LONG, "© 2019 A. Writer.", "Chapter 1", LONG].map((line) => paragraph(line)));
    expect(result.copyright).toBeUndefined();
    expect(blocks(result.content).map(plainText)[1]).toBe("© 2019 A. Writer.");
  });

  it("stay when a heading has already started the book", async () => {
    const result = await book(["Chapter 1", "All rights reserved, she said.", LONG].map((line) => paragraph(line)).map((line, i) => (i === 0 ? paragraph("Chapter 1", { style: "Heading1" }) : line)));
    expect(result.copyright).toBeUndefined();
  });

  it("stay when a line is dialogue or a list marker", async () => {
    const result = await book(["All rights reserved, she said.", "(a) first thing", "(c) third thing", LONG].map((line) => paragraph(line)));
    expect(result.copyright).toBeUndefined();
  });

  it.each([
    [["© 2019 A. Writer.", "All rights reserved."], { year: "2019", holder: "A. Writer" }],
    [["© 2019 Ана Рис. Все права защищены."], { year: "2019", holder: "Ана Рис" }],
    [["Copyright © 2019 by A. Writer"], { year: "2019", holder: "A. Writer" }],
    [["© 2019–2021 Ana Ruiz"], { year: "2019–2021", holder: "Ana Ruiz" }],
  ])("read %j cleanly", async (typed, details) => {
    const result = await book([...typed, LONG].map((line) => paragraph(line)));
    expect(result.copyright).toEqual(details);
  });

  it("split lines typed in one paragraph", async () => {
    const soft = paragraph('<w:r><w:t>© 2019 A. Writer</w:t><w:br/><w:t>ISBN 978-3-16-148410-0</w:t></w:r>');
    const result = await book([soft, paragraph(LONG)]);
    expect(result.copyright).toEqual({ year: "2019", holder: "A. Writer", isbn: "978-3-16-148410-0" });
  });

  it("stay when they're all the file holds", async () => {
    const result = await book([paragraph("© 2019 A. Writer. All rights reserved.")]);
    expect(blocks(result.content).map(plainText)).toEqual(["© 2019 A. Writer. All rights reserved."]);
  });

  it("stay when a line only mentions copyright", async () => {
    const result = await book(["She read the copyright page.", "Chapter 1", LONG].map((line) => paragraph(line)));
    expect(result.copyright).toBeUndefined();
    expect(result.notices).toEqual([]);
  });
});
