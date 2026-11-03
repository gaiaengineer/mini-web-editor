import { describe, expect, it } from "vitest";
import { buildPreview } from "./preview";

const text = (value: string) => ({ type: "text", text: value });
const doc = (...content: object[]) => ({ type: "doc", content });
const meta = { title: "The Ledger", author: "A. Writer" };
const image = (assetId: string) => ({ type: "bookImage", attrs: { assetId, mimeType: "image/png", alt: "" } });

describe("buildPreview", () => {
  it("shows the title page and the book's styles", () => {
    const page = buildPreview(doc({ type: "paragraph", content: [text("It rained.")] }), meta);
    expect(page).toContain('<div class="title-page" id="title-page"><h1>The Ledger</h1><p>A. Writer</p></div>');
    expect(page).toContain("<p>It rained.</p>");
    expect(page).toContain("page-break-after");
  });

  it("shows an unreviewed suggestion as an ordinary line", () => {
    const suggested = { type: "paragraph", attrs: { suggestHeading: true, suggestAlign: "left" }, content: [text("The Flood")] };
    const page = buildPreview(doc(suggested), meta);
    expect(page).toContain("<p>The Flood</p>");
    expect(page).not.toMatch(/suggest/i);
  });

  it("shows an accepted chapter as a heading", () => {
    const page = buildPreview(doc({ type: "heading", attrs: { level: 1 }, content: [text("The Flood")] }), meta);
    expect(page).toMatch(/<h1[^>]*>The Flood<\/h1>/);
  });

  it("points stored images at their addresses", () => {
    const page = buildPreview(doc(image("a1")), meta, { imageUrls: new Map([["a1", "blob:one"]]) });
    expect(page).toContain('src="blob:one"');
    expect(page).not.toContain("images/a1");
  });

  it("leaves out an image that isn't stored", () => {
    expect(buildPreview(doc(image("gone")), meta)).not.toContain("<img");
  });

  it("shows special characters as text", () => {
    const page = buildPreview(doc({ type: "paragraph", content: [text("a < b & c")] }), { title: "<Title>", author: "" });
    expect(page).toContain("a &lt; b &amp; c");
    expect(page).toContain("&lt;Title&gt;");
  });

  it("gives an empty book a valid page", () => {
    const page = buildPreview(doc(), { title: "", author: "" });
    expect(page).toContain("<h1>Untitled</h1>");
    expect(page).toContain("</html>");
  });

  it("opens links away from the book", () => {
    expect(buildPreview(doc(), meta)).toContain('<base target="_blank">');
  });

  it("lays the book out as pages, with each chapter on a new one", () => {
    const page = buildPreview(doc(), meta);
    expect(page).toContain("column-width");
    expect(page).toContain("break-before: column;");
    expect(page).toContain("-webkit-column-break-before: always;");
    expect(page).toMatch(/\.title-page, \.copyright-page, \.contents-page \{ min-height/);
  });

  it("uses the device's screen", () => {
    const screen = { paper: "#f4f3ee", ink: "#222222", fontSize: 21, margin: 30 };
    const page = buildPreview(doc(), meta, { screen });
    expect(page).toContain("background: #f4f3ee");
    expect(page).toContain("color: #222222");
    expect(page).toContain("font-size: 21px");
    expect(page).toContain("padding: 30px 0");
  });

  describe("the contents page", () => {
    const h = (level: number, value: string) => ({ type: "heading", attrs: { level }, content: [text(value)] });
    const book = doc(h(1, "One"), { type: "paragraph", content: [text("x")] }, h(2, "Inside"), h(1, "Two"));

    it("appears between the title page and the first chapter", () => {
      const page = buildPreview(book, meta);
      const [title, contents, first] = ["title-page", "contents-page", "<section id"].map((part) => page.indexOf(part, page.indexOf("<body")));
      expect(title).toBeLessThan(contents);
      expect(contents).toBeLessThan(first);
    });

    it("links each entry to its place in the book", () => {
      const page = buildPreview(book, meta);
      const [, target] = /<a target="_self" href="#([^"]+)">Inside<\/a>/.exec(page) ?? [];
      expect(page).toContain(`id="${target}"`);
    });

    it("comes before any book text, an epigraph included", () => {
      const epigraph = { type: "paragraph", content: [text("“All happy families are alike.”")] };
      const page = buildPreview(doc(epigraph, ...book.content), meta);
      expect(page.indexOf("contents-page", page.indexOf("<body"))).toBeLessThan(page.indexOf("All happy families"));
    });
  });

  it("links a footnote to its note and the note back, within the page", () => {
    const book = doc({ type: "paragraph", content: [text("x"), { type: "footnote", attrs: { note: [text("A note.")] } }] });
    const page = buildPreview(book, meta);
    expect(page).toContain('id="noteref-1" target="_self" href="#note-1"');
    expect(page).toContain('<li id="note-1"');
    expect(page).toContain('target="_self" href="#noteref-1"');
    expect(page.indexOf('id="notes"')).toBeGreaterThan(page.indexOf('id="noteref-1"'));
  });

  it("shows a chapter subtitle with its heading", () => {
    const book = doc({ type: "heading", attrs: { level: 1 }, content: [text("Chapter 1")] }, { type: "subtitle", content: [text("A rainy night")] });
    expect(buildPreview(book, meta)).toMatch(/<hgroup><h1 id="chapter-001-h1">Chapter 1<\/h1><p class="chapter-subtitle" role="doc-subtitle">A rainy night<\/p><\/hgroup>/);
  });

  it("shows scene dividers in the book's style", () => {
    const book = doc({ type: "paragraph", content: [text("x")] }, { type: "horizontalRule" }, { type: "paragraph", content: [text("y")] });
    expect(buildPreview(book, { ...meta, divider: "stars" })).toContain('class="scene-break"');
  });

  it("shows the subtitle and the copyright page before the contents", () => {
    const h = (value: string) => ({ type: "heading", attrs: { level: 1 }, content: [text(value)] });
    const page = buildPreview(doc(h("One"), h("Two")), { ...meta, subtitle: "A novel", copyright: { isbn: "123" } });
    expect(page).toContain("A novel");
    const body = page.slice(page.indexOf("<body"));
    expect(body.indexOf('id="copyright-page"')).toBeGreaterThan(body.indexOf('id="title-page"'));
    expect(body.indexOf('id="copyright-page"')).toBeLessThan(body.indexOf('id="contents-page"'));
  });

  it("starts each generated page and the main text on a new page", () => {
    const h = (value: string) => ({ type: "heading", attrs: { level: 1 }, content: [text(value)] });
    const page = buildPreview(doc(h("One"), h("Two")), meta);
    expect(page).toContain("break-before: column;");
    expect(page).toContain("-webkit-column-break-before: always;");
    expect(page).toMatch(/\.title-page, \.copyright-page, \.contents-page \{ min-height/);
    expect(page).toContain('<section class="copyright-page"');
    expect(page).toContain('<nav class="contents-page"');
  });

  it("breaks long unbroken text instead of running off the page", () => {
    expect(buildPreview(doc(), meta)).toContain("overflow-wrap: anywhere;");
  });

  it("uses the chosen font", () => {
    expect(buildPreview(doc(), meta, { fontCss: "body { font-family: Lora; }" })).toContain("font-family: Lora");
  });
});
