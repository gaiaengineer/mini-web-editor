import type { JSONContent } from "@tiptap/core";
import { createStore, get, set, type UseStore } from "idb-keyval";

export type Draft = {
  id: string;
  bookId: string;
  title: string;
  author: string;
  font?: string;
  content: JSONContent;
  updatedAt: string;
};

// The editor only talks to this interface. To keep drafts on the Ruby backend,
// implement it over the API and pass it to <BookEditor store={...} />.
export interface DraftStore {
  load(id: string): Promise<Draft | null>;
  save(draft: Draft): Promise<void>;
  loadImage(id: string): Promise<Blob | null>;
  saveImage(id: string, image: Blob): Promise<void>;
}

// IndexedDB rather than localStorage: a long book can outgrow the 5 MB quota.
// Images need a database of their own: idb-keyval only creates one object store
// per database. They are kept out of the draft so that autosave stays small.
let drafts: UseStore | undefined;
let images: UseStore | undefined;
const draftsDb = () => (drafts ??= createStore("written-editor", "drafts"));
const imagesDb = () => (images ??= createStore("written-editor-images", "images"));

export const localDraftStore: DraftStore = {
  load: async (id) => (await get<Draft>(id, draftsDb())) ?? null,
  save: (draft) => set(draft.id, draft, draftsDb()),
  loadImage: async (id) => (await get<Blob>(id, imagesDb())) ?? null,
  saveImage: (id, image) => set(id, image, imagesDb()),
};

export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newDraft(id: string): Draft {
  return {
    id,
    bookId: randomId(),
    title: "",
    author: "",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    updatedAt: new Date().toISOString(),
  };
}
