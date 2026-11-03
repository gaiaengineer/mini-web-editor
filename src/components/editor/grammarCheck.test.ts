import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Checker, Mistake } from "@/lib/grammar/harper";
import { createExtensions } from "@/lib/schema";
import { GrammarCheck, grammarKey, lineText } from "./grammarCheck";

const text = (value: string) => ({ type: "text", text: value });
const p = (...content: object[]) => ({ type: "paragraph", content });

// Finds "teh" wherever it is, like a real spelling check.
const fakeChecker = (calls: string[] = []): Checker => ({
  async check(line) {
    calls.push(line);
    const found: Mistake[] = [];
    for (const match of line.matchAll(/teh/g)) {
      found.push({ start: match.index!, end: match.index! + 3, message: "Did you mean the?", kind: "Spelling", problem: "teh", fixes: [{ kind: "replace", text: "the" }] });
    }
    return found;
  },
  ignore: async () => "",
});

let editor: Editor;
afterEach(() => editor?.destroy());

function open(content: JSONContent[], checker: () => Checker | null) {
  editor = new Editor({ extensions: [...createExtensions(null), GrammarCheck.configure({ checker })], content: { type: "doc", content } });
  return editor;
}

const underlined = () =>
  grammarKey
    .getState(editor.state)!
    .decorations.find()
    .map((d) => editor.state.doc.textBetween(d.from, d.to));

describe("lineText", () => {
  it("skips a footnote marker but keeps every letter at its place", () => {
    const schema = getSchema(createExtensions(null));
    const doc = Node.fromJSON(schema, { type: "doc", content: [p(text("A debt"), { type: "footnote", attrs: { note: [] } }, text(" paid"), { type: "hardBreak" }, text("x"))] });
    const { text: line, positions } = lineText(doc.firstChild!, 0);
    expect(line).toBe("A debt paid\nx");
    expect(doc.textBetween(positions[7], positions[11])).toBe("paid");
  });
});

describe("the spelling and grammar check", () => {
  it("underlines what the checker finds", async () => {
    open([p(text("She saw teh cat.")), p(text("And teh dog."))], fakeChecker);
    await vi.waitFor(() => expect(underlined()).toEqual(["teh", "teh"]));
  });

  it("checks each line only once until it changes", async () => {
    const calls: string[] = [];
    const checker = fakeChecker(calls);
    open([p(text("She saw teh cat.")), p(text("Fine."))], () => checker);
    await vi.waitFor(() => expect(underlined()).toEqual(["teh"]));
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " More");
    await vi.waitFor(() => expect(calls).toContain("Fine. More"));
    expect(calls.filter((line) => line === "She saw teh cat.")).toHaveLength(1);
    expect(underlined()).toEqual(["teh"]);
  });

  it("drops the underline from a word as it's being fixed", async () => {
    open([p(text("She saw teh cat."))], fakeChecker);
    await vi.waitFor(() => expect(underlined()).toEqual(["teh"]));
    editor.commands.insertContentAt({ from: 9, to: 12 }, "the");
    expect(underlined()).toEqual([]);
  });

  it("rechecks only the lines it's asked to", async () => {
    const calls: string[] = [];
    const checker = fakeChecker(calls);
    open([p(text("She saw teh cat.")), p(text("And teh dog."))], () => checker);
    await vi.waitFor(() => expect(underlined()).toHaveLength(2));
    calls.length = 0;
    editor.commands.recheckLines((line) => line.startsWith("And"));
    await vi.waitFor(() => expect(calls).toEqual(["And teh dog."]));
  });

  it("underlines nothing, and checks nothing, when switched off", async () => {
    let on = true;
    const calls: string[] = [];
    const checker = fakeChecker(calls);
    open([p(text("She saw teh cat."))], () => (on ? checker : null));
    await vi.waitFor(() => expect(underlined()).toEqual(["teh"]));
    on = false;
    calls.length = 0;
    editor.commands.recheckBook();
    expect(underlined()).toEqual([]);
    await new Promise((done) => setTimeout(done, 900));
    expect(underlined()).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("doesn't bring back what a check with the old settings found", async () => {
    let release!: () => void;
    const slowOld: Checker = {
      check: (line) => new Promise((done) => (release = () => done(fakeChecker().check(line) as unknown as Mistake[]))),
      ignore: async () => "",
    };
    const fresh: Checker = { check: async () => [], ignore: async () => "" };
    let current = slowOld;
    open([p(text("She saw teh cat."))], () => current);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    current = fresh;
    editor.commands.recheckBook();
    release();
    await new Promise((done) => setTimeout(done, 900));
    expect(underlined()).toEqual([]);
  });

  it("leaves the book unmarked, and keeps working, when the checker fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: Checker = { check: async () => Promise.reject(new Error("no checker")), ignore: async () => "" };
    open([p(text("She saw teh cat."))], () => broken);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(underlined()).toEqual([]);
    editor.commands.insertContentAt(2, "x");
    expect(editor.state.doc.textContent).toContain("Sxhe");
    warn.mockRestore();
  });
});
