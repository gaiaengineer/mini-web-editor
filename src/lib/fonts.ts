import type { EpubFont } from "./epub";

export type BookFont = {
  id: string;
  label: string;
  group: "Serif" | "Sans-serif";
  family: string;
  fallback: string;
};

export const FONTS: BookFont[] = [
  { id: "literata", label: "Literata", group: "Serif", family: "Literata", fallback: "Georgia, serif" },
  { id: "lora", label: "Lora", group: "Serif", family: "Lora", fallback: "Georgia, serif" },
  { id: "pt-serif", label: "PT Serif", group: "Serif", family: "PT Serif", fallback: "Georgia, serif" },
  { id: "inter", label: "Inter", group: "Sans-serif", family: "Inter", fallback: "Helvetica, Arial, sans-serif" },
  { id: "open-sans", label: "Open Sans", group: "Sans-serif", family: "Open Sans", fallback: "Helvetica, Arial, sans-serif" },
];

const SUBSETS = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
};
type Subset = keyof typeof SUBSETS;

const VARIANTS = [
  { weight: 400, style: "normal" },
  { weight: 400, style: "italic" },
  { weight: 700, style: "normal" },
  { weight: 700, style: "italic" },
];

export const fontById = (id?: string) => FONTS.find((font) => font.id === id);

export const fontStack = (font: BookFont) => `"${font.family}", ${font.fallback}`;

const fileName = (font: BookFont, subset: Subset, weight: number, style: string) =>
  `${font.id}-${subset}-${weight}-${style}.woff2`;

function fontFaces(font: BookFont, subsets: Subset[], url: (file: string) => string) {
  return subsets
    .flatMap((subset) =>
      VARIANTS.map(({ weight, style }) => {
        const src = url(fileName(font, subset, weight, style));
        return `@font-face { font-family: "${font.family}"; font-style: ${style}; font-weight: ${weight}; font-display: swap; src: url("${src}") format("woff2"); unicode-range: ${SUBSETS[subset]}; }`;
      }),
    )
    .join("\n");
}

// Declaring a face doesn't download it, so unused character sets cost nothing here.
export const editorFontCss = (font: BookFont) =>
  fontFaces(font, ["latin", "cyrillic"], (file) => `/fonts/${font.id}/${file}`);

// Only what the book uses goes into the EPUB, to keep the download small.
export async function loadEpubFont(font: BookFont, text: string): Promise<EpubFont> {
  const subsets: Subset[] = /\p{Script=Cyrillic}/u.test(text) ? ["latin", "cyrillic"] : ["latin"];
  const names = subsets.flatMap((subset) =>
    VARIANTS.map(({ weight, style }) => fileName(font, subset, weight, style)),
  );
  const files = await Promise.all(
    names.map(async (name) => {
      const response = await fetch(`/fonts/${font.id}/${name}`);
      if (!response.ok) throw new Error(`Couldn’t load ${name}`);
      return { name, bytes: new Uint8Array(await response.arrayBuffer()) };
    }),
  );
  const css = `${fontFaces(font, subsets, (file) => `fonts/${file}`)}\nbody { font-family: ${fontStack(font)}; }\n`;
  return { css, files };
}
