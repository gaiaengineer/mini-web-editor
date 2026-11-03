import { noteFromHtml } from "@/lib/footnote";

// When blank paragraphs reach this share of the text paragraphs, the author is
// using them for spacing. Below it, each one is deliberate: a scene break.
const SPACING_SHARE = 0.5;

// Scene breaks are rare. A book with more than this has blank lines for spacing,
// as plays do, even if they sit below SPACING_SHARE. Tuned on 10 real manuscripts:
// prose had up to 0.25 per 1,000 words, the rest 6 or more. Short works get a
// fixed allowance, because one or two breaks there is a high rate but a real one.
const SCENE_BREAKS_PER_1000_WORDS = 1;
const ALWAYS_ALLOWED_SCENE_BREAKS = 5;

const HEADINGS = "h1,h2,h3,h4,h5,h6";

const isBlank = (el: Element) =>
  el.tagName === "P" && !el.textContent?.trim() && !el.querySelector("img, sup[data-footnote]");

function rename(el: Element, tag: string) {
  const next = el.ownerDocument.createElement(tag);
  for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
  next.append(...el.childNodes);
  el.replaceWith(next);
}

function applyAlignment(doc: Document) {
  for (const align of ["center", "right"]) {
    for (const el of doc.querySelectorAll<HTMLElement>(`.align-${align}`)) {
      el.style.textAlign = align;
      el.classList.remove(`align-${align}`);
    }
  }
}

// An image is a block of its own in the book. Left inside a paragraph, it would
// leave an empty line behind, so it takes over the paragraph and its alignment.
function unwrapImages(doc: Document) {
  for (const line of doc.querySelectorAll<HTMLElement>("p")) {
    const images = [...line.querySelectorAll("img")];
    if (!images.length || line.textContent?.trim()) continue;
    for (const image of images) image.style.textAlign = line.style.textAlign;
    line.replaceWith(...images);
  }
}

function removeBlanksAround(el: Element) {
  while (el.previousElementSibling && isBlank(el.previousElementSibling)) el.previousElementSibling.remove();
  while (el.nextElementSibling && isBlank(el.nextElementSibling)) el.nextElementSibling.remove();
}

// A page break can sit anywhere in a Word paragraph, often just before a chapter
// title, so the text on each side of it becomes its own line.
function removePageBreaks(doc: Document) {
  for (const pageBreak of doc.querySelectorAll("br.page-break")) {
    const line = pageBreak.closest(`p,li,${HEADINGS}`);
    if (!line?.lastChild) {
      pageBreak.remove();
      continue;
    }
    const rest = doc.createRange();
    rest.setStartAfter(pageBreak);
    rest.setEndAfter(line.lastChild);
    const after = line.cloneNode(false) as Element;
    after.append(rest.extractContents());
    line.after(after);
    pageBreak.remove();

    if (isBlank(after)) after.remove();
    removeBlanksAround(line);
    const opensPage = line.nextElementSibling;
    if (isBlank(line)) line.remove();
    opensPage?.setAttribute("data-after-page-break", "");
  }
}

function breaksScene(blank: Element) {
  let previous = blank.previousElementSibling;
  while (previous && isBlank(previous)) previous = previous.previousElementSibling;
  const next = blank.nextElementSibling;
  return previous?.tagName === "P" && next?.tagName === "P" && !isBlank(next);
}

function resolveBlankLines(doc: Document) {
  for (const el of doc.querySelectorAll("li p, td p")) if (isBlank(el)) el.remove();
  for (const box of doc.querySelectorAll("[data-text-box]")) removeBlanksAround(box);

  const top = [...doc.body.children];
  const blanks = top.filter(isBlank);
  const sceneBreaks = new Set(blanks.filter(breaksScene));

  const words = top.reduce((count, el) => count + (el.textContent?.split(/\s+/).filter(Boolean).length ?? 0), 0);
  const allowedBreaks = Math.max(ALWAYS_ALLOWED_SCENE_BREAKS, (words / 1000) * SCENE_BREAKS_PER_1000_WORDS);
  const isSpacing = blanks.length >= (top.length - blanks.length) * SPACING_SHARE || sceneBreaks.size > allowedBreaks;

  for (const blank of blanks) {
    if (!isSpacing && sceneBreaks.has(blank)) blank.replaceWith(doc.createElement("hr"));
    else blank.remove();
  }
}

// Word's footnotes and endnotes become footnotes in place, each holding its note.
// Mammoth links each marker to the note's text in a list at the end, which goes.
function keepNotes(doc: Document) {
  for (const link of doc.querySelectorAll('a[href^="#footnote-ref-"], a[href^="#endnote-ref-"]')) link.remove();
  const lists = new Set<Element>();
  for (const link of doc.querySelectorAll('a[id^="footnote-ref-"], a[id^="endnote-ref-"]')) {
    const text = doc.getElementById(link.getAttribute("href")?.slice(1) ?? "");
    const marker = doc.createElement("sup");
    marker.setAttribute("data-footnote", "");
    marker.setAttribute("data-note", JSON.stringify(text ? noteFromHtml(text) : []));
    (link.closest("sup") ?? link).replaceWith(marker);
    const list = text?.closest("ol");
    if (list) lists.add(list);
  }
  for (const list of lists) list.remove();
}

export function cleanDocument(doc: Document) {
  for (const image of doc.querySelectorAll("img[data-lost-image]")) image.remove();
  applyAlignment(doc);
  for (const el of doc.querySelectorAll("h4,h5,h6")) rename(el, "h3");
  unwrapImages(doc);
  removePageBreaks(doc);
  for (const el of doc.querySelectorAll(HEADINGS)) if (!el.textContent?.trim()) el.remove();
  resolveBlankLines(doc);
  keepNotes(doc);
}
