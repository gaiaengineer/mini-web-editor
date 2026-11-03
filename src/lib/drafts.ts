import type { JSONContent } from "@tiptap/core";
import { createStore, get, set, values, type UseStore } from "idb-keyval";
import type { ImportNotice } from "@/import/notices";
import type { CopyrightDetails } from "@/lib/bookPages";

export type Draft = {
  id: string;
  bookId: string;
  title: string;
  author: string;
  subtitle?: string;
  copyright?: CopyrightDetails;
  font?: string;
  // The look of every scene divider in the book. See lib/dividers.ts.
  divider?: string;
  // Spelling and grammar: "off" or an English dialect, the book's own dictionary
  // (character names and the like), and the mistakes the author chose to ignore.
  check?: string;
  dictionary?: string[];
  ignoredMistakes?: string;
  content: JSONContent;
  // What the import of a Word file couldn't keep, until someone dismisses it.
  notices?: ImportNotice[];
  updatedAt: string;
};

// The editor only talks to this interface, so where drafts are stored can change
// without touching editor code.
export interface DraftStore {
  list(): Promise<Draft[]>;
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
const draftsDb = () => (drafts ??= createStore("mini-web-editor", "drafts"));
const imagesDb = () => (images ??= createStore("mini-web-editor-images", "images"));

export const localDraftStore: DraftStore = {
  list: () => values<Draft>(draftsDb()),
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
