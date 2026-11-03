import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { createExtensions } from "./schema";

const schema = getSchema(createExtensions(null));
const reload = (json: object) => JSON.parse(JSON.stringify(Node.fromJSON(schema, json).toJSON()));
const paragraph = (attrs: object) => ({
  type: "doc",
  content: [{ type: "paragraph", attrs, content: [{ type: "text", text: "Chapter One" }] }],
});

describe("book document format", () => {
  it("keeps a chapter suggestion through a save and reload", () => {
    const saved = reload(paragraph({ suggestHeading: true }));
    expect(saved.content[0].attrs.suggestHeading).toBe(true);
  });

  it("keeps an alignment suggestion without changing the current alignment", () => {
    const saved = reload(paragraph({ textAlign: "center", suggestAlign: "left" }));
    expect(saved.content[0].attrs).toMatchObject({ textAlign: "center", suggestAlign: "left" });
  });

  it("loads a document with no suggestions as having none", () => {
    const saved = reload(paragraph({}));
    expect(saved.content[0].attrs).toMatchObject({ suggestHeading: null, suggestAlign: null });
  });
});
