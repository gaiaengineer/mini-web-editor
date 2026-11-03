import { Extension, type Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type SuggestionKind = "chapter" | "align" | "subtitle";
export type Suggestion = { kind: SuggestionKind; pos: number };

export function listSuggestions(doc: Node) {
  const found: Suggestion[] = [];
  doc.forEach((node, pos) => {
    if (node.attrs.suggestHeading) found.push({ kind: "chapter", pos });
    if (node.attrs.suggestAlign) found.push({ kind: "align", pos });
    if (node.attrs.suggestSubtitle) found.push({ kind: "subtitle", pos });
  });
  return found;
}

function resolve(tr: Transaction, { kind, pos }: Suggestion, accept: boolean) {
  const node = tr.doc.nodeAt(pos);
  if (!node) return;
  if (kind === "align") {
    const textAlign = accept ? node.attrs.suggestAlign : node.attrs.textAlign;
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      textAlign: textAlign === "left" ? null : textAlign,
      suggestAlign: null,
    });
  } else if (kind === "subtitle") {
    const { subtitle } = tr.doc.type.schema.nodes;
    if (accept && node.textContent.trim()) tr.setNodeMarkup(pos, subtitle, { textAlign: node.attrs.textAlign });
    else tr.setNodeAttribute(pos, "suggestSubtitle", null);
  } else if (accept && node.textContent.trim()) {
    // The top heading level is what starts a chapter in the book.
    const { heading } = tr.doc.type.schema.nodes;
    const { textAlign, contentsHere } = node.attrs;
    tr.setNodeMarkup(pos, heading, { level: 1, textAlign, contentsHere });
  } else {
    tr.setNodeAttribute(pos, "suggestHeading", null);
  }
}

export function resolveSuggestion(editor: Editor, suggestion: Suggestion, accept: boolean) {
  const { tr } = editor.state;
  resolve(tr, suggestion, accept);
  editor.view.dispatch(tr);
}

// One transaction, so one undo brings them all back. Resolving changes no node's
// size, so the positions stay valid throughout.
export function resolveAll(editor: Editor, kind: SuggestionKind, accept: boolean) {
  const { tr } = editor.state;
  for (const suggestion of listSuggestions(tr.doc)) {
    if (suggestion.kind === kind) resolve(tr, suggestion, accept);
  }
  editor.view.dispatch(tr);
}

const LABELS: Record<SuggestionKind, string> = {
  chapter: "Chapter heading?",
  align: "Align with the rest of the book?",
  subtitle: "Subtitle of the chapter above?",
};

function controls(editor: Editor, kind: SuggestionKind, getPos: () => number | undefined) {
  const box = document.createElement("div");
  box.className = "suggestion-controls";
  box.textContent = LABELS[kind];
  for (const [label, accept] of [["Accept", true], ["Reject", false]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      const pos = getPos();
      if (pos !== undefined) resolveSuggestion(editor, { kind, pos }, accept);
    });
    box.append(button);
  }
  return box;
}

function decorate(doc: Node, editor: Editor) {
  return DecorationSet.create(
    doc,
    listSuggestions(doc).flatMap(({ kind, pos }) => [
      Decoration.widget(pos, (_view, getPos) => controls(editor, kind, getPos), {
        side: -1,
        key: `${kind}-${pos}`,
        stopEvent: () => true,
      }),
      Decoration.node(pos, pos + doc.nodeAt(pos)!.nodeSize, { class: "suggested-line" }),
    ]),
  );
}

const pluginKey = new PluginKey<DecorationSet>("suggestionMarks");

// Shows suggestions in the editor only. Nothing here reaches the saved book.
export const SuggestionMarks = Extension.create({
  name: "suggestionMarks",
  priority: 1000,
  // Splitting mid-line copies a paragraph's attributes, which would double the
  // suggestion. The first part keeps it.
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        const { attrs } = $from.parent;
        if (!attrs.suggestHeading && !attrs.suggestAlign && !attrs.suggestSubtitle) return false;
        if ($from.parentOffset === 0) {
          return editor.commands.insertContentAt($from.before(), { type: "paragraph" });
        }
        return editor
          .chain()
          .splitBlock()
          .resetAttributes($from.parent.type.name, ["suggestHeading", "suggestAlign", "suggestSubtitle"])
          .run();
      },
    };
  },
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_config, state) => decorate(state.doc, editor),
          apply: (tr, marks) => (tr.docChanged ? decorate(tr.doc, editor) : marks),
        },
        // The review works on the book's top-level lines, so a line moved into a
        // list or quote stops being a suggestion.
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const { tr } = state;
          state.doc.forEach((block, offset) => {
            if (block.type.name === "paragraph") return;
            block.descendants((node, pos) => {
              if (!node.attrs.suggestHeading && !node.attrs.suggestAlign && !node.attrs.suggestSubtitle) return;
              tr.setNodeMarkup(offset + 1 + pos, undefined, { ...node.attrs, suggestHeading: null, suggestAlign: null, suggestSubtitle: null });
            });
          });
          return tr.docChanged ? tr : null;
        },
        props: {
          decorations: (state) => pluginKey.getState(state),
        },
      }),
    ];
  },
});
