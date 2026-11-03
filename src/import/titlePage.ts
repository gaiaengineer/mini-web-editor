// Lines that clearly belong on the title page move there. Anything uncertain stays
// in the book.
const SEARCH_BLOCKS = 5;
const MAX_LINE_WORDS = 14;
const BY_LINE = /^(?:by|por|автор:?)\s+(\p{Lu}[\p{L}.'’-]*(?:\s+\p{Lu}[\p{L}.'’-]*){0,4})$/iu;

const textOf = (el: Element) => el.textContent?.trim() ?? "";
const squeeze = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const wordCount = (el: Element) => textOf(el).split(/\s+/).length;
const withoutExtension = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

// The pattern ignores case for "by", so each word of the name is checked separately.
function authorIn(line: string) {
  const name = BY_LINE.exec(line)?.[1];
  return name?.split(/\s+/).every((word) => word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) ? name : undefined;
}

export function extractTitlePage(doc: Document, fileName: string) {
  const blocks = [...doc.body.children].filter((el) => el.textContent?.trim());
  const opening = blocks.slice(0, SEARCH_BLOCKS);
  const fileTitle = squeeze(withoutExtension(fileName));

  // A styled title counts only before the text has started.
  const started = opening.findIndex((el) => /^H[1-6]$/.test(el.tagName) ? !el.className : wordCount(el) > MAX_LINE_WORDS);
  const beforeText = started < 0 ? opening : opening.slice(0, started);

  const titleLine =
    beforeText.find((el) => el.classList.contains("book-title")) ??
    (blocks[0] && wordCount(blocks[0]) <= MAX_LINE_WORDS && squeeze(textOf(blocks[0])) === fileTitle ? blocks[0] : undefined);
  if (!titleLine) return null;

  const next = titleLine.nextElementSibling;
  const subtitleLine = next?.classList.contains("book-subtitle") ? next : undefined;
  const afterTitle = (subtitleLine ?? titleLine).nextElementSibling;
  const author = afterTitle?.tagName === "P" ? authorIn(textOf(afterTitle)) : undefined;
  const moved = [titleLine, subtitleLine, author ? afterTitle : undefined].filter((el): el is Element => !!el);

  // A title with nothing after it is the whole book, not its title page.
  if (blocks.length <= moved.length) return null;

  const details = { title: textOf(titleLine), subtitle: subtitleLine && textOf(subtitleLine), author };
  const lines = moved.map(textOf);
  for (const el of moved) el.remove();
  return { details, lines };
}
