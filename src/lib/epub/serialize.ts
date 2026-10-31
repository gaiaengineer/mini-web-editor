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

function safeHref(raw: unknown) {
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

function serializeChildren(node: JSONContent): string {
  return (node.content ?? []).map((child) => serializeNode(child)).join("");
}

function alignClass(node: JSONContent) {
  const align = node.attrs?.textAlign;
  return align ? ` class="${escapeXml(align)}"` : "";
}

export function serializeNode(node: JSONContent, id?: string): string {
  switch (node.type) {
    case "text":
      return serializeText(node);
    case "hardBreak":
      return "<br/>";
    case "horizontalRule":
      return "<hr/>";
    case "paragraph":
      // An empty <p> collapses in readers; the blank line was deliberate.
      return `<p${alignClass(node)}>${serializeChildren(node) || "&#160;"}</p>`;
    case "heading": {
      const tag = `h${node.attrs?.level ?? 1}`;
      const idAttr = id ? ` id="${id}"` : "";
      return `<${tag}${idAttr}${alignClass(node)}>${serializeChildren(node)}</${tag}>`;
    }
    case "bookImage": {
      const { assetId, mimeType, alt, textAlign } = node.attrs ?? {};
      const className = textAlign ? `image ${escapeXml(textAlign)}` : "image";
      return `<div class="${className}"><img src="${imagePath(assetId, mimeType)}" alt="${escapeXml(alt ?? "")}"/></div>`;
    }
    case "blockquote":
      return `<blockquote>${serializeChildren(node)}</blockquote>`;
    case "bulletList":
      return `<ul>${serializeChildren(node)}</ul>`;
    case "orderedList": {
      const start = node.attrs?.start;
      return `<ol${start && start !== 1 ? ` start="${Number(start)}"` : ""}>${serializeChildren(node)}</ol>`;
    }
    case "listItem":
      return `<li>${serializeChildren(node)}</li>`;
    default:
      return serializeChildren(node);
  }
}

export const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

export const imagePath = (id: string, type: string) => `images/${id}.${IMAGE_EXTENSIONS[type]}`;

export function plainText(node: JSONContent): string {
  if (node.type === "hardBreak") return " ";
  return node.text ?? (node.content ?? []).map(plainText).join("");
}
