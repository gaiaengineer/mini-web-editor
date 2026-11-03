// Tuned on real manuscripts. A line needs SUGGEST_AT points to become a chapter
// suggestion.
const SUGGEST_AT = 3;
const CHAPTER_LINE_POINTS = 3;
const NEW_PAGE_POINTS = 2;
const SMALL_SIGNAL_POINTS = 1;

const MAX_HEADING_WORDS = 12;
// Long enough that its alignment can't be a poem line or a deliberate flourish.
const MIN_BODY_WORDS = 20;
// A real chapter has text after it. A typed table of contents doesn't.
const MIN_CHAPTER_WORDS = 20;

const CHAPTER_WORDS =
  "chapter|part|book|prologue|epilogue|interlude|foreword|afterword|introduction|" +
  "глава|часть|книга|пролог|эпилог|предисловие|послесловие|" +
  "capítulo|parte|libro|prólogo|epílogo|introducción";
const ROMAN = "(?=[ivxlc])l?x{0,3}(?:ix|iv|v?i{0,3})";
const NUMBER = `(?:[0-9]+|${ROMAN})`;
// A number can be followed by a title. A number written as a word can only be
// followed by a colon or dash, because "Book closed." is a sentence.
const CHAPTER_LINE = new RegExp(
  `^(?:${CHAPTER_WORDS})(?:\\s+${NUMBER}\\s*(?:[.:—–-].*)?|\\s+[a-zа-яёáéíóúüñ]+(?:\\s*[:—–-].*)?|\\s*[.:]?)$`,
  "i",
);
const BARE_NUMBER = new RegExp(`^${NUMBER}\\.?$`, "i");
const NUMBERED_TITLE = new RegExp(`^${NUMBER}[.)]\\s+(.*\\p{L}.*)$`, "iu");

const WORD_HEADINGS = "h1:not(.book-title), h2:not(.book-subtitle), h3";

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

const isAllBold = (el: Element) => {
  const text = el.textContent?.trim();
  return !!text && [...el.querySelectorAll("strong")].map((s) => s.textContent).join("").trim() === text;
};

const isAllItalic = (el: Element) => {
  const text = el.textContent?.trim();
  return !!text && [...el.querySelectorAll("em")].map((s) => s.textContent).join("").trim() === text;
};

const endsSentence = (text: string) => /[.,;:!?…"”»]$/.test(text);

function isChapterLine(text: string) {
  if (CHAPTER_LINE.test(text) || BARE_NUMBER.test(text)) return true;
  const title = NUMBERED_TITLE.exec(text)?.[1];
  return !!title && title === title.toUpperCase() && !endsSentence(title.replace(/(\.\.\.|…)$/, ""));
}

function chapterPoints(el: HTMLElement, text: string) {
  let points = 0;
  if (isChapterLine(text)) points += CHAPTER_LINE_POINTS;
  if (el.hasAttribute("data-after-page-break")) points += NEW_PAGE_POINTS;
  if (isAllBold(el)) points += SMALL_SIGNAL_POINTS;
  if (el.style.textAlign === "center") points += SMALL_SIGNAL_POINTS;
  if (!endsSentence(text)) points += SMALL_SIGNAL_POINTS;
  return points;
}

function suggestChapters(paragraphs: HTMLElement[], doc: Document) {
  // An author who marked headings has decided how the book looks, so only lines
  // that say they're chapters are suggested, not guesses from formatting.
  const marksHeadings = !!doc.querySelector(WORD_HEADINGS);
  const candidates = new Set(
    paragraphs.filter((el) => {
      const text = el.textContent?.trim() ?? "";
      if (wordCount(text) > MAX_HEADING_WORDS) return false;
      return marksHeadings ? isChapterLine(text) : chapterPoints(el, text) >= SUGGEST_AT;
    }),
  );

  for (const candidate of candidates) {
    let words = 0;
    for (let next = candidate.nextElementSibling; next; next = next.nextElementSibling) {
      if (candidates.has(next as HTMLElement)) break;
      words += wordCount(next.textContent ?? "");
      if (words >= MIN_CHAPTER_WORDS) break;
    }
    if (words >= MIN_CHAPTER_WORDS) candidate.setAttribute("data-suggest-heading", "");
  }
}

function suggestAlignment(paragraphs: HTMLElement[]) {
  const body = paragraphs.filter((el) => wordCount(el.textContent ?? "") >= MIN_BODY_WORDS);
  const counts = new Map<string, number>();
  for (const el of body) {
    const align = el.style.textAlign || "left";
    counts.set(align, (counts.get(align) ?? 0) + 1);
  }
  const dominant = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];

  for (const el of body) {
    if ((el.style.textAlign || "left") !== dominant) el.setAttribute("data-suggest-align", dominant);
  }
}

// Word's Subtitle style is the author saying so. The first one is the book's and
// has gone to the title page by now; the rest are chapter subtitles.
function keepWordSubtitles(doc: Document) {
  for (const line of doc.querySelectorAll("h2.book-subtitle")) {
    const subtitle = doc.createElement("p");
    subtitle.setAttribute("data-subtitle", "");
    if (line.getAttribute("style")) subtitle.setAttribute("style", line.getAttribute("style")!);
    subtitle.append(...line.childNodes);
    line.replaceWith(subtitle);
  }
}

const MAX_SUBTITLE_WORDS = 12;
// "Scene 2" or "Act III" under a heading is a section of it, as in a play.
const NUMBERED_LABEL = new RegExp(`^\\p{L}+\\.?\\s+${NUMBER}\\.?$`, "iu");
const isChapterHeading = (el: Element) => el.tagName === "H1" || el.hasAttribute("data-suggest-heading");

// A short line right under a chapter heading that reads as another name for it:
// a Word H2, as in "I. THE LOVERS" over "One's not enough", or a short line set
// apart by italics, bold or centring. A line that starts a chapter of its own, or
// a sentence, isn't one.
function suggestSubtitles(doc: Document) {
  for (const heading of doc.body.children) {
    if (!isChapterHeading(heading)) continue;
    const line = heading.nextElementSibling as HTMLElement | null;
    const text = line?.textContent?.trim() ?? "";
    if (!line || !text || wordCount(text) > MAX_SUBTITLE_WORDS || isChapterLine(text) || NUMBERED_LABEL.test(text)) continue;
    if (line.hasAttribute("data-suggest-heading") || line.querySelector("img, sup[data-footnote]")) continue;
    const after = line.nextElementSibling;
    if (after && /^H[1-3]$/.test(after.tagName)) continue;
    const setApart =
      line.tagName === "H2" ||
      (line.tagName === "P" && !endsSentence(text) && (isAllItalic(line) || isAllBold(line) || line.style.textAlign === "center"));
    if (setApart) line.setAttribute("data-suggest-subtitle", "");
  }
}

export function addSuggestions(doc: Document) {
  keepWordSubtitles(doc);
  const paragraphs = [...doc.body.children].filter((el): el is HTMLElement => el.tagName === "P" && !el.hasAttribute("data-subtitle"));
  suggestChapters(paragraphs, doc);
  suggestAlignment(paragraphs);
  suggestSubtitles(doc);
}
