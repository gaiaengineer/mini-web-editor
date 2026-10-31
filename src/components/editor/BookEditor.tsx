"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { EpubImages } from "@/lib/epub";
import { localDraftStore, newDraft, type Draft, type DraftStore } from "@/lib/drafts";
import { editorFontCss, fontById, fontStack, FONTS, loadEpubFont } from "@/lib/fonts";
import { cleanPastedHtml, keepPastedAlignment } from "@/lib/paste";
import { createExtensions } from "@/lib/schema";
import { Contents } from "./Contents";
import { ThemePicker } from "./ThemePicker";
import { Toolbar } from "./Toolbar";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { useImages } from "./useImages";
import { useNotice } from "./useNotice";
import "./editor.css";

type Props = {
  draftId?: string;
  store?: DraftStore;
};

export default function BookEditor({ draftId = "default", store = localDraftStore }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    store
      .load(draftId)
      .then((saved) => {
        if (!cancelled) setDraft(saved ?? newDraft(draftId));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, store, attempt]);

  // Never fall back to a blank editor here: the next autosave would overwrite
  // the draft that could not be read.
  if (failed) {
    return (
      <p className="load-error" role="alert">
        Couldn’t open your draft.{" "}
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </p>
    );
  }
  if (!draft) return null;
  return <Workspace key={draft.id} initial={draft} store={store} />;
}

function statusText(status: SaveStatus, savedAt: Date | null) {
  switch (status) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes";
    case "error":
      return "Couldn’t save. Try again";
    default:
      if (!savedAt) return "Saved on this device";
      const time = savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `Saved on this device at ${time}`;
  }
}

function downloadFile(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/epub+zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Workspace({ initial, store }: { initial: Draft; store: DraftStore }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const authorRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLSelectElement>(null);
  const [font, setFont] = useState(() => fontById(initial.font));
  // Open where it fits beside the text; elsewhere it covers the page, so it waits to be asked.
  const [contentsOpen, setContentsOpen] = useState(() => matchMedia("(min-width: 1100px)").matches);
  const closeContents = useCallback(() => setContentsOpen(false), []);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useNotice();

  const editor = useEditor({
    // Safe because this component never renders on the server (see EditorLoader).
    immediatelyRender: true,
    extensions: createExtensions(store),
    content: initial.content,
    editorProps: {
      transformPastedHTML: cleanPastedHtml,
      transformPasted: keepPastedAlignment,
      scrollMargin: { top: 120, right: 0, bottom: 110, left: 0 },
      scrollThreshold: { top: 120, right: 0, bottom: 110, left: 0 },
      attributes: { "aria-label": "Book text", "aria-multiline": "true", role: "textbox" },
    },
  });

  const getDraft = useCallback(
    (): Draft => ({
      ...initial,
      title: titleRef.current?.value ?? initial.title,
      author: authorRef.current?.value ?? initial.author,
      font: fontRef.current?.value ?? initial.font,
      content: editor.getJSON(),
    }),
    [editor, initial],
  );

  const { status, savedAt, markDirty, saveNow } = useAutosave(store, getDraft);
  const { insertFiles, imageNotice } = useImages(editor, store);

  useEffect(() => {
    editor.on("update", markDirty);
    return () => {
      editor.off("update", markDirty);
    };
  }, [editor, markDirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);

  const exportEpub = async () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const draft = getDraft();
      // Loaded on demand, so authors only download the zip code when they export.
      const { buildEpub, epubFileName, imageIds } = await import("@/lib/epub");

      const ids = imageIds(draft.content);
      const images: EpubImages = new Map();
      for (const id of ids) {
        const blob = await store.loadImage(id);
        if (blob) images.set(id, { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type });
      }

      const chosenFont = fontById(draft.font);
      const epubFont =
        chosenFont &&
        (await loadEpubFont(chosenFont, `${draft.title} ${draft.author} ${editor.getText()}`));

      downloadFile(
        buildEpub(draft.content, draft, { images, font: epubFont }) as Uint8Array<ArrayBuffer>,
        epubFileName(draft.title),
      );
      const missing = ids.length - images.size;
      const absent = [!draft.title.trim() && "a title", !draft.author.trim() && "an author"];
      if (missing) {
        setExportNotice(`Exported without ${missing} missing image${missing > 1 ? "s" : ""}`);
      } else if (absent.some(Boolean)) {
        setExportNotice(`Exported without ${absent.filter(Boolean).join(" or ")}`);
      }
    } catch (error) {
      console.error(error);
      setExportNotice("Export failed. Try again");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="editor-page">
      <header className="topbar">
        <Toolbar
          editor={editor}
          onImages={(files) => void insertFiles(files)}
          contentsOpen={contentsOpen}
          onToggleContents={() => setContentsOpen((open) => !open)}
        />
        <div className="topbar-actions">
          <span className={`save-status ${status === "error" ? "is-error" : ""}`} role="status">
            {imageNotice ?? exportNotice ?? statusText(status, savedAt)}
          </span>
          <ThemePicker />
          <button type="button" className="action" onClick={() => void saveNow()}>
            Save draft
          </button>
          <button
            type="button"
            className="action action-primary"
            onClick={() => void exportEpub()}
            disabled={exporting}
          >
            Export EPUB
          </button>
        </div>
      </header>

      <div className="editor-body">
        {contentsOpen && <Contents editor={editor} onClose={closeContents} />}
        <main className="sheet" style={{ "--book-font": font && fontStack(font) } as CSSProperties}>
          {font && <style>{editorFontCss(font)}</style>}
          <input
            ref={titleRef}
            className="book-title"
            defaultValue={initial.title}
            placeholder="Book title"
            aria-label="Book title"
            onChange={markDirty}
          />
          <div className="book-meta">
            <input
              ref={authorRef}
              className="book-author"
              defaultValue={initial.author}
              placeholder="Author"
              aria-label="Author"
              onChange={markDirty}
            />
            <select
              ref={fontRef}
              className="book-font"
              aria-label="Book font"
              defaultValue={font?.id ?? ""}
              onChange={(event) => {
                setFont(fontById(event.target.value));
                markDirty();
              }}
            >
              <option value="">Default font</option>
              {(["Serif", "Sans-serif"] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {FONTS.filter((option) => option.group === group).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <EditorContent editor={editor} />
        </main>
      </div>
    </div>
  );
}
