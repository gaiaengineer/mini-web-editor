// Runs the importer on the Word files in a folder and reports counts only, so
// that nothing from an unpublished manuscript reaches the terminal or a log.
//
//   npx tsx scripts/import-report.ts [folder]    defaults to test-set/
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JSONContent } from "@tiptap/core";
import { JSDOM } from "jsdom";
import mammoth from "mammoth";

const { window } = new JSDOM("");
Object.assign(globalThis, { window, document: window.document, DOMParser: window.DOMParser });

const { importDocx } = await import("../src/import/index");

const folder = process.argv[2] ?? "test-set";
const names = readdirSync(folder).sort();
const docxFiles = names.filter((name) => name.toLowerCase().endsWith(".docx"));
const docFiles = names.filter((name) => name.toLowerCase().endsWith(".doc"));

const normalize = (text: string) => text.replace(/\[\d+\]/g, "").replace(/\s+/g, "").trim();

// A typed table of contents is the one thing import removes, and it's one stretch.
const withoutRemoved = (text: string, removed: string[], moved: string[]) =>
  moved.reduce((rest, line) => rest.replace(normalize(line), ""), normalize(text).replace(normalize(removed.join("")), ""));

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

const countBlocks = (content: JSONContent, matches: (block: JSONContent) => boolean) =>
  (content.content ?? []).filter(matches).length;

// End notes are added to the book, so they sit outside the comparison.
function bodyOf(content: JSONContent, hasFootnotes: boolean) {
  const blocks = content.content ?? [];
  return { type: "doc", content: hasFootnotes ? blocks.slice(0, -2) : blocks };
}

const rows = [];
let lostWords = 0;
for (const name of docxFiles) {
  const bytes = new Uint8Array(readFileSync(join(folder, name)));
  const result = await importDocx(bytes, { fileName: name, saveImage: async () => "report" });
  if (!result.ok) {
    rows.push({ file: name, result: result.reason });
    continue;
  }
  const raw = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const hasFootnotes = result.notices.some((notice) => notice.kind === "footnote");
  const sameWords = normalize(textOf(bodyOf(result.content, hasFootnotes))) === withoutRemoved(raw.value, result.removedContents, result.movedToPages);
  if (!sameWords) lostWords++;
  rows.push({
    file: name,
    result: sameWords ? "ok" : "WORDS DIFFER",
    headings: countBlocks(result.content, (block) => block.type === "heading"),
    chapterSuggestions: countBlocks(result.content, (block) => !!block.attrs?.suggestHeading),
    alignSuggestions: countBlocks(result.content, (block) => !!block.attrs?.suggestAlign),
    sceneBreaks: countBlocks(result.content, (block) => block.type === "horizontalRule"),
    contentsLinesRemoved: result.removedContents.length,
    linesMovedToPages: result.movedToPages.length,
    notices: result.notices.length,
  });
}

console.table(rows);
console.log(`${docxFiles.length} .docx files read, ${lostWords} with differing words.`);
if (docFiles.length) console.log(`${docFiles.length} .doc files skipped: save them as .docx from Word to include them.`);
process.exitCode = lostWords ? 1 : 0;
