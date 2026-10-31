// Regenerates samples/ and docs/screenshots/ by driving the real app in a
// throwaway Chrome profile, so the sample EPUB is a genuine export.
//
//   npm run build && npx next start -p 3200
//   node scripts/capture-docs.mjs
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const APP_URL = process.env.APP_URL ?? "http://localhost:3200";
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9333;
const READER_PORT = 3301;
const SHOTS = "docs/screenshots";
const SAMPLE = "samples/the-rain-ledger.epub";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BOOK = {
  title: "The Rain Ledger",
  author: "Anna Sample",
  html: `
    <h1>Chapter One: The Keeper</h1>
    <p style="text-align: center"><em>For everyone who writes things down.</em></p>
    <p>Every evening at six, Mara climbed the ninety-one steps of the lighthouse and wrote the
    weather into a book that nobody had ever asked to read. The <strong>ledger</strong> was older
    than she was, and it smelled of salt and lamp oil.</p>
    <p></p>
    <p>Her predecessor had kept it in a tidy, slanted hand. <em>Fog. Wind from the west.</em>
    Then, one morning, a line that was not about the weather at all:
    <u>Someone is answering.</u></p>
    <h2>The Margin</h2>
    <p>Mara found the answers in the margins. They were small, neat and always written in pencil.
    Whenever the old keeper had noted rain, a second hand had added how much of it had fallen on
    the far side of the bay, where nobody had lived for forty years.</p>
    <h1>Chapter Two: The Far Shore</h1>
    <p>She took the rowing boat out on the first still morning of spring. The water lay flat and
    grey, and the lighthouse shrank behind her until she could cover it with one thumb.</p>
    <p>On the far shore stood a hut with a tin roof, a rain gauge on a post, and a table with a
    single sharpened pencil on it. There was no dust on the table.</p>
    <h2>The Last Entry</h2>
    <p>Mara sat down, opened the ledger and wrote the only honest thing she could think of.</p>
    <p style="text-align: center"><strong>Rain expected. Still here. Still writing.</strong></p>
    <p style="text-align: right"><em>M., the far shore</em></p>`,
  imageAlt: "A striped lighthouse on a dark headland, its beam cutting through slanting rain",
};

function startChrome() {
  const profile = mkdtempSync(join(tmpdir(), "mini-editor-docs-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  return { chrome, profile };
}

async function connect() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

async function openPage() {
  const socket = new WebSocket(await connect());
  await new Promise((resolve) => (socket.onopen = resolve));
  let nextId = 1;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const { id, result, error } = JSON.parse(data);
    if (!id) return;
    if (error) pending.get(id).reject(new Error(error.message));
    else pending.get(id).resolve(result);
    pending.delete(id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const run = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description);
    return result.value;
  };
  return { socket, send, run };
}

async function load(page, url) {
  await page.send("Page.navigate", { url });
  await sleep(1500);
  await page.run("document.fonts.ready.then(() => true)");
}

const viewport = (page, width, height, mobile = false) =>
  page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile,
  });

async function shot(page, name) {
  await sleep(350);
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  ${name}.png`);
}

const theme = (page, id) => page.run(`document.querySelector('input[value=${id}]').click()`);

const pickFont = (page, id) =>
  page.run(`(async () => {
    const select = document.querySelector(".book-font");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "${id}");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await document.fonts.ready;
  })()`);

// Runs in the page. Draws the book's illustration, so the repository needs no image asset.
const DRAW_ILLUSTRATION = `(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 700;
  const c = canvas.getContext("2d");
  c.fillStyle = "#12343b";
  c.fillRect(0, 0, 1200, 700);
  c.fillStyle = "#ffd98a";
  c.globalAlpha = 0.22;
  c.beginPath();
  c.moveTo(600, 190);
  c.lineTo(1200, 40);
  c.lineTo(1200, 330);
  c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = "rgba(255, 255, 255, 0.28)";
  c.lineWidth = 3;
  for (let i = 0; i < 170; i++) {
    const x = (i * 197) % 1300 - 60;
    const y = (i * 131) % 640;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 12, y + 44);
    c.stroke();
  }
  c.fillStyle = "#c9d6cf";
  c.beginPath();
  c.moveTo(0, 700);
  c.lineTo(0, 610);
  c.quadraticCurveTo(420, 500, 760, 620);
  c.quadraticCurveTo(1000, 690, 1200, 660);
  c.lineTo(1200, 700);
  c.fill();
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(556, 250);
  c.lineTo(644, 250);
  c.lineTo(672, 560);
  c.lineTo(528, 560);
  c.fill();
  c.fillStyle = "#b5473a";
  c.fillRect(548, 340, 104, 46);
  c.fillRect(536, 460, 128, 46);
  c.fillStyle = "#ffd98a";
  c.fillRect(566, 176, 68, 74);
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.moveTo(600, 128);
  c.lineTo(648, 176);
  c.lineTo(552, 176);
  c.fill();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
})()`;

async function writeBook(page) {
  await page.run(`(async () => {
    const editor = document.querySelector(".ProseMirror").editor;
    const setValue = (selector, value) => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setValue(".book-title", ${JSON.stringify(BOOK.title)});
    setValue(".book-author", ${JSON.stringify(BOOK.author)});
    editor.commands.setContent(${JSON.stringify(BOOK.html)}, { emitUpdate: true });

    let blank = 0;
    editor.state.doc.descendants((node, pos) => {
      if (!blank && node.type.name === "paragraph" && !node.textContent) blank = pos + 1;
    });
    editor.commands.setTextSelection(blank);

    const blob = await ${DRAW_ILLUSTRATION};
    const files = new DataTransfer();
    files.items.add(new File([blob], "lighthouse.png", { type: "image/png" }));
    const input = document.querySelector("input[type=file]");
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 800));

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "bookImage") {
        const attrs = { ...node.attrs, alt: ${JSON.stringify(BOOK.imageAlt)} };
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
      }
    });
  })()`);
  await sleep(500);
}

const selectText = (page, text) =>
  page.run(`(() => {
    const editor = document.querySelector(".ProseMirror").editor;
    let found = false;
    editor.state.doc.descendants((node, pos) => {
      const at = node.isText && !found ? node.text.indexOf(${JSON.stringify(text)}) : -1;
      if (at < 0) return;
      found = true;
      editor.commands.setTextSelection({ from: pos + at, to: pos + at + ${text.length} });
    });
    editor.view.focus();
  })()`);

async function saveDraft(page) {
  await page.run(`[...document.querySelectorAll("button")].find((b) => b.textContent === "Save draft").click()`);
  await sleep(500);
}

async function exportSample(page) {
  const base64 = await page.run(`new Promise((resolve) => {
    URL.createObjectURL = (blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
      return "blob:none";
    };
    [...document.querySelectorAll("button")].find((b) => b.textContent === "Export EPUB").click();
  })`);
  const bytes = Buffer.from(base64, "base64");
  writeFileSync(SAMPLE, bytes);
  console.log(`  ${SAMPLE} (${Math.round(bytes.length / 1024)} KB)`);
  return bytes;
}

function serveBook(bytes) {
  const files = unzipSync(new Uint8Array(bytes));
  const types = { xhtml: "application/xhtml+xml", css: "text/css", png: "image/png", woff2: "font/woff2" };
  const server = http.createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname).slice(1);
    const file = files[`EPUB/${path}`];
    if (!file) return response.writeHead(404).end();
    response.writeHead(200, { "Content-Type": types[path.split(".").pop()] ?? "text/plain" });
    response.end(file);
  });
  return new Promise((resolve) => server.listen(READER_PORT, "127.0.0.1", () => resolve(server)));
}

// The stylesheet is the book's own; this only adds the margins a reading app would.
const readerMargins = (page) =>
  page.run(`document.documentElement.style.cssText = "background:#fff;color:#1c2024;padding:36px 40px"`);

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync("samples", { recursive: true });

  const { chrome, profile } = startChrome();
  try {
    const page = await openPage();
    await page.send("Page.enable");
    await page.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });

    await viewport(page, 1360, 880);
    await load(page, APP_URL);
    await pickFont(page, "literata");
    await writeBook(page);

    console.log("Sample book");
    const bytes = await exportSample(page);
    const entries = strFromU8(unzipSync(new Uint8Array(bytes))["EPUB/nav.xhtml"]);
    console.log(`  contents entries: ${(entries.match(/<li>/g) ?? []).length}`);
    await saveDraft(page);
    await load(page, APP_URL);

    console.log("Screenshots");
    await selectText(page, "ledger");
    await shot(page, "01-editor");

    await page.run(`(() => {
      const editor = document.querySelector(".ProseMirror").editor;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "bookImage") {
          editor.commands.setNodeSelection(pos);
          editor.view.nodeDOM(pos).scrollIntoView({ block: "center" });
        }
      });
    })()`);
    await shot(page, "02-illustration");

    await selectText(page, "Someone is answering.");
    await page.run(`document.querySelector(".ProseMirror h2").scrollIntoView({ block: "center" })`);
    await shot(page, "03-formatting");

    await page.run("scrollTo(0, 0)");
    await theme(page, "dark");
    await shot(page, "04-theme-dark");
    await theme(page, "sepia");
    await shot(page, "05-theme-sepia");
    await theme(page, "light");

    await pickFont(page, "inter");
    await shot(page, "06-font-inter");
    await pickFont(page, "pt-serif");
    await shot(page, "07-font-pt-serif");
    await pickFont(page, "literata");
    await saveDraft(page);

    await viewport(page, 390, 844, true);
    await load(page, APP_URL);
    await selectText(page, "Someone is answering.");
    await page.run(`document.querySelector(".ProseMirror h2").scrollIntoView({ block: "center" })`);
    await shot(page, "08-phone-formatting");
    await page.run(`document.querySelector('[aria-label="Contents"]').click()`);
    await shot(page, "09-phone-contents");

    console.log("EPUB pages");
    const server = await serveBook(bytes);
    await viewport(page, 520, 760);
    for (const [file, name] of [
      ["title.xhtml", "10-epub-title"],
      ["nav.xhtml", "11-epub-contents"],
      ["chapter-001.xhtml", "12-epub-chapter-one"],
      ["chapter-002.xhtml", "13-epub-chapter-two"],
    ]) {
      await load(page, `http://127.0.0.1:${READER_PORT}/${file}`);
      await readerMargins(page);
      await shot(page, name);
    }
    server.close();
    page.socket.close();
  } finally {
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
