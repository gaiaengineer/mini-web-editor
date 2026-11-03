import type { CopyrightDetails } from "@/lib/bookPages";

// A statement of rights, as a whole line or the end of one.
const RIGHTS = "(?:all rights reserved|(?:todos los )?derechos reservados|все права защищены)";
const RIGHTS_ENDING = new RegExp(`[.,;]?\\s*${RIGHTS}\\.?\\s*$`, "iu");
const BARE_RIGHTS = new RegExp(`^\\s*${RIGHTS}\\.?\\s*$`, "iu");
// A comma or question mark means a sentence, such as dialogue, not a rights line.
const RIGHTS_LINE = new RegExp(`^\\s*${RIGHTS}[^,;:!?]*\\.?\\s*$`, "iu");

const YEAR = "\\d{4}(?:\\s*[-–—]\\s*\\d{4})?";
const SYMBOL = "(?:©|\\(c\\))";
const STATEMENT = new RegExp(`^\\s*(?:copyright\\s*)?${SYMBOL}?\\s*(${YEAR})\\s+(?:by\\s+|por\\s+)?(.+?)[.,]?\\s*$`, "iu");
const ISBN = /^\s*isbn(?:-1[03])?[:\s]+([\dxX -]{10,17})\s*$/iu;

// How a copyright page reads, not a line that only mentions copyright.
const SIGNAL = new RegExp(`^\\s*(?:©|\\(c\\)\\s*\\d{4}|copyright\\s+(?:©|\\(c\\)|\\d)|isbn\\b)`, "iu");

const MAX_LINE_WORDS = 60;
// Longer than this, a paragraph is the book itself, and copyright lines end there.
const MAX_FRONT_WORDS = 40;
const SEARCH_BLOCKS = 40;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const isCopyrightLine = (line: string) =>
  SIGNAL.test(line) || RIGHTS_LINE.test(line) || (RIGHTS_ENDING.test(line) && SIGNAL.test(line));

// Soft returns separate lines inside one paragraph.
function linesOf(el: Element) {
  const copy = el.cloneNode(true) as Element;
  for (const br of copy.querySelectorAll("br")) br.replaceWith("\n");
  return (copy.textContent ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function readDetails(lines: string[]) {
  const details: CopyrightDetails = {};
  const notes: string[] = [];
  for (const line of lines) {
    const statement = STATEMENT.exec(line.replace(RIGHTS_ENDING, ""));
    const isbn = ISBN.exec(line);
    if (statement && SIGNAL.test(line) && !details.holder) {
      details.year = statement[1];
      details.holder = statement[2];
    } else if (isbn && !details.isbn) {
      details.isbn = isbn[1].trim();
    } else {
      notes.push(line);
    }
  }
  // The page writes this itself alongside a holder.
  const kept = details.holder ? notes.filter((line) => !BARE_RIGHTS.test(line)) : notes;
  if (kept.length) details.note = kept.join("\n");
  return details;
}

const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName) && !/book-(title|subtitle)/.test(el.className);

// Clear copyright lines before the main text move to the copyright page. Anything
// uncertain stays in the book.
export function extractCopyright(doc: Document) {
  const blocks = [...doc.body.children].filter((el) => el.textContent?.trim());
  const textOf = (el: Element) => el.textContent?.trim() ?? "";
  const isCopyright = (el: Element) => wordCount(textOf(el)) <= MAX_LINE_WORDS && linesOf(el).some(isCopyrightLine);

  const searched = blocks.slice(0, SEARCH_BLOCKS);
  const textStarts = searched.findIndex((el) => isHeading(el) || (wordCount(textOf(el)) > MAX_FRONT_WORDS && !isCopyright(el)));
  const opening = textStarts < 0 ? searched : searched.slice(0, textStarts);
  const found = opening.filter((el) => el.tagName === "P" && isCopyright(el));
  // Lines that are the whole file are the book, not its copyright page.
  if (!found.length || found.length === blocks.length) return null;

  const lines = found.flatMap(linesOf);
  for (const el of found) el.remove();
  return { details: readDetails(lines), lines };
}
