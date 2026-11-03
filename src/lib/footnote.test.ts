import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createExtensions } from "./schema";
import { cleanNote, noteFromHtml } from "./footnote";

const html = (markup: string) => new DOMParser().parseFromString(`<div>${markup}</div>`, "text/html").body.firstElementChild!;

describe("footnote notes", () => {
  it("keep only text, emphasis and line breaks", () => {
    const note = cleanNote([
      { type: "text", text: "Kept", marks: [{ type: "italic" }, { type: "link", attrs: { href: "x" } }] },
      { type: "image" },
      { type: "hardBreak" },
      { type: "text", text: "" },
      "junk",
    ]);
    expect(note).toEqual([{ type: "text", text: "Kept", marks: [{ type: "italic" }] }, { type: "hardBreak" }]);
  });

  it("are empty when what was saved isn't a note", () => {
    expect(cleanNote("text")).toEqual([]);
    expect(cleanNote(null)).toEqual([]);
  });

  it("are read from HTML with emphasis, and paragraphs joined by line breaks", () => {
    expect(noteFromHtml(html("<p> See <em>The <strong>Ledger</strong></em>. </p><p>Page 4.</p>"))).toEqual([
      { type: "text", text: "See " },
      { type: "text", text: "The ", marks: [{ type: "italic" }] },
      { type: "text", text: "Ledger", marks: [{ type: "italic" }, { type: "bold" }] },
      { type: "text", text: "." },
      { type: "hardBreak" },
      { type: "text", text: "Page 4." },
    ]);
  });
});

describe("an empty footnote", () => {
  const book = (note: object[]) =>
    new Editor({
      extensions: createExtensions(null),
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "She paid." }, { type: "footnote", attrs: { note } }, { type: "text", text: " Then." }] }] },
    });
  const footnotes = (editor: Editor) => JSON.stringify(editor.getJSON()).match(/"footnote"/g)?.length ?? 0;
  const leave = (editor: Editor) => {
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 10)));
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
  };

  it("goes when the author clicks away from it", () => {
    const editor = book([]);
    leave(editor);
    expect(footnotes(editor)).toBe(0);
    expect(editor.state.doc.textContent).toBe("She paid. Then.");
    editor.destroy();
  });

  it("stays while it has a note", () => {
    const editor = book([{ type: "text", text: "A debt." }]);
    leave(editor);
    expect(footnotes(editor)).toBe(1);
    editor.destroy();
  });
});
