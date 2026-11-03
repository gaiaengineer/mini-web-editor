// A table of contents typed into the manuscript is taken out, because the book
// gets its own. This is the only text import removes, so the evidence has to be
// strong, and anything uncertain stays.
const CONTENTS_TITLE = /^(contents|table of contents|índice|indice|contenido|contenidos|sumario|содержание|оглавление)[.:]?$/iu;
const NUMBERED_ENTRY = /^\s*(\d+|[ivxlc]+)[.)]\s/i;

const MAX_ENTRY_WORDS = 14;
const MIN_TITLED_ENTRIES = 3;
const MIN_UNTITLED_ENTRIES = 5;
// A list without a title has to sit early, and each of its entries has to open a
// real stretch of text across much of the book. A cast list's names don't.
const EARLY_SHARE = 0.15;
const MIN_SPREAD_SHARE = 0.4;
const MIN_CHAPTER_WORDS = 50;
const MIN_KEY_LENGTH = 3;

const textOf = (el: Element) => el.textContent?.trim() ?? "";
const wordCount = (el: Element) => textOf(el).split(/\s+/).filter(Boolean).length;
const isShort = (el: Element) => wordCount(el) <= MAX_ENTRY_WORDS;

// Punctuation and spacing don't matter when comparing an entry with its chapter.
const squeeze = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// The line as typed, and without a page number at the end.
const keysOf = (el: Element) => [squeeze(textOf(el)), squeeze(textOf(el).replace(/[\s.…·_-]*\d+$/u, ""))];

function matcher(lines: Element[]) {
  const positions = new Map<string, number[]>();
  lines.forEach((el, index) => {
    const [key] = keysOf(el);
    if (key.length >= MIN_KEY_LENGTH) positions.set(key, [...(positions.get(key) ?? []), index]);
  });
  return (el: Element, after: number) => {
    const found = keysOf(el).flatMap((key) => positions.get(key)?.find((index) => index > after) ?? []);
    return found.length ? Math.min(...found) : undefined;
  };
}

type Matcher = ReturnType<typeof matcher>;

function titledRun(lines: Element[], laterMatch: Matcher) {
  const titleAt = lines.slice(0, Math.ceil(lines.length * EARLY_SHARE)).findIndex((el) => CONTENTS_TITLE.test(textOf(el)));
  if (titleAt < 0) return null;

  // The list can't reach past the first line that repeats an entry: that's the book.
  const seen = new Set<string>();
  let limit = titleAt + 1;
  while (limit < lines.length && isShort(lines[limit]) && !seen.has(keysOf(lines[limit])[0])) {
    for (const key of keysOf(lines[limit])) seen.add(key);
    limit++;
  }

  // Short lines after the last real entry, such as a dedication, aren't entries.
  const matched = (index: number) => laterMatch(lines[index], limit - 1) !== undefined;
  let end = limit;
  while (end > titleAt + 1 && !matched(end - 1) && !NUMBERED_ENTRY.test(textOf(lines[end - 1]))) end--;

  const entries = lines.slice(titleAt + 1, end);
  const found = entries.filter((_, index) => matched(titleAt + 1 + index));
  if (entries.length < MIN_TITLED_ENTRIES || found.length * 2 < entries.length) return null;
  return { start: titleAt, end, title: textOf(lines[titleAt]) };
}

function untitledRun(lines: Element[], laterMatch: Matcher) {
  const wordsBefore = [0];
  for (const el of lines) wordsBefore.push(wordsBefore[wordsBefore.length - 1] + wordCount(el));

  const last = Math.ceil(lines.length * EARLY_SHARE);
  for (let start = 0; start < last; start++) {
    const matches: number[] = [];
    let end = start;
    while (end < lines.length && isShort(lines[end])) {
      const match = laterMatch(lines[end], end);
      if (match === undefined) break;
      matches.push(match);
      end++;
    }
    if (matches.length < MIN_UNTITLED_ENTRIES) continue;

    const distinct = new Set(lines.slice(start, end).map((el) => keysOf(el)[0])).size === matches.length;
    const opensChapters = matches
      .slice(1)
      .every((match, index) => wordsBefore[match] - wordsBefore[matches[index]] >= MIN_CHAPTER_WORDS);
    const spread = matches[matches.length - 1] - matches[0];
    if (distinct && opensChapters && spread >= (lines.length - end) * MIN_SPREAD_SHARE) return { start, end, title: "" };
  }
  return null;
}

const topLevel = (el: Element) => (el.tagName === "LI" ? el.parentElement! : el);

function removeLines(removed: Element[], next: Element | undefined) {
  // Blank lines between entries have already become scene breaks.
  for (let el = topLevel(removed[0]).nextElementSibling; el && el !== next; el = el.nextElementSibling) {
    if (el.tagName === "HR") el.setAttribute("data-remove", "");
  }
  const parents = new Set(removed.map((el) => el.parentElement));
  for (const el of removed) el.remove();
  for (const hr of parents.values().next().value?.ownerDocument.querySelectorAll("[data-remove]") ?? []) hr.remove();
  for (const parent of parents) if (parent && /^(OL|UL)$/.test(parent.tagName) && !parent.children.length) parent.remove();
}

export function removeTypedContents(doc: Document) {
  const lines = [...doc.body.children]
    .filter((el) => el.textContent?.trim() || el.querySelector("img"))
    .flatMap((el) => (/^(OL|UL)$/.test(el.tagName) ? [...el.children] : [el]));

  const laterMatch = matcher(lines);
  const run = titledRun(lines, laterMatch) ?? untitledRun(lines, laterMatch);
  if (!run) return null;

  const removed = lines.slice(run.start, run.end);
  const next = lines.slice(run.end).find((el) => /^(P|H[1-6])$/.test(el.tagName));
  next?.setAttribute("data-contents-here", run.title || "contents");
  const text = removed.map(textOf);
  removeLines(removed, next);
  return text;
}
