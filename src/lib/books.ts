import { newDraft, randomId, type DraftStore } from "./drafts";

export async function listBooks(store: DraftStore) {
  const drafts = await store.list();
  return drafts
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, title, updatedAt }) => ({ id, title: title.trim() || "Untitled book", updatedAt }));
}

export async function startBlankBook(store: DraftStore) {
  const id = randomId();
  await store.save(newDraft(id));
  return id;
}

// Loaded on demand, so the list page doesn't carry the importer until it's used.
export async function openWordFile(file: Pick<File, "name" | "arrayBuffer">, store: DraftStore) {
  const { importDocx } = await import("@/import");
  const book = await importDocx(new Uint8Array(await file.arrayBuffer()), {
    fileName: file.name,
    saveImage: async (image) => {
      const id = randomId();
      await store.saveImage(id, image);
      return id;
    },
  });
  if (!book.ok) return book;

  const id = randomId();
  await store.save({
    ...newDraft(id),
    title: book.title,
    subtitle: book.subtitle,
    author: book.author ?? "",
    copyright: book.copyright,
    content: book.content,
    notices: book.notices,
  });
  return { ok: true as const, id };
}
