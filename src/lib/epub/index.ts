import type { JSONContent } from "@tiptap/core";
import { strToU8, zipSync, type Zippable } from "fflate";
import {
  buildChapters,
  contentsHeading,
  guessLanguage,
  hasContentsPage,
  imageIds,
  navList,
  NOTES_FILE,
  notesBody,
  notesHeading,
  withNotes,
  withoutMissingImages,
  type TocEntry,
} from "./chapters";
import { copyrightLines, type CopyrightDetails } from "@/lib/bookPages";
import { bookFileName, cleanText, copyrightPageBody, escapeXml, imagePath, titlePageBody } from "./serialize";
import { bookCss } from "./styles";

export { imageIds };

export type BookMeta = {
  bookId: string;
  title: string;
  author: string;
  subtitle?: string;
  copyright?: CopyrightDetails;
  divider?: string;
  language?: string;
  modified?: Date;
};

export type EpubImages = Map<string, { bytes: Uint8Array; type: string }>;
export type EpubFont = { css: string; files: { name: string; bytes: Uint8Array }[] };
export type EpubAssets = { images?: EpubImages; font?: EpubFont };

const XML = '<?xml version="1.0" encoding="UTF-8"?>';

function page(title: string, language: string, body: string, extraNs = "") {
  return `${XML}
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${extraNs} xml:lang="${language}" lang="${language}">
<head>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="book.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

// EPUB 2 readers, still common on older e-ink devices, need the NCX for a
// table of contents; they ignore nav.xhtml.
function ncx(entries: TocEntry[], identifier: string, title: string, author: string) {
  let order = 0;
  const points = (list: TocEntry[]): string =>
    list
      .map((entry) => {
        const id = ++order;
        return `<navPoint id="nav-${id}" playOrder="${id}"><navLabel><text>${escapeXml(entry.title)}</text></navLabel><content src="${escapeXml(entry.href)}"/>${points(entry.children)}</navPoint>`;
      })
      .join("");
  const map = points(entries);
  return `${XML}
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXml(identifier)}"/></head>
<docTitle><text>${escapeXml(title)}</text></docTitle>
${author ? `<docAuthor><text>${escapeXml(author)}</text></docAuthor>` : ""}
<navMap>${map}</navMap>
</ncx>
`;
}

export function buildEpub(
  source: JSONContent,
  meta: BookMeta,
  { images = new Map(), font }: EpubAssets = {},
): Uint8Array {
  const doc = withoutMissingImages(source, images);
  const title = cleanText(meta.title) || "Untitled";
  const author = cleanText(meta.author);
  const language = escapeXml(meta.language ?? guessLanguage(doc));
  const identifier = `urn:mini-web-editor:book:${meta.bookId}`;
  const modified = (meta.modified ?? new Date()).toISOString().replace(/\.\d+Z$/, "Z");

  const { chapters, toc, contentsTitle, notes } = buildChapters(doc, title, { divider: meta.divider });
  const menu = withNotes(toc, notes, language);
  const EPUB_NS = ' xmlns:epub="http://www.idpf.org/2007/ops"';

  const titlePage = page(
    title,
    language,
    `<div class="title-page">${titlePageBody(title, cleanText(meta.subtitle ?? ""), author)}</div>`,
  );

  const copyright = copyrightLines(meta);
  const copyrightPage = page(title, language, `<div class="copyright-page">${copyrightPageBody(copyright)}</div>`);

  const nav = page(
    title,
    language,
    `<nav epub:type="toc" id="toc"><h1>${escapeXml(contentsHeading(contentsTitle, language))}</h1>${navList(menu)}</nav>`,
    EPUB_NS,
  );

  const usedImages = imageIds(doc).map((id) => ({ id, ...images.get(id)! }));

  // The nav file also powers the reader's own contents menu. Listing it in the spine
  // makes it a page of the book too, unless there is nothing worth a page.
  const contentsItem = hasContentsPage(toc) ? '<itemref idref="nav"/>' : "";
  const chapterItem = (_: unknown, i: number) => `<itemref idref="c${i + 1}"/>`;

  const opf = `${XML}
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${language}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:language>${language}</dc:language>
${author ? `<dc:creator id="creator">${escapeXml(author)}</dc:creator>\n<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>` : ""}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="book.css" media-type="text/css"/>
${font?.files.map(({ name }, i) => `<item id="font${i + 1}" href="fonts/${name}" media-type="font/woff2"/>`).join("\n") ?? ""}
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${copyright.length ? '<item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>' : ""}
${chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join("\n")}
${notes.length ? `<item id="notes" href="${NOTES_FILE}" media-type="application/xhtml+xml"/>` : ""}
${usedImages.map(({ id, type }, i) => `<item id="img${i + 1}" href="${imagePath(id, type)}" media-type="${type}"/>`).join("\n")}
</manifest>
<spine toc="ncx">
<itemref idref="title"/>
${copyright.length ? '<itemref idref="copyright"/>' : ""}
${[contentsItem, ...chapters.map(chapterItem)].join("\n")}
${notes.length ? '<itemref idref="notes"/>' : ""}
</spine>
</package>
`;

  const container = `${XML}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;

  // The spec requires mimetype to be the first entry, and stored uncompressed.
  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(container),
    "EPUB/content.opf": strToU8(opf),
    "EPUB/nav.xhtml": strToU8(nav),
    "EPUB/toc.ncx": strToU8(ncx(menu, identifier, title, author)),
    "EPUB/book.css": strToU8((font?.css ?? "") + bookCss),
    "EPUB/title.xhtml": strToU8(titlePage),
    ...(copyright.length ? { "EPUB/copyright.xhtml": strToU8(copyrightPage) } : {}),
  };
  for (const chapter of chapters) {
    files[`EPUB/${chapter.file}`] = strToU8(page(chapter.title, language, chapter.body, EPUB_NS));
  }
  if (notes.length) {
    files[`EPUB/${NOTES_FILE}`] = strToU8(page(notesHeading(language), language, notesBody(notes, language), EPUB_NS));
  }
  // Fonts and images are already compressed; deflating them again only costs time.
  for (const { name, bytes } of font?.files ?? []) {
    files[`EPUB/fonts/${name}`] = [bytes, { level: 0 }];
  }
  for (const { id, type, bytes } of usedImages) {
    files[`EPUB/${imagePath(id, type)}`] = [bytes!, { level: 0 }];
  }
  return zipSync(files, { level: 9 });
}

export const epubFileName = (title: string) => bookFileName(title, "epub");
