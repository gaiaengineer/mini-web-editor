import type { JSONContent } from "@tiptap/core";
import { strToU8, zipSync } from "fflate";

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"';

const STYLE_NAMES: Record<string, string> = {
  Title: "Title",
  Subtitle: "Subtitle",
  Heading1: "heading 1",
  Heading2: "heading 2",
};

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type RunOptions = { bold?: boolean; italic?: boolean; underline?: boolean; font?: string };

export function run(text: string, { bold, italic, underline, font }: RunOptions = {}) {
  const props = [
    font ? `<w:rFonts w:ascii="${font}"/><w:sz w:val="48"/><w:color w:val="FF0000"/>` : "",
    bold ? "<w:b/>" : "",
    italic ? "<w:i/>" : "",
    underline ? '<w:u w:val="single"/>' : "",
  ].join("");
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

export const TAB = "<w:r><w:tab/></w:r>";
export const PAGE_BREAK = '<w:r><w:br w:type="page"/></w:r>';

type ParagraphOptions = { style?: string; align?: string; list?: boolean };

// Accepts plain text or runs that are already XML.
export function paragraph(content = "", { style, align, list }: ParagraphOptions = {}) {
  const props = [
    style ? `<w:pStyle w:val="${style}"/>` : "",
    list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "",
    align ? `<w:jc w:val="${align}"/>` : "",
  ].join("");
  const runs = content.startsWith("<w:") ? content : content ? run(content) : "";
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

export const footnoteReference = (id: number) => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`;
export const endnoteReference = (id: number) => `<w:r><w:endnoteReference w:id="${id}"/></w:r>`;

export const table = (...cells: string[]) =>
  `<w:tbl><w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join("")}</w:tr></w:tbl>`;

export const textBox = (...lines: string[]) =>
  `<w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml"><v:textbox><w:txbxContent>${lines.map((line) => paragraph(line)).join("")}</w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;

// One pixel, so that a file can carry a real image.
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

export const IMAGE =
  '<w:r><w:drawing><wp:inline><wp:docPr id="1" descr="A red dot"/><a:graphic><a:graphicData>' +
  '<pic:pic><pic:blipFill><a:blip r:embed="rImage"/></pic:blipFill></pic:pic>' +
  "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";

type DocxOptions = {
  footnotes?: Record<number, string>;
  endnotes?: Record<number, string>;
  comments?: Record<number, string>;
  image?: "png" | "emf";
  list?: boolean;
};

export function makeDocx(body: string[], { footnotes, endnotes, comments, image, list }: DocxOptions = {}) {
  const styles = Object.entries(STYLE_NAMES)
    .map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`)
    .join("");
  const notes = Object.entries(footnotes ?? {})
    .map(([id, text]) => `<w:footnote w:id="${id}">${paragraph(text)}</w:footnote>`)
    .join("");
  const endnoteXml = Object.entries(endnotes ?? {})
    .map(([id, text]) => `<w:endnote w:id="${id}">${paragraph(text)}</w:endnote>`)
    .join("");
  const commentXml = Object.entries(comments ?? {})
    .map(([id, text]) => `<w:comment w:id="${id}" w:author="Editor">${paragraph(text)}</w:comment>`)
    .join("");
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const rels = [
    rel("rStyles", "styles", "styles.xml"),
    footnotes ? rel("rNotes", "footnotes", "footnotes.xml") : "",
    endnotes ? rel("rEndnotes", "endnotes", "endnotes.xml") : "",
    comments ? rel("rComments", "comments", "comments.xml") : "",
    image ? rel("rImage", "image", `media/pixel.${image}`) : "",
    list ? rel("rNumbering", "numbering", "numbering.xml") : "",
  ].join("");
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="png" ContentType="image/png"/>' +
        '<Default Extension="emf" ContentType="image/x-emf"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        rel("rDoc", "officeDocument", "word/document.xml") +
        "</Relationships>",
    ),
    "word/_rels/document.xml.rels": strToU8(
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
    ),
    "word/styles.xml": strToU8(`${xml}<w:styles ${NS}>${styles}</w:styles>`),
    "word/document.xml": strToU8(`${xml}<w:document ${NS}><w:body>${body.join("")}</w:body></w:document>`),
  };
  if (footnotes) files["word/footnotes.xml"] = strToU8(`${xml}<w:footnotes ${NS}>${notes}</w:footnotes>`);
  if (endnotes) files["word/endnotes.xml"] = strToU8(`${xml}<w:endnotes ${NS}>${endnoteXml}</w:endnotes>`);
  if (comments) files["word/comments.xml"] = strToU8(`${xml}<w:comments ${NS}>${commentXml}</w:comments>`);
  if (image) files[`word/media/pixel.${image}`] = PIXEL;
  if (list) {
    files["word/numbering.xml"] = strToU8(
      `${xml}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>` +
        '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
    );
  }
  return zipSync(files);
}

export function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plainText).join(" ");
}

export const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

export const blocks = (content: JSONContent) => content.content ?? [];

export const blockTypes = (content: JSONContent) => blocks(content).map((block) => block.type);
