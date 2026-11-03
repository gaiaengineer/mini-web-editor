import mammoth from "mammoth";

type WordParagraph = { alignment?: string; numbering?: unknown; styleName?: string };

// Mammoth's HTML has no alignment, so a paragraph that needs it travels under a
// marker style. Its transforms API is unstable, which is why the version is pinned.
const ALIGNMENT_STYLES: Record<string, string> = { center: "book-center", right: "book-right" };
const KEEPS_ITS_STYLE = /^(heading \d|title|subtitle)$/i;

// Formats that e-readers and browsers can show.
const READABLE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const STYLE_MAP = [
  "p[style-name='book-center'] => p.align-center:fresh",
  "p[style-name='book-right'] => p.align-right:fresh",
  "p[style-name='Title'] => h1.book-title:fresh",
  "p[style-name='Subtitle'] => h2.book-subtitle:fresh",
  "u => u",
  "br[type='page'] => br.page-break",
];

function markAlignment(paragraph: WordParagraph) {
  const style = ALIGNMENT_STYLES[paragraph.alignment ?? ""];
  if (!style || paragraph.numbering || KEEPS_ITS_STYLE.test(paragraph.styleName ?? "")) return paragraph;
  return { ...paragraph, styleName: style };
}

type Transforms = { transforms: { paragraph: (change: (p: WordParagraph) => WordParagraph) => (doc: unknown) => unknown } };

export type SaveImage = (image: Blob) => Promise<string>;

export async function docxToHtml(bytes: Uint8Array, saveImage: SaveImage) {
  const data = bytes.slice().buffer;
  // Mammoth reads `buffer` in Node and `arrayBuffer` in browsers.
  const input = { arrayBuffer: data, buffer: data } as unknown as Parameters<typeof mammoth.convertToHtml>[0];

  const { value } = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    ignoreEmptyParagraphs: false,
    transformDocument: (mammoth as unknown as Transforms).transforms.paragraph(markAlignment),
    convertImage: mammoth.images.imgElement(async (image) => {
      // Mammoth swallows errors from here, so a lost image has to be marked for the
      // author to hear about it.
      const lost = { src: "", "data-lost-image": "" };
      if (!READABLE_IMAGES.has(image.contentType)) return lost;
      try {
        const assetId = await saveImage(new Blob([await image.readAsArrayBuffer()], { type: image.contentType }));
        return { src: "", "data-asset-id": assetId, "data-mime-type": image.contentType };
      } catch {
        return lost;
      }
    }),
  });
  return value;
}
