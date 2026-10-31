import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { BookImage } from "@/components/editor/BookImage";
import type { DraftStore } from "./drafts";

// The document schema. Anything added here must also be handled by
// lib/epub/serialize.ts, otherwise it will be dropped from the EPUB.
export const createExtensions = (store: DraftStore) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    link: { openOnClick: false },
  }),
  TextAlign.configure({
    types: ["heading", "paragraph", "bookImage"],
    alignments: ["left", "center", "right"],
  }),
  Placeholder.configure({ placeholder: "Start writing…" }),
  BookImage.configure({ store }),
];
