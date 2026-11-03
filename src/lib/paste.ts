import { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

const BLOCKS = "p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,div,table,section,article";
const STYLE_PROPS = ["text-align", "font-weight", "font-style", "text-decoration"];

// Word, Pages and TextEdit keep bold, italics and alignment in a <style> block
// rather than on the elements, so the editor would otherwise never see them.
function inlineStylesheets(doc: Document) {
  const css = [...doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  if (!css.trim() || typeof CSSStyleSheet === "undefined") return;

  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(css);
  } catch {
    return;
  }
  // Walk backwards so that later rules win, as they do in the cascade.
  for (const rule of [...sheet.cssRules].reverse()) {
    if (!(rule instanceof CSSStyleRule)) continue;
    for (const el of doc.body.querySelectorAll<HTMLElement>(rule.selectorText)) {
      for (const prop of STYLE_PROPS) {
        const value = rule.style.getPropertyValue(prop);
        if (value && !el.style.getPropertyValue(prop)) el.style.setProperty(prop, value);
      }
    }
  }
}

function rename(el: Element, tag: string) {
  const next = el.ownerDocument.createElement(tag);
  for (const attr of el.attributes) next.setAttribute(attr.name, attr.value);
  next.append(...el.childNodes);
  el.replaceWith(next);
  return next;
}

// The editor reads alignment from paragraphs and headings only, so alignment
// set on a wrapper or through the old align attribute has to be moved there.
function normalizeAlignment(doc: Document) {
  for (const el of doc.body.querySelectorAll<HTMLElement>("[align], center")) {
    const align = el.tagName === "CENTER" ? "center" : el.getAttribute("align");
    if (align && !el.style.textAlign) el.style.textAlign = align;
  }
  const wrappers = doc.body.querySelectorAll<HTMLElement>(
    'div[style*="text-align"], center, section[style*="text-align"], article[style*="text-align"]',
  );
  for (const el of wrappers) {
    if (!el.querySelector(BLOCKS)) {
      rename(el, "p");
      continue;
    }
    for (const child of el.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6")) {
      if (!child.style.textAlign) child.style.textAlign = el.style.textAlign;
    }
  }
}

function normalizeHeadings(doc: Document) {
  for (const el of doc.body.querySelectorAll("h4,h5,h6")) rename(el, "h3");
  for (const el of doc.body.querySelectorAll(".MsoTitle")) rename(el, "h1");
  for (const el of doc.body.querySelectorAll(".MsoSubtitle")) rename(el, "p").setAttribute("data-subtitle", "");
}

export function cleanPastedHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  inlineStylesheets(doc);
  normalizeAlignment(doc);
  normalizeHeadings(doc);
  return doc.body.innerHTML;
}

// Pasted text normally merges into the line under the caret and takes on that
// line's alignment. When the paste replaces a whole line, it should keep its own.
export function keepPastedAlignment(slice: Slice, view: EditorView) {
  const { $from, $to } = view.state.selection;
  const replacesWholeLine = $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size;
  return replacesWholeLine && slice.content.firstChild?.attrs.textAlign
    ? new Slice(slice.content, 0, 0)
    : slice;
}
