import { strFromU8, unzipSync } from "fflate";

// "footnote" is no longer reported, since footnotes are kept, but older drafts may hold it.
export type ImportNotice = { kind: "footnote" | "table" | "textBox" | "image" | "contents" | "copyright" | "title"; near: string };

const OPENING_WORDS = 6;

function openingWords(text: string) {
  const words = text.trim().split(/\s+/);
  return words.length > OPENING_WORDS ? `${words.slice(0, OPENING_WORDS).join(" ")}…` : words.join(" ");
}

const topLevelBlock = (el: Element) => {
  let block = el;
  while (block.parentElement && block.parentElement.tagName !== "BODY") block = block.parentElement;
  return block;
};

// The nearest heading before the content, or the nearest text when there is none.
function locate(el: Element) {
  const block = topLevelBlock(el);
  let nearestText = "";
  for (let before = block.previousElementSibling; before; before = before.previousElementSibling) {
    if (/^H[1-6]$/.test(before.tagName)) return openingWords(before.textContent ?? "");
    nearestText ||= before.textContent?.trim() ?? "";
  }
  return openingWords(nearestText || (block.textContent ?? ""));
}

const compact = (text: string) => text.replace(/\s+/g, "");

// Mammoth reads text boxes as ordinary paragraphs, so they can only be found in
// the file. Returns each box as the text of its paragraphs.
function textBoxes(bytes: Uint8Array) {
  const xml = strFromU8(unzipSync(bytes, { filter: (file) => file.name === "word/document.xml" })["word/document.xml"]);
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const boxes = [...parsed.getElementsByTagName("w:txbxContent")].map((box) =>
    [...box.getElementsByTagName("w:p")].map((p) => compact(p.textContent ?? "")).filter(Boolean),
  );
  // Word stores each text box twice, for old and new readers.
  const unique = new Map(boxes.map((box) => [box.join("\n"), box]));
  return [...unique.values()].filter((box) => box.length);
}

// Marks text box paragraphs for the cleanup, which would otherwise read the empty
// paragraph that anchored the box as a scene break.
function findTextBoxes(doc: Document, bytes: Uint8Array) {
  const paragraphs = [...doc.body.querySelectorAll("p")];
  const notices: ImportNotice[] = [];
  for (const box of textBoxes(bytes)) {
    const found = paragraphs.filter((p) => box.includes(compact(p.textContent ?? "")));
    for (const p of found) p.setAttribute("data-text-box", "");
    if (found[0]) notices.push({ kind: "textBox", near: openingWords(found[0].textContent ?? "") });
  }
  return notices;
}

export function findNotices(doc: Document, bytes: Uint8Array) {
  const notices: ImportNotice[] = [];
  for (const table of doc.querySelectorAll("table")) notices.push({ kind: "table", near: locate(table) });
  for (const image of doc.querySelectorAll("img[data-lost-image]")) notices.push({ kind: "image", near: locate(image) });
  return [...notices, ...findTextBoxes(doc, bytes)];
}
