import type { Node } from "@tiptap/pm/model";

export type Heading = { pos: number; level: number; title: string };

// The same headings, by the same rule, as the EPUB's table of contents: top-level
// and not empty. See lib/epub/chapters.ts.
export function listHeadings(doc: Pick<Node, "forEach">) {
  const headings: Heading[] = [];
  doc.forEach((node, pos) => {
    const title = node.textContent.trim();
    if (node.type.name === "heading" && title) {
      headings.push({ pos, level: node.attrs.level, title });
    }
  });
  return headings;
}
