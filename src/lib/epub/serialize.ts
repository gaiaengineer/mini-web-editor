import type { JSONContent } from "@tiptap/core";

// Tiptap's HTML output is not well-formed XML (<br>, <hr>), so EPUB pages are
// written directly from the document JSON.

const ILLEGAL_XML = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function escapeXml(text: string) {
  return text
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// For metadata, where an empty value left behind by stripping would be invalid.
export function cleanText(text: string) {
  return text.replace(ILLEGAL_XML, "").replace(/\s+/g, " ").trim();
}

export function safeHref(raw: unknown) {
  try {
    const url = new URL(String(raw));
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function serializeText(node: JSONContent) {
  let html = escapeXml(node.text ?? "");
  const marks = new Map(node.marks?.map((mark) => [mark.type, mark]));
  if (marks.has("underline")) html = `<u>${html}</u>`;
  if (marks.has("strike")) html = `<s>${html}</s>`;
  if (marks.has("italic")) html = `<em>${html}</em>`;
  if (marks.has("bold")) html = `<strong>${html}</strong>`;
  const href = marks.has("link") && safeHref(marks.get("link")?.attrs?.href);
  return href ? `<a href="${escapeXml(href)}">${html}</a>` : html;
}

// Footnotes are numbered through the whole book, and each links to its note at the
// end. The note links back to the chapter file it came from.
export type NoteRef = { number: number; file: string; note: JSONContent[] };
export type NoteContext = {
  file: string;
  notes: NoteRef[];
  link: (href: string) => string;
};

export const plainLink = (href: string) => `href="${escapeXml(href)}"`;

function serializeChildren(node: JSONContent, notes?: NoteContext): string {
  return (node.content ?? []).map((child) => serializeNode(child, undefined, notes)).join("");
}

function serializeFootnote(node: JSONContent, notes?: NoteContext) {
  if (!notes) return "";
  const number = notes.notes.length + 1;
  notes.notes.push({ number, file: notes.file, note: node.attrs?.note ?? [] });
  const link = notes.link(`notes.xhtml#note-${number}`);
  return `<sup class="noteref"><a id="noteref-${number}" ${link} epub:type="noteref" role="doc-noteref">${number}</a></sup>`;
}

function alignClass(node: JSONContent) {
  const align = node.attrs?.textAlign;
  return align ? ` class="${escapeXml(align)}"` : "";
}

export function serializeNode(node: JSONContent, id?: string, notes?: NoteContext): string {
  switch (node.type) {
    case "text":
      return serializeText(node);
    case "hardBreak":
      return "<br/>";
    case "footnote":
      return serializeFootnote(node, notes);
    case "horizontalRule":
      return "<hr/>";
    // A subtitle with no heading above it is ordinary text. One under a heading is
    // written with it, in buildChapters.
    case "subtitle":
    case "paragraph":
      // An empty <p> collapses in readers; the blank line was deliberate.
      return `<p${alignClass(node)}>${serializeChildren(node, notes) || "&#160;"}</p>`;
    case "heading": {
      const tag = `h${node.attrs?.level ?? 1}`;
      const idAttr = id ? ` id="${id}"` : "";
      return `<${tag}${idAttr}${alignClass(node)}>${serializeChildren(node, notes)}</${tag}>`;
    }
    case "bookImage": {
      const { assetId, mimeType, alt, textAlign } = node.attrs ?? {};
      const className = textAlign ? `image ${escapeXml(textAlign)}` : "image";
      return `<div class="${className}"><img src="${imagePath(assetId, mimeType)}" alt="${escapeXml(alt ?? "")}"/></div>`;
    }
    case "blockquote":
      return `<blockquote>${serializeChildren(node, notes)}</blockquote>`;
    case "bulletList":
      return `<ul>${serializeChildren(node, notes)}</ul>`;
    case "orderedList": {
      const start = node.attrs?.start;
      return `<ol${start && start !== 1 ? ` start="${Number(start)}"` : ""}>${serializeChildren(node, notes)}</ol>`;
    }
    case "listItem":
      return `<li>${serializeChildren(node, notes)}</li>`;
    default:
      return serializeChildren(node, notes);
  }
}

export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const imagePath = (id: string, type: string) => `images/${id}.${IMAGE_EXTENSIONS[type]}`;

export function plainText(node: JSONContent): string {
  if (node.type === "hardBreak") return " ";
  return node.text ?? (node.content ?? []).map(plainText).join("");
}

export function titlePageBody(title: string, subtitle: string, author: string) {
  const lines = [
    `<h1>${escapeXml(title)}</h1>`,
    subtitle && `<p class="subtitle">${escapeXml(subtitle)}</p>`,
    author && `<p>${escapeXml(author)}</p>`,
  ];
  return lines.join("");
}

export const copyrightPageBody = (lines: string[]) => lines.map((line) => `<p>${escapeXml(line)}</p>`).join("");

export function bookFileName(title: string, extension: string) {
  const safe = title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").slice(0, 100);
  return `${safe || "Untitled"}.${extension}`;
}
