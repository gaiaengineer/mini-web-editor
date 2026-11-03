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
    // Read only these bytes: the zip header before them holds the current time,
    // which doesn't always decode as text.
    expect(strFromU8(bytes.slice(30, 38))).toBe("mimetype");
    expect(strFromU8(bytes.slice(38, 58))).toBe("application/epub+zip");
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
    expect(opf).toMatch(/<itemref idref="title"\/>\s*<itemref idref="copyright"\/>\s*<itemref idref="nav"\/>\s*<itemref idref="c1"\/>/);
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

    expect(links).toHaveLength(10);
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

  it("doesn't repeat the title when the manuscript opens with it", () => {
    const files = read(doc(h(1, "Book"), p(text("It rained.")), h(1, "Chapter 1"), p(text("More."))));
    const chapters = Object.keys(files).filter((name) => /chapter-\d+/.test(name));
    expect(chapters).toHaveLength(2);
    expect(files["EPUB/chapter-001.xhtml"]).toContain("It rained.");
    expect(files["EPUB/chapter-001.xhtml"]).not.toContain("<h1");
  });

  it("recognises the title in capitals", () => {
    const files = read(doc(h(1, "BOOK"), p(text("It rained."))));
    expect(files["EPUB/chapter-001.xhtml"]).not.toContain("<h1");
  });

  describe("chapter subtitles", () => {
    const sub = (value: string, textAlign?: string) => ({ type: "subtitle", attrs: textAlign ? { textAlign } : {}, content: [text(value)] });
    const centred = { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [text("Chapter 1")] };

    it("are written with their heading as one heading group", () => {
      const files = read(doc(h(1, "Chapter 1"), sub("A rainy night"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(files["EPUB/chapter-001.xhtml"]).toContain(
        '<hgroup><h1 id="h1">Chapter 1</h1><p class="chapter-subtitle" role="doc-subtitle">A rainy night</p></hgroup>',
      );
    });

    it("aren't listed in the contents", () => {
      const files = read(doc(h(1, "Chapter 1"), sub("A rainy night"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(files["EPUB/nav.xhtml"]).toContain(">Chapter 1<");
      expect(files["EPUB/nav.xhtml"]).not.toContain("rainy");
      expect(files["EPUB/toc.ncx"]).not.toContain("rainy");
    });

    it("take their heading's alignment unless they have their own", () => {
      expect(read(doc(centred, sub("A rainy night"), p(text("x"))))["EPUB/chapter-001.xhtml"]).toContain('class="chapter-subtitle center"');
      expect(read(doc(centred, sub("A rainy night", "right"), p(text("x"))))["EPUB/chapter-001.xhtml"]).toContain('class="chapter-subtitle right"');
    });

    it("are ordinary text when no heading is above them", () => {
      const chapter = read(doc(p(text("x")), sub("Not under a heading")))["EPUB/chapter-001.xhtml"];
      expect(chapter).toContain("<p>Not under a heading</p>");
      expect(chapter).not.toContain("hgroup");
    });
  });

  describe("footnotes", () => {
    const note = (value: string) => ({ type: "footnote", attrs: { note: [text(value)] } });
    const book = doc(h(1, "One"), p(text("A debt."), note("Of honor.")), h(1, "Two"), p(text("Paid."), note("In gold."), text(" Then.")));
    const files = () => read(book);

    it("link to their note at the end of the book, numbered through it", () => {
      const second = files()["EPUB/chapter-002.xhtml"];
      expect(files()["EPUB/chapter-001.xhtml"]).toContain('<a id="noteref-1" href="notes.xhtml#note-1" epub:type="noteref" role="doc-noteref">1</a>');
      expect(second).toContain('id="noteref-2" href="notes.xhtml#note-2"');
      expect(second).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    });

    it("are listed on a notes page whose numbers lead back", () => {
      const notes = files()["EPUB/notes.xhtml"];
      expect(notes).toContain("<h1>Notes</h1>");
      expect(notes).toContain('<li id="note-1" epub:type="endnote"><a class="note-back" href="chapter-001.xhtml#noteref-1"');
      expect(notes).toContain("Of honor.");
      expect(notes).toContain('href="chapter-002.xhtml#noteref-2"');
    });

    it("put the notes page last, and in the reader's menu", () => {
      const all = files();
      expect([...all["EPUB/content.opf"].matchAll(/<itemref idref="([^"]+)"/g)].map(([, id]) => id).at(-1)).toBe("notes");
      expect(all["EPUB/nav.xhtml"]).toContain('<a href="notes.xhtml">Notes</a>');
      expect(all["EPUB/toc.ncx"]).toContain('src="notes.xhtml"');
    });

    it("keep a note's emphasis", () => {
      const styled = { type: "footnote", attrs: { note: [text("See "), text("The Ledger", "italic")] } };
      expect(read(doc(p(text("x"), styled)))["EPUB/notes.xhtml"]).toContain("See <em>The Ledger</em>");
    });

    it("leave a book without them with no notes page", () => {
      const plain = read(doc(h(1, "One"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(plain["EPUB/notes.xhtml"]).toBeUndefined();
      expect(plain["EPUB/content.opf"]).not.toContain("notes");
    });
  });

  describe("scene dividers", () => {
    const book = doc(p(text("x")), { type: "horizontalRule" }, p(text("y")));
    const chapter = (divider?: string) =>
      strFromU8(unzipSync(buildEpub(book, { ...meta, divider }))["EPUB/chapter-001.xhtml"]);

    it("are a line unless the author chose otherwise", () => {
      expect(chapter()).toContain("<hr/>");
    });

    it("use the style the author chose for the book", () => {
      expect(chapter("stars")).toContain('<p class="scene-break" role="separator">* * *</p>');
      expect(chapter("flower")).toContain(">❦</p>");
      expect(chapter("flower")).not.toContain("<hr");
    });

    it("fall back to a line for a style that no longer exists", () => {
      expect(chapter("gone")).toContain("<hr/>");
    });
  });

  it("drops a scene break at the end of a chapter but keeps one inside it", () => {
    const hr = { type: "horizontalRule" };
    const files = read(doc(h(1, "One"), p(text("x")), hr, p(text("y")), hr, h(1, "Two"), p(text("z"))));
    expect(files["EPUB/chapter-001.xhtml"].match(/<hr/g)).toHaveLength(1);
  });

  it("keeps a first heading that differs from the title", () => {
    const files = read(doc(h(1, "Prologue"), p(text("It rained."))));
    expect(files["EPUB/chapter-001.xhtml"]).toContain("Prologue</h1>");
  });

  describe("the contents page", () => {
    const place = (title: string, value: string) => ({ type: "heading", attrs: { level: 1, contentsHere: value }, content: [text(title)] });
    const spine = (files: Record<string, string>) =>
      [...files["EPUB/content.opf"].matchAll(/<itemref idref="([^"]+)"/g)].map(([, id]) => id);

    it("comes right after the title and copyright pages", () => {
      expect(spine(read(doc(h(1, "One"), p(text("x")), h(1, "Two"), p(text("y")))))).toEqual(["title", "copyright", "nav", "c1", "c2"]);
    });

    it("comes before an epigraph", () => {
      const epigraph = [p(text("“All happy families are alike.”")), p(text("— Leo Tolstoy"))];
      const files = read(doc(...epigraph, h(1, "One"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(spine(files)).toEqual(["title", "copyright", "nav", "c1", "c2", "c3"]);
      expect(files["EPUB/chapter-001.xhtml"]).toContain("Tolstoy");
    });

    it("comes before a dedication and copyright lines left in the text", () => {
      const files = read(doc(p(text("© 2026 A.")), p(text("For my mother.")), h(1, "Prologue"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(spine(files)).toEqual(["title", "copyright", "nav", "c1", "c2", "c3"]);
    });

    it("comes first even when the typed list sat later in the manuscript", () => {
      const files = read(doc(h(1, "Prologue"), p(text("x")), place("One", "Índice"), p(text("y")), h(1, "Two"), p(text("z"))));
      expect(spine(files)).toEqual(["title", "copyright", "nav", "c1", "c2", "c3"]);
      expect(files["EPUB/nav.xhtml"]).toContain("<h1>Índice</h1>");
    });

    it("uses the book's language when the manuscript gave no title", () => {
      const files = read(doc(p(text("Front.")), place("One", "contents"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(files["EPUB/nav.xhtml"]).toContain("<h1>Contents</h1>");
    });

    it("keeps every chapter reachable from the reader's menu", () => {
      const files = read(doc(h(1, "Foreword"), p(text("x")), place("One", "contents"), p(text("y")), h(1, "Two"), p(text("z"))));
      expect(files["EPUB/nav.xhtml"]).toContain(">Foreword<");
      expect(files["EPUB/toc.ncx"]).toContain(">Foreword<");
    });

    it("gives no entry to opening text with no heading of its own", () => {
      const files = read(doc(p(text("An opening paragraph.")), h(1, "One"), p(text("x")), h(1, "Two"), p(text("y"))));
      expect(files["EPUB/nav.xhtml"].slice(files["EPUB/nav.xhtml"].indexOf("<ol>"))).not.toContain(">Book<");
    });

    it("titles the page in the book's language", () => {
      const spanish = "La lluvia cayó sobre la ciudad y los vecinos de la plaza que estaban en el mercado se fueron para las casas del río.";
      const files = unzipSync(buildEpub(doc(h(1, "Uno"), p(text(spanish)), h(1, "Dos"), p(text(spanish))), { ...meta, language: undefined }));
      expect(strFromU8(files["EPUB/nav.xhtml"])).toContain("<h1>Índice</h1>");
    });

    it("lists only what comes after it", () => {
      const files = read(doc(p(text("© 2026 A. Writer.")), h(1, "One"), p(text("x")), h(1, "Two"), p(text("y"))));
      const list = files["EPUB/nav.xhtml"].slice(files["EPUB/nav.xhtml"].indexOf("<ol>"));
      expect(list).toContain(">One<");
      expect(list).toContain(">Two<");
      expect(list).not.toContain(">Book<");
    });

    it("isn't added to a book with nothing to list", () => {
      expect(spine(read(doc(p(text("Just some text."))))).includes("nav")).toBe(false);
    });
  });

  describe("generated pages", () => {
    const spine = (files: Record<string, string>) =>
      [...files["EPUB/content.opf"].matchAll(/<itemref idref="([^"]+)"/g)].map(([, id]) => id);
    const book = doc(h(1, "One"), p(text("x")), h(1, "Two"), p(text("y")));
    const pages = { ...meta, subtitle: "A novel", copyright: { year: "2019", isbn: "123" } };
    const built = () => Object.fromEntries(Object.entries(unzipSync(buildEpub(book, pages))).map(([k, v]) => [k, strFromU8(v)]));

    it("puts the title, copyright and contents pages first", () => {
      expect(spine(built())).toEqual(["title", "copyright", "nav", "c1", "c2"]);
    });

    it("shows the subtitle on the title page", () => {
      expect(built()["EPUB/title.xhtml"]).toContain("A novel");
    });

    it("writes the copyright page", () => {
      const page = built()["EPUB/copyright.xhtml"];
      expect(page).toContain("© 2019 Author. All rights reserved.");
      expect(page).toContain("ISBN 123");
      expect(built()["EPUB/content.opf"]).toContain('href="copyright.xhtml"');
    });

    it("has no copyright page with nothing to say", () => {
      const files = unzipSync(buildEpub(book, { ...meta, author: "" }));
      expect(files["EPUB/copyright.xhtml"]).toBeUndefined();
    });
  });

  it("embeds WebP images under their own extension", () => {
    const image = { type: "bookImage", attrs: { assetId: "a1", mimeType: "image/webp", alt: "" } };
    const images = new Map([["a1", { bytes: new Uint8Array([1]), type: "image/webp" }]]);
    const files = unzipSync(buildEpub(doc(p(text("Before")), image), meta, { images }));
    expect(files["EPUB/images/a1.webp"]).toBeDefined();
    expect(strFromU8(files["EPUB/content.opf"])).toContain('href="images/a1.webp" media-type="image/webp"');
  });

  it("leaves no trace of unreviewed import suggestions", () => {
    const suggested = {
      type: "paragraph",
      attrs: { suggestHeading: true, suggestAlign: "left", textAlign: "center" },
      content: [text("The Flood")],
    };
    const files = read(doc(suggested));
    const body = Object.values(files).join("");
    expect(body).toContain('<p class="center">The Flood</p>');
    expect(body).not.toMatch(/suggest/i);
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
