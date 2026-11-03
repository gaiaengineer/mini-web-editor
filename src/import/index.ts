import { generateJSON, type JSONContent } from "@tiptap/core";
import type { CopyrightDetails } from "@/lib/bookPages";
import { createExtensions } from "@/lib/schema";
import { cleanDocument } from "./cleanup";
import { removeTypedContents } from "./contents";
import { extractCopyright } from "./copyright";
import { extractTitlePage } from "./titlePage";
import { docxToHtml, type SaveImage } from "./docx";
import { findNotices, type ImportNotice } from "./notices";
import { addSuggestions } from "./suggest";

export type ImportedBook = {
  ok: true;
  content: JSONContent;
  title: string;
  notices: ImportNotice[];
  subtitle?: string;
  author?: string;
  copyright?: CopyrightDetails;
  // A typed table of contents is removed, and title and copyright lines move to their
  // own pages. Import changes no other text.
  removedContents: string[];
  movedToPages: string[];
};
export type ImportFailure = { ok: false; reason: "unreadable" | "empty" };

type ImportOptions = { fileName: string; saveImage: SaveImage };

const withoutExtension = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

function wordTitle(doc: Document) {
  const title = doc.querySelector(".book-title")?.cloneNode(true) as Element | undefined;
  title?.querySelectorAll("sup").forEach((marker) => marker.remove());
  return title?.textContent?.trim();
}

export async function importDocx(
  bytes: Uint8Array,
  { fileName, saveImage }: ImportOptions,
): Promise<ImportedBook | ImportFailure> {
  let html: string;
  try {
    html = await docxToHtml(bytes, saveImage);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const styledTitle = wordTitle(doc);
  const notices = findNotices(doc, bytes);
  cleanDocument(doc);
  const typedTitlePage = extractTitlePage(doc, fileName);
  if (typedTitlePage) notices.push({ kind: "title", near: "" });
  const removedContents = removeTypedContents(doc);
  if (removedContents) notices.push({ kind: "contents", near: "" });
  const typedCopyright = extractCopyright(doc);
  if (typedCopyright) notices.push({ kind: "copyright", near: "" });
  if (!doc.body.textContent?.trim() && !doc.querySelector("img")) return { ok: false, reason: "empty" };

  addSuggestions(doc);

  return {
    ok: true,
    content: generateJSON(doc.body.innerHTML, createExtensions(null)),
    title: styledTitle || typedTitlePage?.details.title || withoutExtension(fileName),
    subtitle: typedTitlePage?.details.subtitle,
    author: typedTitlePage?.details.author,
    notices,
    removedContents: removedContents ?? [],
    copyright: typedCopyright?.details,
    movedToPages: [...(typedTitlePage?.lines ?? []), ...(typedCopyright?.lines ?? [])],
  };
}
