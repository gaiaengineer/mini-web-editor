// Copies the fonts offered in the editor from @fontsource into public/fonts.
// They are served from there because EPUB export needs the raw files.
import { copyFileSync, mkdirSync } from "node:fs";

const FONTS = ["literata", "lora", "pt-serif", "inter", "open-sans"];
const VARIANTS = ["400-normal", "400-italic", "700-normal", "700-italic"];

for (const font of FONTS) {
  const from = `node_modules/@fontsource/${font}`;
  const to = `public/fonts/${font}`;
  mkdirSync(to, { recursive: true });
  copyFileSync(`${from}/LICENSE`, `${to}/LICENSE`);
  for (const subset of ["latin", "cyrillic"]) {
    for (const variant of VARIANTS) {
      const file = `${font}-${subset}-${variant}.woff2`;
      copyFileSync(`${from}/files/${file}`, `${to}/${file}`);
    }
  }
}
