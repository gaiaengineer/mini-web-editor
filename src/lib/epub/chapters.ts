import type { JSONContent } from "@tiptap/core";
import { dividerHtml } from "@/lib/dividers";
import { subtitleAlignment } from "@/lib/subtitle";
import { escapeXml, plainLink, plainText, serializeNode, type NoteRef } from "./serialize";

export function imageIds(node: JSONContent): string[] {
  if (node.type === "bookImage") return node.attrs?.assetId ? [node.attrs.assetId] : [];
  return [...new Set((node.content ?? []).flatMap(imageIds))];
}

// A manifest entry or src pointing at a missing file makes the whole EPUB invalid.
export function withoutMissingImages(node: JSONContent, images: { has(id: string): boolean }): JSONContent {
  if (!node.content) return node;
  const content = node.content
    .filter((child) => child.type !== "bookImage" || images.has(child.attrs?.assetId))
    .map((child) => withoutMissingImages(child, images));
  return { ...node, content };
}

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
  // A scene break at the end of a chapter separates nothing, and could take a page
  // of its own.
  const trailing = (node: JSONContent) => isBlank(node) || node.type === "horizontalRule";
  for (const group of groups) {
    while (group.length && trailing(group[group.length - 1])) group.pop();
  }
  return groups.filter((group) => group.length > 0);
}

export function hasContentsPage(toc: TocEntry[]) {
  return toc.length > 1 || toc.some((entry) => entry.children.length > 0);
}

export function navList(entries: TocEntry[], link = (href: string) => `href="${escapeXml(href)}"`): string {
  const items = entries.map((entry) => {
    const nested = entry.children.length ? navList(entry.children, link) : "";
    return `<li><a ${link(entry.href)}>${escapeXml(entry.title)}</a>${nested}</li>`;
  });
  return `<ol>${items.join("")}</ol>`;
}

export function guessLanguage(doc: JSONContent) {
  const sample = plainText(doc).slice(0, 5000);
  const letters = sample.match(/\p{L}/gu)?.length ?? 0;
  const cyrillic = sample.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  if (letters > 0 && cyrillic / letters > 0.5) return "ru";
  const spanish = sample.match(/\b(el|los|las|una|que|del|por|para|con)\b/giu)?.length ?? 0;
  const english = sample.match(/\b(the|and|of|that|was|for|with)\b/giu)?.length ?? 0;
  if (spanish > english * 2 && spanish >= 3) return "es";
  return (typeof navigator !== "undefined" && navigator.language) || "en";
}

export const NOTES_FILE = "notes.xhtml";

export function notesHeading(language: string) {
  if (language.startsWith("ru")) return "Примечания";
  return language.startsWith("es") ? "Notas" : "Notes";
}

// Every note at the end of the book. Its number links back to where it was.
export function notesBody(notes: NoteRef[], language: string, link = plainLink) {
  const items = notes.map(({ number, file, note }) => {
    const back = link(`${file}#noteref-${number}`);
    const text = serializeNode({ type: "paragraph", content: note });
    return `<li id="note-${number}" epub:type="endnote"><a class="note-back" ${back} role="doc-backlink" aria-label="Back to text">${number}.</a> ${text.replace(/^<p>|<\/p>$/g, "")}</li>`;
  });
  return `<section class="notes-page" id="notes" epub:type="endnotes" role="doc-endnotes"><h1>${escapeXml(notesHeading(language))}</h1><ol>${items.join("")}</ol></section>`;
}

// The reader's contents menu also lists the notes. They don't count towards having
// a contents page.
export function withNotes(toc: TocEntry[], notes: NoteRef[], language: string): TocEntry[] {
  return notes.length ? [...toc, { title: notesHeading(language), href: NOTES_FILE, children: [] }] : toc;
}

export function contentsHeading(title: string | undefined, language: string) {
  if (title && title !== "contents") return title;
  if (language.startsWith("ru")) return "Содержание";
  return language.startsWith("es") ? "Índice" : "Contents";
}

// A manuscript often opens with its own title, which the title page already shows.
export function opensWithTitle([first]: JSONContent[], bookTitle: string) {
  const same = (text: string) => text.trim().toLowerCase();
  return !!first && isHeading(first) && same(plainText(first)) === same(bookTitle);
}

// The contents page always comes straight after the title and copyright pages,
// before any of the book text, an epigraph or dedication included. So the chapters
// are only the text; where a typed list sat in the manuscript doesn't matter.
type ChapterOptions = {
  divider?: string;
  // How a link to another part of the book is written. The preview, which is one
  // page, turns these into places on that page.
  link?: (href: string) => string;
};

export function buildChapters(doc: JSONContent, bookTitle: string, { divider, link = plainLink }: ChapterOptions = {}) {
  const content = doc.content ?? [];
  const blocks = opensWithTitle(content, bookTitle) ? content.slice(1) : content;
  const groups = groupIntoChapters(blocks);
  if (groups.length === 0) groups.push([{ type: "paragraph" }]);

  const chapters: Chapter[] = [];
  const toc: TocEntry[] = [];
  // Open entries by heading level, so that a skipped level still nests.
  const open: { level: number; entry: TocEntry }[] = [];
  const notes: NoteRef[] = [];

  groups.forEach((group, index) => {
    const file = fileName(index);
    let anchor = 0;

    const context = { file, notes, link };
    const body = group.map((block, at) => {
      // A subtitle is written with its heading, as one heading group.
      if (block.type === "subtitle" && isHeading(group[at - 1])) return "";
      if (!isHeading(block)) return serializeNode(block, undefined, context);
      const id = `h${++anchor}`;
      while (open.length && open[open.length - 1].level >= level(block)) open.pop();
      const entry: TocEntry = {
        title: plainText(block).trim(),
        href: block === group[0] ? file : `${file}#${id}`,
        children: [],
      };
      (open.length ? open[open.length - 1].entry.children : toc).push(entry);
      open.push({ level: level(block), entry });
      const heading = serializeNode(block, id, context);
      const next = group[at + 1];
      if (next?.type !== "subtitle") return heading;
      const align = subtitleAlignment(next, block);
      const subtitle = serializeNode({ ...next, type: "paragraph", attrs: { ...next.attrs, textAlign: align } }, undefined, context)
        .replace(/^<p( class="([^"]*)")?>/, (_, __, cls) => `<p class="chapter-subtitle${cls ? ` ${cls}` : ""}" role="doc-subtitle">`);
      return `<hgroup>${heading}${subtitle}</hgroup>`;
    }).filter(Boolean);

    const heading = group.find(isHeading);
    chapters.push({
      file,
      title: isHeading(group[0]) && heading ? plainText(heading).trim() : bookTitle,
      // Text is escaped, so "<hr/>" here is always a divider.
      body: body.join("\n").replaceAll("<hr/>", dividerHtml(divider)),
    });
  });

  // A book with no headings still needs one entry for the reader's menu.
  if (toc.length === 0) toc.push({ title: bookTitle, href: fileName(0), children: [] });

  const contentsTitle = blocks.find((block) => block.attrs?.contentsHere)?.attrs?.contentsHere as string | undefined;
  return { chapters, toc, contentsTitle, notes };
}
