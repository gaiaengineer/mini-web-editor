import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";

// A chapter's subtitle: another name for the title, not a section of its own. It
// belongs to the heading right above it. Anywhere else it is ordinary text in the
// book, so a stray one can't start a section or a page.
export const Subtitle = Node.create({
  name: "subtitle",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "p[data-subtitle]", priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { "data-subtitle": "", class: "chapter-subtitle" }), 0];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-4": () => this.editor.commands.toggleNode(this.name, "paragraph"),
    };
  },
});

// A subtitle takes its heading's alignment unless the author aligned it separately,
// so a centred chapter title doesn't get a left-aligned subtitle.
export function subtitleAlignment(block: JSONContent, previous: JSONContent | undefined) {
  if (block.attrs?.textAlign || previous?.type !== "heading") return block.attrs?.textAlign ?? null;
  return previous.attrs?.textAlign ?? null;
}

export const isSubtitleOf = (block: JSONContent | undefined, previous: JSONContent | undefined) =>
  block?.type === "subtitle" && previous?.type === "heading";
