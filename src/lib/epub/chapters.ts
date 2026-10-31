import type { JSONContent } from "@tiptap/core";
import { plainText, serializeNode } from "./serialize";

export type TocEntry = { title: string; href: string; children: TocEntry[] };
export type Chapter = { file: string; title: string; body: string };

const fileName = (index: number) => `chapter-${String(index + 1).padStart(3, "0")}.xhtml`;

const isHeading = (node: JSONContent) => node.type === "heading" && plainText(node).trim() !== "";
const level = (node: JSONContent): number => node.attrs?.level ?? 1;

function isBlank(node: JSONContent) {
  return node.type === "paragraph" && plainText(node).trim() === "";
}

// Each top-level heading starts a chapter. That is usually H1, but a book that
// only uses H2 for its chapters should still not end up as one huge file.
function groupIntoChapters(blocks: JSONContent[]) {
  const headings = blocks.filter(isHeading);
  const splitLevel = headings.length ? Math.min(...headings.map(level)) : 0;

  const groups: JSONContent[][] = [[]];
  for (const block of blocks) {
    if (isHeading(block) && level(block) === splitLevel) groups.push([]);
    groups[groups.length - 1].push(block);
  }
  for (const group of groups) {
    while (group.length && isBlank(group[group.length - 1])) group.pop();
  }
  return groups.filter((group) => group.length > 0);
}

export function buildChapters(doc: JSONContent, bookTitle: string) {
  const groups = groupIntoChapters(doc.content ?? []);
  if (groups.length === 0) groups.push([{ type: "paragraph" }]);

  const chapters: Chapter[] = [];
  const toc: TocEntry[] = [];
  // Open entries by heading level, so that a skipped level still nests.
  const open: { level: number; entry: TocEntry }[] = [];

  const splitLevel = Math.min(...(doc.content ?? []).filter(isHeading).map(level));

  groups.forEach((group, index) => {
    const file = fileName(index);
    let anchor = 0;

    // Text before the first heading has no heading of its own to list.
    if (!isHeading(group[0])) {
      const entry: TocEntry = { title: bookTitle, href: file, children: [] };
      toc.push(entry);
      open.push({ level: splitLevel, entry });
    }

    const body = group.map((block) => {
      if (!isHeading(block)) return serializeNode(block);
      const id = `h${++anchor}`;
      while (open.length && open[open.length - 1].level >= level(block)) open.pop();
      const entry: TocEntry = {
        title: plainText(block).trim(),
        href: block === group[0] ? file : `${file}#${id}`,
        children: [],
      };
      (open.length ? open[open.length - 1].entry.children : toc).push(entry);
      open.push({ level: level(block), entry });
      return serializeNode(block, id);
    });

    const heading = group.find(isHeading);
    chapters.push({
      file,
      title: isHeading(group[0]) && heading ? plainText(heading).trim() : bookTitle,
      body: body.join("\n"),
    });
  });

  return { chapters, toc };
}
