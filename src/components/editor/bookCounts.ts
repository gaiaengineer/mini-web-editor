import type { Node } from "@tiptap/pm/model";
import { noteText } from "@/lib/footnote";

export function countBook(doc: Node) {
  // Line ends separate words here, and don't count as characters. A footnote's
  // marker isn't text, but its note is part of the book.
  const notes: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "footnote") notes.push(noteText(node.attrs.note ?? []));
  });
  const text = [doc.textBetween(0, doc.content.size, "\n", "\n"), ...notes].join("\n");
  return {
    words: text.match(/\S+/g)?.length ?? 0,
    characters: Array.from(text.replaceAll("\n", "")).length,
  };
}
