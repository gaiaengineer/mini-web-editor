import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createExtensions } from "@/lib/schema";
import { listHeadings } from "@/lib/headings";
import { listSuggestions, resolveAll, resolveSuggestion, SuggestionMarks } from "./suggestions";

const text = (value: string) => [{ type: "text", text: value }];
const chapter = (value: string) => ({ type: "paragraph", attrs: { suggestHeading: true }, content: text(value) });
const aligned = (value: string, textAlign = "center") => ({
  type: "paragraph",
  attrs: { suggestAlign: "left", textAlign },
  content: text(value),
});
const plain = (value: string) => ({ type: "paragraph", content: text(value) });

let editor: Editor;
afterEach(() => editor?.destroy());

function open(...content: JSONContent[]) {
  editor = new Editor({ extensions: [...createExtensions(null), SuggestionMarks], content: { type: "doc", content } });
  return editor;
}

const blocks = () => editor.getJSON().content ?? [];
const counts = () => {
  const found = listSuggestions(editor.state.doc);
  return { chapters: found.filter((s) => s.kind === "chapter").length, aligns: found.filter((s) => s.kind === "align").length };
};
const only = (kind: "chapter" | "align") => listSuggestions(editor.state.doc).find((s) => s.kind === kind)!;

describe("chapter suggestions", () => {
  it("accepting one makes the line a chapter heading", () => {
    open(plain("Before."), chapter("The Flood"));
    resolveSuggestion(editor, only("chapter"), true);
    expect(listHeadings(editor.state.doc).map(({ title, level }) => [title, level])).toEqual([["The Flood", 1]]);
    expect(counts().chapters).toBe(0);
  });

  it("rejecting one leaves the line as it was, with no suggestion", () => {
    open(chapter("The Flood"));
    resolveSuggestion(editor, only("chapter"), false);
    expect(blocks()[0].type).toBe("paragraph");
    expect(blocks()[0].attrs?.suggestHeading).toBeNull();
    expect(blocks()[0].content).toEqual(text("The Flood"));
  });

  it("accepting all resolves every chapter", () => {
    open(...Array.from({ length: 49 }, (_, i) => chapter(`Line ${i}`)));
    resolveAll(editor, "chapter", true);
    expect(listHeadings(editor.state.doc)).toHaveLength(49);
    expect(new Set(listHeadings(editor.state.doc).map(({ level }) => level))).toEqual(new Set([1]));
    expect(counts().chapters).toBe(0);
  });

  it("rejecting all leaves every line as a paragraph", () => {
    open(chapter("One"), chapter("Two"));
    resolveAll(editor, "chapter", false);
    expect(blocks().map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    expect(counts().chapters).toBe(0);
  });

  it("one undo after accepting all restores every suggestion", () => {
    open(chapter("One"), chapter("Two"), chapter("Three"));
    resolveAll(editor, "chapter", true);
    editor.commands.undo();
    expect(counts().chapters).toBe(3);
    expect(blocks().map((block) => block.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
  });

  it("keeps a heading's alignment when accepted", () => {
    open({ type: "paragraph", attrs: { suggestHeading: true, textAlign: "center" }, content: text("The Flood") });
    resolveSuggestion(editor, only("chapter"), true);
    expect(blocks()[0].attrs).toMatchObject({ level: 1, textAlign: "center" });
  });
});

describe("alignment suggestions", () => {
  it("accepting one changes only the alignment", () => {
    open(aligned("A long paragraph."));
    resolveSuggestion(editor, only("align"), true);
    expect(blocks()[0].attrs?.textAlign).toBeNull();
    expect(blocks()[0].attrs?.suggestAlign).toBeNull();
    expect(blocks()[0].content).toEqual(text("A long paragraph."));
  });

  it("applies a suggested alignment other than left", () => {
    open({ type: "paragraph", attrs: { suggestAlign: "center" }, content: text("A long paragraph.") });
    resolveSuggestion(editor, only("align"), true);
    expect(blocks()[0].attrs?.textAlign).toBe("center");
  });

  it("rejecting one keeps the alignment as imported", () => {
    open(aligned("A long paragraph."));
    resolveSuggestion(editor, only("align"), false);
    expect(blocks()[0].attrs).toMatchObject({ textAlign: "center", suggestAlign: null });
  });

  it("accepting all leaves chapter suggestions waiting", () => {
    open(aligned("One."), aligned("Two."), chapter("The Flood"));
    resolveAll(editor, "align", true);
    expect(counts()).toEqual({ chapters: 1, aligns: 0 });
  });
});

describe("while editing", () => {
  it.each([
    ["the middle", 4],
    ["the end", 10],
  ])("keeps one suggestion when Enter is pressed at %s of a line", (_where, position) => {
    open(chapter("The Flood"));
    editor.commands.setTextSelection(position);
    editor.view.someProp("handleKeyDown", (handle) => handle(editor.view, new KeyboardEvent("keydown", { key: "Enter" })));
    expect(blocks()).toHaveLength(2);
    expect(counts().chapters).toBe(1);
  });

  it("marks suggested lines only in the editor, not in the saved book", () => {
    open(chapter("The Flood"));
    expect(editor.view.dom.querySelector(".suggested-line")?.textContent).toBe("The Flood");
    expect(editor.view.dom.querySelector(".suggestion-controls")).not.toBeNull();
    expect(JSON.stringify(editor.getJSON())).not.toContain("suggested-line");
  });

  it("the Accept button on a line resolves that line", () => {
    open(chapter("One"), chapter("Two"));
    const second = editor.view.dom.querySelectorAll(".suggestion-controls")[1];
    second.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(blocks().slice(0, 2).map((block) => block.type)).toEqual(["paragraph", "heading"]);
  });

  it("keeps the suggestion on the text when Enter is pressed at the start of a line", () => {
    open(chapter("The Flood"));
    editor.commands.setTextSelection(1);
    editor.view.someProp("handleKeyDown", (handle) => handle(editor.view, new KeyboardEvent("keydown", { key: "Enter" })));
    expect(blocks().map((block) => block.attrs?.suggestHeading)).toEqual([null, true]);
    expect(blocks()[1].content).toEqual(text("The Flood"));
  });

  it("turns an emptied line's suggestion down instead of making an empty heading", () => {
    open(chapter("x"), plain("After."));
    editor.commands.deleteRange({ from: 1, to: 2 });
    resolveSuggestion(editor, only("chapter"), true);
    expect(blocks()[0].type).toBe("paragraph");
    expect(counts().chapters).toBe(0);
  });

  it("drops a suggestion when its line moves into a list or quote", () => {
    open(chapter("The Flood"), plain("After."));
    editor.commands.setTextSelection(2);
    editor.commands.toggleBulletList();
    const saved = JSON.stringify(editor.getJSON());
    expect(saved).toContain("bulletList");
    expect(saved).not.toContain('"suggestHeading":true');
  });

  it("keeps a suggestion when its text is edited", () => {
    open(chapter("The Flood"));
    editor.commands.insertContentAt(1, "Rain: ");
    expect(counts().chapters).toBe(1);
  });

  it("resolves each suggestion on a line separately", () => {
    open({ type: "paragraph", attrs: { suggestHeading: true, suggestAlign: "left", textAlign: "center" }, content: text("Line") });
    resolveSuggestion(editor, only("align"), true);
    expect(counts()).toEqual({ chapters: 1, aligns: 0 });
    resolveSuggestion(editor, only("chapter"), false);
    expect(counts()).toEqual({ chapters: 0, aligns: 0 });
  });

  it("suggestions survive saving and reopening the book", () => {
    open(chapter("The Flood"), aligned("A long paragraph."));
    const saved = editor.getJSON();
    editor.destroy();
    editor = new Editor({ extensions: createExtensions(null), content: saved });
    expect(counts()).toEqual({ chapters: 1, aligns: 1 });
  });
});

describe("subtitle suggestions", () => {
  const heading = (value: string) => ({ type: "heading", attrs: { level: 1 }, content: text(value) });
  const maybe = (value: string, type = "paragraph") => ({ type, attrs: { suggestSubtitle: true, ...(type === "heading" ? { level: 2 } : {}) }, content: text(value) });
  const subtitles = () => listSuggestions(editor.state.doc).filter((s) => s.kind === "subtitle");

  it("accepting one makes the line the chapter's subtitle", () => {
    open(heading("Chapter 1"), maybe("A rainy night", "heading"), plain("It rained."));
    resolveSuggestion(editor, subtitles()[0], true);
    expect(blocks().map((block) => block.type)).toEqual(["heading", "subtitle", "paragraph"]);
    expect(listHeadings(editor.state.doc).map(({ title }) => title)).toEqual(["Chapter 1"]);
  });

  it("rejecting one leaves the line as it was", () => {
    open(heading("Chapter 1"), maybe("A rainy night"));
    resolveAll(editor, "subtitle", false);
    expect(blocks()[1]).toMatchObject({ type: "paragraph" });
    expect(subtitles()).toHaveLength(0);
  });
});
