import { describe, expect, it } from "vitest";
import { IMAGE, makeDocx, paragraph, table } from "@/import/test-helpers";
import { listBooks, openWordFile, startBlankBook } from "./books";
import { newDraft, type Draft, type DraftStore } from "./drafts";

function memoryStore(drafts: Draft[] = []): DraftStore & { images: string[] } {
  const saved = new Map(drafts.map((draft) => [draft.id, draft]));
  const images: string[] = [];
  return {
    images,
    list: async () => [...saved.values()],
    load: async (id) => saved.get(id) ?? null,
    save: async (draft) => void saved.set(draft.id, draft),
    loadImage: async () => null,
    saveImage: async (id) => void images.push(id),
  };
}

const book = (id: string, title: string, updatedAt: string): Draft => ({ ...newDraft(id), title, updatedAt });

describe("listBooks", () => {
  it("lists the most recently changed book first", async () => {
    const store = memoryStore([
      book("old", "Old", "2026-01-01T00:00:00.000Z"),
      book("new", "New", "2026-06-01T00:00:00.000Z"),
    ]);
    expect((await listBooks(store)).map(({ id }) => id)).toEqual(["new", "old"]);
  });

  it("names a book that has no title yet", async () => {
    const store = memoryStore([book("a", "   ", "2026-01-01T00:00:00.000Z")]);
    expect((await listBooks(store))[0].title).toBe("Untitled book");
  });

  it("gives an empty list when there are no books", async () => {
    expect(await listBooks(memoryStore())).toEqual([]);
  });

  it("reports a failure instead of an empty list", async () => {
    const store = memoryStore();
    store.list = async () => {
      throw new Error("storage failed");
    };
    await expect(listBooks(store)).rejects.toThrow("storage failed");
  });
});

describe("startBlankBook", () => {
  it("saves a new book and leaves the others unchanged", async () => {
    const existing = book("a", "Mine", "2026-01-01T00:00:00.000Z");
    const store = memoryStore([existing]);
    const id = await startBlankBook(store);
    expect(id).not.toBe("a");
    expect(await store.load(id)).toMatchObject({ id, title: "" });
    expect(await store.load("a")).toEqual(existing);
  });
});

describe("openWordFile", () => {
  const wordFile = (bytes: Uint8Array, name = "The Ledger.docx") => ({
    name,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  });

  const opened = async (store: DraftStore, bytes: Uint8Array, name?: string) => {
    const result = await openWordFile(wordFile(bytes, name), store);
    if (!result.ok) throw new Error(result.reason);
    return (await store.load(result.id))!;
  };

  it("adds a new book and leaves the others unchanged", async () => {
    const existing = book("a", "Mine", "2026-01-01T00:00:00.000Z");
    const store = memoryStore([existing]);
    const draft = await opened(store, makeDocx([paragraph("It rained.")]));
    expect((await store.list()).length).toBe(2);
    expect(draft.id).not.toBe("a");
    expect(await store.load("a")).toEqual(existing);
  });

  it("names the book after the file when Word gives no title", async () => {
    const draft = await opened(memoryStore(), makeDocx([paragraph("It rained.")]));
    expect(draft.title).toBe("The Ledger");
  });

  it("keeps the import's notices on the book", async () => {
    const store = memoryStore();
    const draft = await opened(store, makeDocx([paragraph("It rained."), table("A cell")]));
    expect(draft.notices?.map((notice) => notice.kind)).toEqual(["table"]);
  });

  it("stores images and refers to them from the book", async () => {
    const store = memoryStore();
    const draft = await opened(store, makeDocx([paragraph(IMAGE)], { image: "png" }));
    const image = draft.content.content?.find((block) => block.type === "bookImage");
    expect(store.images).toEqual([image?.attrs?.assetId]);
  });

  it("creates no book from a damaged file", async () => {
    const store = memoryStore();
    const result = await openWordFile(wordFile(new Uint8Array([1, 2, 3])), store);
    expect(result).toEqual({ ok: false, reason: "unreadable" });
    expect(await store.list()).toEqual([]);
  });

  it("creates no book from an old .doc file", async () => {
    const store = memoryStore();
    const oldWordHeader = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const result = await openWordFile(wordFile(oldWordHeader, "old.doc"), store);
    expect(result).toEqual({ ok: false, reason: "unreadable" });
    expect(await store.list()).toEqual([]);
  });

  it("creates no book from an empty document", async () => {
    const store = memoryStore();
    const result = await openWordFile(wordFile(makeDocx([paragraph()])), store);
    expect(result).toEqual({ ok: false, reason: "empty" });
    expect(await store.list()).toEqual([]);
  });

  it("reports a failure to save the book", async () => {
    const store = memoryStore();
    store.save = async () => {
      throw new Error("storage failed");
    };
    await expect(openWordFile(wordFile(makeDocx([paragraph("It rained.")])), store)).rejects.toThrow("storage failed");
  });
});
