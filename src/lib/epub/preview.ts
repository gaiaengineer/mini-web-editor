import type { JSONContent } from "@tiptap/core";
import {
  buildChapters,
  contentsHeading,
  guessLanguage,
  hasContentsPage,
  navList,
  notesBody,
  withNotes,
  withoutMissingImages,
} from "./chapters";
import { copyrightLines, type CopyrightDetails } from "@/lib/bookPages";
import { cleanText, copyrightPageBody, escapeXml, imagePath, titlePageBody } from "./serialize";
import { bookCss } from "./styles";

export type PreviewScreen = { paper: string; ink: string; fontSize: number; margin: number };

type PreviewOptions = {
  imageUrls?: Map<string, string>;
  fontCss?: string;
  screen?: PreviewScreen;
};

const DEFAULT_SCREEN: PreviewScreen = { paper: "#ffffff", ink: "#1c2024", fontSize: 18, margin: 32 };

function collectImages(node: JSONContent): { id: string; type: string }[] {
  if (node.type === "bookImage") return [{ id: node.attrs?.assetId, type: node.attrs?.mimeType }];
  return (node.content ?? []).flatMap(collectImages);
}

// Pages are columns one screen wide. The editor turns them by scrolling the frame.
const pageCss = ({ paper, ink, fontSize, margin }: PreviewScreen) => `
html {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: ${paper};
  color: ${ink};
  overflow-wrap: anywhere;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, "PT Serif", serif;
}
body {
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  padding: ${margin}px 0;
  font-size: ${fontSize}px;
  column-width: 100vw;
  column-gap: 0;
  column-fill: auto;
}
.title-page, section, .contents-page { box-sizing: border-box; padding: 0 ${margin}px; }
/* Browsers differ on column breaks, so each generated page also fills its page. */
section, .contents-page {
  -webkit-column-break-before: always;
  page-break-before: always;
  break-before: column;
}
.title-page, .copyright-page, .contents-page { min-height: calc(100vh - ${margin * 2}px); }
.contents-page h1 { margin-top: 0; }
.title-page { margin-top: 0; padding-top: 25vh; }
.copyright-page { margin-top: 0; }
.contents-page a { text-decoration: underline; text-underline-offset: 0.2em; text-decoration-color: currentColor; }
.image { break-inside: avoid; }
.image img { max-height: calc(100vh - ${margin * 2 + 8}px); }
`;

// Firefox ignores column breaks, and Safari doesn't always honour them, so a part
// could start partway down the page after the one before it. This fills the rest
// of that page with an empty block instead. Where the breaks work, nothing is added.
export function fillPageEnds(view: Window, margin: number) {
  const doc = view.document;
  for (const filler of doc.querySelectorAll(".page-filler")) filler.remove();
  const pageHeight = view.innerHeight - margin * 2;
  // A tiny block can't be split across pages, so its top is where it really is. A
  // part's own box can be, and then reports the top of a later page. The padding
  // keeps a heading's top margin from merging into the block and moving it.
  const marker = () => {
    const block = doc.createElement("div");
    block.className = "page-filler";
    block.setAttribute("aria-hidden", "true");
    block.style.paddingTop = "1px";
    return block;
  };
  const offset = (block: Element) => block.getBoundingClientRect().top - margin;
  for (const part of doc.querySelectorAll("body > section, body > .contents-page")) {
    const start = marker();
    part.prepend(start);
    const startsPage = offset(start) < 1;
    start.remove();
    if (startsPage) continue;
    const filler = marker();
    part.before(filler);
    const used = offset(filler);
    if (used < 1) filler.remove();
    else filler.style.height = `${Math.max(0, pageHeight - used - 2)}px`;
  }
}

const pageId = (file: string) => file.replace(/\.xhtml$/, "");

// A chapter file with an optional heading becomes a place in this one page. Links
// otherwise open away from the book. Footnotes and notes have ids that are already
// unique in the book, so they keep them.
function entryLink(href: string) {
  const [file, place] = href.split("#");
  const target = place?.startsWith("note") ? place : `${pageId(file)}${place ? `-${place}` : ""}`;
  return `target="_self" href="#${target}"`;
}

// The EPUB's own chapters and stylesheet, so this shows what the book will contain.
// It leaves out the EPUB's packaging, which production builds don't ship.
export function buildPreview(
  source: JSONContent,
  meta: { title: string; author: string; subtitle?: string; copyright?: CopyrightDetails; divider?: string },
  options: PreviewOptions = {},
) {
  const { imageUrls = new Map<string, string>(), fontCss = "", screen = DEFAULT_SCREEN } = options;
  const doc = withoutMissingImages(source, imageUrls);
  const title = cleanText(meta.title) || "Untitled";
  const author = cleanText(meta.author);

  const language = guessLanguage(doc);
  const { chapters, toc, contentsTitle, notes } = buildChapters(doc, title, { divider: meta.divider, link: entryLink });
  const sections = chapters.map(
    ({ file, body }) => `<section id="${pageId(file)}">${body.replace(/ id="(h\d+)"/g, ` id="${pageId(file)}-$1"`)}</section>`,
  );
  if (hasContentsPage(toc)) {
    const heading = escapeXml(contentsHeading(contentsTitle, language));
    const entries = navList(withNotes(toc, notes, language), entryLink);
    sections.unshift(`<nav class="contents-page" id="contents-page"><h1>${heading}</h1>${entries}</nav>`);
  }
  if (notes.length) sections.push(notesBody(notes, language, entryLink));

  const lines = copyrightLines(meta);
  const copyright = lines.length
    ? `<section class="copyright-page" id="copyright-page">${copyrightPageBody(lines)}</section>\n`
    : "";

  let pages = sections.join("\n");
  for (const { id, type } of collectImages(doc)) {
    pages = pages.replaceAll(`src="${imagePath(id, type)}"`, `src="${escapeXml(imageUrls.get(id) ?? "")}"`);
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base target="_blank">
<title>${escapeXml(title)}</title>
<style>${fontCss}${bookCss}${pageCss(screen)}</style>
</head>
<body>
<div class="title-page" id="title-page">${titlePageBody(title, cleanText(meta.subtitle ?? ""), author)}</div>
${copyright}${pages}
</body>
</html>
`;
}
