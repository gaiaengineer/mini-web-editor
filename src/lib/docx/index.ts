import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  TableOfContents,
  TextRun,
  type ParagraphChild,
} from "docx";
import { copyrightLines, type CopyrightDetails } from "@/lib/bookPages";
import { dividerById } from "@/lib/dividers";
import { subtitleAlignment } from "@/lib/subtitle";
import { buildChapters, contentsHeading, guessLanguage, hasContentsPage, imageIds, opensWithTitle } from "@/lib/epub/chapters";
import { plainText, safeHref } from "@/lib/epub/serialize";

export type WordImages = Map<string, { bytes: Uint8Array; type: string; width: number; height: number }>;

const PAGE_WIDTH_PX = 576;
const PAGE_HEIGHT_PX = 860;
const QUOTE_INDENT = 720;
const LIST_INDENT = 720;
const LIST_LEVELS = 3;

const IMAGE_TYPES: Record<string, "png" | "jpg" | "gif"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};
const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
const ALIGNMENTS = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT };

const alignmentOf = (node: JSONContent) => ALIGNMENTS[node.attrs?.textAlign as keyof typeof ALIGNMENTS];

function textRun(node: JSONContent, style?: string) {
  const marks = new Set(node.marks?.map((mark) => mark.type));
  return new TextRun({
    text: node.text ?? "",
    // Left out when absent, so that changing a style in Word still reaches these runs.
    bold: marks.has("bold") || undefined,
    italics: marks.has("italic") || undefined,
    underline: marks.has("underline") ? {} : undefined,
    strike: marks.has("strike") || undefined,
    style,
  });
}

// Word numbers footnotes itself and shows each at the bottom of its page.
type Footnotes = Record<number, { children: Paragraph[] }>;

function inlineRuns(node: JSONContent, footnotes?: Footnotes): ParagraphChild[] {
  return (node.content ?? []).map((child) => {
    if (child.type === "hardBreak") return new TextRun({ break: 1 });
    if (child.type === "footnote") {
      if (!footnotes) return new TextRun("");
      const id = Object.keys(footnotes).length + 1;
      footnotes[id] = { children: [new Paragraph({ children: inlineRuns({ content: child.attrs?.note ?? [] }) })] };
      return new FootnoteReferenceRun(id);
    }
    const link = safeHref(child.marks?.find((mark) => mark.type === "link")?.attrs?.href);
    if (link) return new ExternalHyperlink({ link, children: [textRun(child, "Hyperlink")] });
    return child.type === "text" ? textRun(child) : new TextRun(plainText(child));
  });
}

function imageParagraph(node: JSONContent, images: WordImages) {
  const image = images.get(node.attrs?.assetId);
  const type = image && IMAGE_TYPES[image.type];
  if (!image || !type) return [];
  const scale = Math.min(1, PAGE_WIDTH_PX / image.width, PAGE_HEIGHT_PX / image.height);
  const alt = node.attrs?.alt ?? "";
  return [
    new Paragraph({
      alignment: alignmentOf(node),
      children: [
        new ImageRun({
          type,
          data: image.bytes,
          transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) },
          altText: { name: alt, description: alt, title: alt },
        }),
      ],
    }),
  ];
}

type Context = { images: WordImages; lists: { count: number }; numberedStarts: Set<number>; divider?: string; footnotes: Footnotes };
type Placement = { indent?: number; numbering?: { reference: string; level: number; instance: number } };

function listParagraphs(node: JSONContent, level: number, context: Context, placement: Placement): Paragraph[] {
  const start = Number(node.attrs?.start ?? 1);
  if (node.type === "orderedList") context.numberedStarts.add(start);
  const reference = node.type === "orderedList" ? `numbered-${start}` : "bulleted";
  const instance = context.lists.count++;
  return (node.content ?? []).flatMap((item) =>
    (item.content ?? []).flatMap((child, index) => {
      if (child.type === "bulletList" || child.type === "orderedList") {
        return listParagraphs(child, Math.min(level + 1, LIST_LEVELS - 1), context, placement);
      }
      // Only an item's first paragraph carries its bullet or number.
      const numbering = index === 0 ? { reference, level, instance } : undefined;
      const indent = index === 0 ? placement.indent : LIST_INDENT * (level + 1);
      return blockParagraphs(child, context, { indent, numbering });
    }),
  );
}

function blockParagraphs(node: JSONContent, context: Context, placement: Placement = {}): Paragraph[] {
  const indent = placement.indent ? { left: placement.indent } : undefined;
  switch (node.type) {
    case "heading":
      return [
        new Paragraph({
          heading: HEADINGS[(node.attrs?.level ?? 1) as keyof typeof HEADINGS],
          alignment: alignmentOf(node),
          children: inlineRuns(node, context.footnotes),
        }),
      ];
    case "bookImage":
      return imageParagraph(node, context.images);
    case "horizontalRule": {
      const { text } = dividerById(context.divider);
      if (text) return [new Paragraph({ alignment: AlignmentType.CENTER, text })];
      return [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "auto" } },
        }),
      ];
    }
    case "blockquote":
      return (node.content ?? []).flatMap((child) =>
        blockParagraphs(child, context, { indent: (placement.indent ?? 0) + QUOTE_INDENT }),
      );
    case "bulletList":
    case "orderedList":
      return listParagraphs(node, 0, context, placement);
    case "subtitle":
      return [
        new Paragraph({
          style: "Subtitle",
          alignment: alignmentOf(node) ?? AlignmentType.LEFT,
          indent,
          children: inlineRuns(node, context.footnotes),
        }),
      ];
    case "paragraph":
      return [
        new Paragraph({
          alignment: alignmentOf(node),
          indent,
          numbering: placement.numbering,
          children: inlineRuns(node, context.footnotes),
        }),
      ];
    default:
      return node.content?.length ? [new Paragraph(plainText(node))] : [];
  }
}

type ListFormat = { format: (typeof LevelFormat)[keyof typeof LevelFormat]; text: string; start?: number };

const listLevels = (format: (level: number) => ListFormat) =>
  Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    ...format(level),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: LIST_INDENT / 2 } } },
  }));

type WordPages = { title: string; author: string; subtitle?: string; copyright?: CopyrightDetails; divider?: string };

// The title page, copyright page and table of contents, each on its own page.
function generatedPages(source: JSONContent, meta: WordPages) {
  const title = meta.title.trim();
  const titlePage = [
    title && new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, text: title }),
    meta.subtitle?.trim() && new Paragraph({ style: "Subtitle", text: meta.subtitle.trim() }),
    meta.author.trim() && new Paragraph({ alignment: AlignmentType.CENTER, text: meta.author.trim() }),
  ].filter((page) => !!page);

  const copyright = copyrightLines(meta).map((line, index) => new Paragraph({ pageBreakBefore: index === 0, text: line }));

  const { toc, contentsTitle } = buildChapters(source, title);
  const contents = hasContentsPage(toc)
    ? [
        new Paragraph({ pageBreakBefore: true, text: contentsHeading(contentsTitle, guessLanguage(source)) }),
        new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }),
      ]
    : [];

  return [...titlePage, ...copyright, ...contents];
}

export async function buildDocx(
  source: JSONContent,
  meta: WordPages,
  images: WordImages = new Map(),
) {
  const context: Context = { images, lists: { count: 0 }, numberedStarts: new Set(), divider: meta.divider, footnotes: {} };
  const blocks = source.content ?? [];
  const title = meta.title.trim();
  const main = title && opensWithTitle(blocks, title) ? blocks.slice(1) : blocks;
  const front = generatedPages(source, meta);

  // A subtitle takes its heading's alignment unless it has its own.
  const aligned = main.map((block, at) =>
    block.type === "subtitle" ? { ...block, attrs: { ...block.attrs, textAlign: subtitleAlignment(block, main[at - 1]) } } : block,
  );
  const paragraphs = aligned.flatMap((block) => blockParagraphs(block, context));
  // The main text starts on its own page after the generated ones.
  const opening = front.length ? [...front, new Paragraph({ children: [new PageBreak()] })] : [];

  const document = new Document({
    title: title || undefined,
    creator: meta.author.trim() || undefined,
    styles: { paragraphStyles: [{ id: "Subtitle", name: "Subtitle", basedOn: "Normal", run: { italics: true }, paragraph: { alignment: AlignmentType.CENTER } }] },
    numbering: {
      config: [
        { reference: "bulleted", levels: listLevels(() => ({ format: LevelFormat.BULLET, text: "•" })) },
        ...[...context.numberedStarts].map((start) => ({
          reference: `numbered-${start}`,
          levels: listLevels((level) => ({
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            start: level === 0 ? start : 1,
          })),
        })),
      ],
    },
    footnotes: context.footnotes,
    sections: [{ children: [...opening, ...paragraphs] }],
  });

  const usable = (id: string) => IMAGE_TYPES[images.get(id)?.type ?? ""];
  return {
    bytes: await Packer.pack(document, "uint8array"),
    missingImages: imageIds(source).filter((id) => !usable(id)).length,
  };
}
