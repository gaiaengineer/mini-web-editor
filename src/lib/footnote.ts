import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";

// A footnote is a marker in the text that holds its own note. The marker has no
// text of its own: its number comes from its place in the book, so notes renumber
// themselves when one is added or removed.

const NOTE_MARKS = new Set(["bold", "italic", "underline", "strike"]);

// A note is one paragraph's worth of text: words, emphasis and line breaks.
export type NoteContent = JSONContent[];

// Notes come from saved drafts, pasted HTML and Word files, so only what a note can
// hold is kept.
export function cleanNote(value: unknown): NoteContent {
  if (!Array.isArray(value)) return [];
  return value.flatMap((node): NoteContent => {
    if (node?.type === "hardBreak") return [{ type: "hardBreak" }];
    if (node?.type !== "text" || typeof node.text !== "string" || !node.text) return [];
    const marks = Array.isArray(node.marks)
      ? node.marks.filter((mark: { type?: unknown }) => NOTE_MARKS.has(String(mark?.type))).map((mark: { type: string }) => ({ type: mark.type }))
      : [];
    return [{ type: "text", text: node.text, ...(marks.length ? { marks } : {}) }];
  });
}

function parseNote(raw: string | null) {
  try {
    return cleanNote(JSON.parse(raw ?? "[]"));
  } catch {
    return [];
  }
}

const TAG_MARKS: Record<string, string> = { EM: "italic", I: "italic", STRONG: "bold", B: "bold", U: "underline", S: "strike" };

// Reads a note's text and emphasis from HTML, as Word files and pastes give it.
// Paragraphs are joined with line breaks.
export function noteFromHtml(el: Element): NoteContent {
  const out: NoteContent = [];
  const walk = (node: globalThis.Node, marks: string[]) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push({ type: "text", text, ...(marks.length ? { marks: [...new Set(marks)].map((type) => ({ type })) } : {}) });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName;
    if (tag === "BR") return void out.push({ type: "hardBreak" });
    const isBlock = /^(P|LI|DIV|H[1-6])$/.test(tag);
    if (isBlock && out.length && out[out.length - 1].type !== "hardBreak") out.push({ type: "hardBreak" });
    const mark = TAG_MARKS[tag];
    for (const child of node.childNodes) walk(child, mark ? [...marks, mark] : marks);
  };
  for (const child of el.childNodes) walk(child, []);
  while (out[0]?.type === "hardBreak") out.shift();
  while (out.at(-1)?.type === "hardBreak") out.pop();
  // Spaces at either end of a line mean nothing.
  out.forEach((node, index) => {
    if (node.type !== "text") return;
    if (index === 0 || out[index - 1].type === "hardBreak") node.text = node.text!.trimStart();
    if (index === out.length - 1 || out[index + 1].type === "hardBreak") node.text = node.text!.trimEnd();
  });
  return cleanNote(out);
}

export const noteText = (note: NoteContent) => note.map((node) => (node.type === "hardBreak" ? " " : node.text)).join("");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      // Adds a footnote after the cursor or the selected text, and selects it.
      addFootnote: () => ReturnType;
    };
  }
}

export const Footnote = Node.create({
  name: "footnote",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      note: {
        default: [],
        parseHTML: (el) => parseNote(el.getAttribute("data-note")),
        renderHTML: (attrs) => ({ "data-note": JSON.stringify(attrs.note ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { "data-footnote": "", class: "footnote-ref" })];
  },

  // A footnote with nothing in it would show a number with no note, so it goes
  // once the author moves away from it: clicking elsewhere, as well as Done.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("emptyFootnotes"),
        appendTransaction: (transactions, oldState, newState) => {
          const left = oldState.selection;
          if (!(left instanceof NodeSelection) || left.node.type.name !== this.name) return null;
          const pos = transactions.reduce((at, tr) => tr.mapping.map(at), left.from);
          const node = newState.doc.nodeAt(pos);
          if (node?.type.name !== this.name || noteText(node.attrs.note ?? []).trim()) return null;
          const now = newState.selection;
          if (now instanceof NodeSelection && now.from === pos) return null;
          return newState.tr.delete(pos, pos + 1);
        },
      }),
    ];
  },

  addCommands() {
    return {
      addFootnote:
        () =>
        ({ state, tr, dispatch }) => {
          const at = state.selection.to;
          if (dispatch) {
            tr.insert(at, this.type.create({ note: [] }));
            tr.setSelection(NodeSelection.create(tr.doc, at));
            tr.scrollIntoView();
          }
          return true;
        },
    };
  },
});
