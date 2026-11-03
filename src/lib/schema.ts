import { Extension } from "@tiptap/core";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { BookImage } from "@/components/editor/BookImage";
import type { DraftStore } from "./drafts";
import { Footnote } from "./footnote";
import { Subtitle } from "./subtitle";

// Import suggestions wait on the paragraph itself, so they move with edits and are
// saved with the draft. They never reach readers: the EPUB builder reads only the
// attributes it knows about.
const ImportSuggestions = Extension.create({
  name: "importSuggestions",
  addGlobalAttributes: () => [
    {
      types: ["paragraph"],
      attributes: {
        suggestHeading: {
          default: null,
          rendered: false,
          keepOnSplit: false,
          parseHTML: (el) => el.hasAttribute("data-suggest-heading") || null,
        },
        suggestAlign: {
          default: null,
          rendered: false,
          keepOnSplit: false,
          parseHTML: (el) => el.getAttribute("data-suggest-align"),
        },
      },
    },
    {
      types: ["paragraph", "heading"],
      attributes: {
        suggestSubtitle: {
          default: null,
          rendered: false,
          keepOnSplit: false,
          parseHTML: (el) => el.hasAttribute("data-suggest-subtitle") || null,
        },
      },
    },
  ],
});

// Where the book's contents page goes, if the manuscript said. It holds the title
// the author used, and readers see it only as that page.
const ContentsPlace = Extension.create({
  name: "contentsPlace",
  addGlobalAttributes: () => [
    {
      types: ["paragraph", "heading"],
      attributes: {
        contentsHere: {
          default: null,
          rendered: false,
          keepOnSplit: false,
          parseHTML: (el) => el.getAttribute("data-contents-here"),
        },
      },
    },
  ],
});

// The document schema. Anything added here must also be handled by the EPUB
// serializer, otherwise it will be dropped from the EPUB.
export const createExtensions = (store: DraftStore | null) => [
  ImportSuggestions,
  ContentsPlace,
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    link: { openOnClick: false },
  }),
  TextAlign.configure({
    types: ["heading", "paragraph", "subtitle", "bookImage"],
    alignments: ["left", "center", "right"],
  }),
  Placeholder.configure({ placeholder: "Start writing…" }),
  BookImage.configure({ store }),
  Footnote,
  Subtitle,
];
