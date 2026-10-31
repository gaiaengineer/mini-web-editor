import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildEpub, epubFileName } from "./index";

const text = (value: string, ...marks: string[]) => ({
  type: "text",
  text: value,
  marks: marks.map((type) => ({ type })),
});
const p = (...content: object[]) => ({ type: "paragraph", content });
const h = (level: number, value: string) => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
});
const doc = (...content: object[]) => ({ type: "doc", content });
const meta = { bookId: "abc", title: "Book", author: "Author", language: "en" };

function read(document: object) {
  const files = unzipSync(buildEpub(document, meta));
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

describe("buildEpub", () => {
  it("writes mimetype first and uncompressed", () => {
    const bytes = buildEpub(doc(p(text("x"))), meta);
    const header = strFromU8(bytes.slice(0, 58));
    expect(header.slice(30, 38)).toBe("mimetype");
    expect(header.slice(38, 58)).toBe("application/epub+zip");
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0);
  });

  it("keeps marks and alignment", () => {
    const files = read(
      doc({
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [text("all", "bold", "italic", "underline")],
      }),
    );
    expect(files["EPUB/chapter-001.xhtml"]).toContain(
      '<p class="center"><strong><em><u>all</u></em></strong></p>',
    );
  });

  it("starts a chapter at each H1 and nests the contents", () => {
    const files = read(doc(p(text("intro")), h(1, "One"), h(2, "Sub"), h(1, "Two"), h(3, "Deep")));
    expect(Object.keys(files).filter((f) => f.includes("chapter-"))).toHaveLength(3);
    expect(files["EPUB/nav.xhtml"]).toContain(
      '<li><a href="chapter-002.xhtml">One</a><ol><li><a href="chapter-002.xhtml#h2">Sub</a></li></ol></li>',
    );
    expect(files["EPUB/nav.xhtml"]).toContain('<a href="chapter-003.xhtml#h2">Deep</a>');
  });

  it("writes the title and author to the metadata", () => {
    const files = read(doc(p(text("x"))));
    const opf = files["EPUB/content.opf"];
    expect(opf).toContain("<dc:title>Book</dc:title>");
    expect(opf).toContain('<dc:creator id="creator">Author</dc:creator>');
    expect(opf).toContain('<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>');
    expect(files["EPUB/toc.ncx"]).toContain("<docTitle><text>Book</text></docTitle>");
    expect(files["EPUB/toc.ncx"]).toContain("<docAuthor><text>Author</text></docAuthor>");
    expect(files["EPUB/title.xhtml"]).toContain("<h1>Book</h1><p>Author</p>");
  });

  it("escapes and tidies metadata", () => {
    const epub = buildEpub(doc(p(text("x"))), { ...meta, title: " Tom  & <Jerry> ", author: "\u0001" });
    const opf = strFromU8(unzipSync(epub)["EPUB/content.opf"]);
    expect(opf).toContain("<dc:title>Tom &amp; &lt;Jerry&gt;</dc:title>");
    expect(opf).not.toContain("dc:creator");
  });

  it("falls back to Untitled when there is no title", () => {
    const epub = buildEpub(doc(p(text("x"))), { ...meta, title: "\u0001 " });
    expect(strFromU8(unzipSync(epub)["EPUB/content.opf"])).toContain("<dc:title>Untitled</dc:title>");
  });

  it("adds the contents as a page after the title page", () => {
    const opf = read(doc(h(1, "One"), h(1, "Two")))["EPUB/content.opf"];
    expect(opf).toMatch(/<itemref idref="title"\/>\s*<itemref idref="nav"\/>\s*<itemref idref="c1"\/>/);
  });

  it("skips the contents page when there is only one entry", () => {
    expect(read(doc(h(1, "One"), p(text("x"))))["EPUB/content.opf"]).not.toContain('idref="nav"');
  });

  it("points every contents entry at something that exists", () => {
    const files = read(
      doc(p(text("intro")), h(2, "Early"), h(1, "One"), h(2, "Sub"), h(3, "Deep"), h(1, "Two")),
    );
    const links = [
      ...[...files["EPUB/nav.xhtml"].matchAll(/href="(chapter[^"]+)"/g)],
      ...[...files["EPUB/toc.ncx"].matchAll(/src="(chapter[^"]+)"/g)],
    ].map((match) => match[1]);

    expect(links).toHaveLength(12);
    for (const link of links) {
      const [file, anchor] = link.split("#");
      expect(files[`EPUB/${file}`]).toBeDefined();
      if (anchor) expect(files[`EPUB/${file}`]).toContain(`id="${anchor}"`);
    }
  });

  it("splits on the top level the book actually uses", () => {
    const files = read(doc(h(2, "One"), h(3, "Sub"), h(2, "Two")));
    expect(Object.keys(files).filter((f) => f.includes("chapter-"))).toHaveLength(2);
  });

  it("removes characters that are illegal in XML", () => {
    const files = read(doc(p(text("a\u000bb & <c>"))));
    expect(files["EPUB/chapter-001.xhtml"]).toContain("<p>ab &amp; &lt;c&gt;</p>");
  });

  it("drops links that would be unsafe or invalid", () => {
    const link = (href: string) => ({
      type: "text",
      text: "x",
      marks: [{ type: "link", attrs: { href } }],
    });
    const files = read(doc(p(link("javascript:alert(1)")), p(link("https://example.com/a b"))));
    expect(files["EPUB/chapter-001.xhtml"]).toContain("<p>x</p>");
    expect(files["EPUB/chapter-001.xhtml"]).toContain('href="https://example.com/a%20b"');
  });

  it("embeds images and lists them in the manifest", () => {
    const image = {
      type: "bookImage",
      attrs: { assetId: "a1", mimeType: "image/png", alt: 'a "cat"', textAlign: "center" },
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const images = new Map([["a1", { bytes, type: "image/png" }]]);
    const epub = buildEpub(doc(image), meta, { images });
    const files = unzipSync(epub);
    expect(files["EPUB/images/a1.png"]).toEqual(bytes);
    expect(strFromU8(files["EPUB/content.opf"])).toContain(
      '<item id="img1" href="images/a1.png" media-type="image/png"/>',
    );
    expect(strFromU8(files["EPUB/chapter-001.xhtml"])).toContain(
      '<div class="image center"><img src="images/a1.png" alt="a &quot;cat&quot;"/></div>',
    );
  });

  it("leaves out images whose files are missing", () => {
    const image = { type: "bookImage", attrs: { assetId: "gone", mimeType: "image/png" } };
    const files = read(doc(p(text("x")), image));
    expect(files["EPUB/chapter-001.xhtml"]).not.toContain("<img");
    expect(files["EPUB/content.opf"]).not.toContain("gone");
  });

  it("embeds the chosen font", () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const font = {
      css: 'body { font-family: "Lora", serif; }\n',
      files: [{ name: "lora.woff2", bytes }],
    };
    const files = unzipSync(buildEpub(doc(p(text("x"))), meta, { font }));
    expect(files["EPUB/fonts/lora.woff2"]).toEqual(bytes);
    expect(strFromU8(files["EPUB/book.css"])).toContain('font-family: "Lora"');
    expect(strFromU8(files["EPUB/content.opf"])).toContain(
      '<item id="font1" href="fonts/lora.woff2" media-type="font/woff2"/>',
    );
  });

  it("still builds an empty book", () => {
    expect(read(doc(p()))["EPUB/nav.xhtml"]).toContain("Book");
  });
});

describe("epubFileName", () => {
  it("keeps Cyrillic and removes path characters", () => {
    expect(epubFileName("Война/мир: том 1")).toBe("Войнамир том 1.epub");
    expect(epubFileName("  ")).toBe("Untitled.epub");
  });
});
