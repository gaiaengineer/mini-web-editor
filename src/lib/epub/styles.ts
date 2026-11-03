// Sizes are left to the reader's settings, and so is the font unless the author
// picked one; this only keeps the formatting they chose. Spacing matches the editor.
export const bookCss = `
body { margin: 0; overflow-wrap: break-word; }
p { margin: 0 0 0.8em; line-height: 1.5; }
h1, h2, h3 { line-height: 1.25; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.9em; margin: 1.2em 0 0.7em; }
h2 { font-size: 1.45em; margin: 1.2em 0 0.6em; }
h3 { font-size: 1.15em; margin: 1.1em 0 0.5em; }
blockquote { margin: 1em 1.5em; }
hr { border: 0; border-top: 1px solid currentColor; margin: 2em 25%; }
hgroup { page-break-inside: avoid; break-inside: avoid; page-break-after: avoid; break-after: avoid; }
hgroup h1, hgroup h2, hgroup h3 { margin-bottom: 0.25em; }
.chapter-subtitle { font-size: 1.2em; font-style: italic; line-height: 1.3; margin: 0 0 1.4em; text-indent: 0; }
.noteref { line-height: 0; }
.noteref a { text-decoration: none; }
.notes-page ol { margin: 0; padding: 0; list-style: none; }
.notes-page li { margin: 0 0 0.8em; line-height: 1.5; }
.note-back { font-weight: bold; }
.scene-break { text-align: center; text-indent: 0; margin: 1.2em 0; page-break-inside: avoid; break-inside: avoid; }
.image { margin: 1em 0; }
.image img { max-width: 100%; height: auto; }
nav ol { margin: 0; padding: 0; list-style: none; }
nav ol ol { padding-left: 1.5em; }
nav li { margin: 0.4em 0; }
nav a { color: inherit; text-decoration: none; }
.left { text-align: left; }
.center { text-align: center; }
.right { text-align: right; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { margin-bottom: 0.4em; }
.title-page p { font-size: 1.2em; }
.title-page .subtitle { font-style: italic; margin-bottom: 2em; }
.copyright-page { font-size: 0.85em; }
`.trimStart();
