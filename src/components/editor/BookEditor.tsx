"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { dividerById } from "@/lib/dividers";
import { localDraftStore, type Draft, type DraftStore } from "@/lib/drafts";
import { editorFontCss, fontById, fontStack } from "@/lib/fonts";
import { cleanPastedHtml, keepPastedAlignment } from "@/lib/paste";
import { createExtensions } from "@/lib/schema";
// Production builds replace this with nothing. See next.config.ts.
import TeamEpubCheck from "@/components/editor/TeamEpubCheck";
import { BookPreview, type PreviewJump, type PreviewPlace } from "./BookPreview";
import { Contents, type BookView } from "./Contents";
import { FootnoteEditor, FootnoteList } from "./Footnotes";
import { GrammarCheck, type OpenMistake } from "./grammarCheck";
import { GrammarPopup } from "./GrammarPopup";
import { GrammarSettings } from "./grammarSettings";
import { NoticeList } from "./NoticeList";
import { CopyrightForm, TitlePageForm, type EditablePages } from "./PageForms";
import { PREVIEW_DEVICES } from "./previewDevices";
import { Toolbar } from "./Toolbar";
import { SettingsMenu } from "./SettingsMenu";
import { StatusBar } from "./StatusBar";
import { SuggestionMarks } from "./suggestions";
import { SuggestionReview } from "./SuggestionReview";
import { useAutosave, type SaveStatus } from "./useAutosave";
import { useImages } from "./useImages";
import { useNotice } from "./useNotice";
import { WordDownload } from "./WordDownload";
import "./editor.css";

type Props = {
  draftId: string;
  store?: DraftStore;
};

export default function BookEditor({ draftId, store = localDraftStore }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    store
      .load(draftId)
      .then((saved) => {
        if (cancelled) return;
        setDraft(saved);
        setMissing(!saved);
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
  // Never start a blank book here either, for the same reason.
  if (missing) {
    return (
      <p className="load-error" role="alert">
        This book isn’t in this browser. <a href="/">All books</a>
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

function Workspace({ initial, store }: { initial: Draft; store: DraftStore }) {
  const [pages, setPages] = useState<EditablePages>({
    title: initial.title,
    author: initial.author,
    subtitle: initial.subtitle,
    copyright: initial.copyright,
  });
  const pagesRef = useRef(pages);
  const [view, setView] = useState<BookView>("text");
  const [previewJump, setPreviewJump] = useState<PreviewJump | null>(null);
  const clearPreviewJump = useCallback(() => setPreviewJump(null), []);
  const fontId = useRef(initial.font);
  const [font, setFont] = useState(() => fontById(initial.font));
  const dividerId = useRef(dividerById(initial.divider).id);
  const [divider, setDivider] = useState(() => dividerById(initial.divider).id);
  const [grammar] = useState(() => new GrammarSettings(initial));
  const [check, setCheck] = useState(grammar.check);
  // Open where it fits beside the text; elsewhere it covers the page, so it waits to be asked.
  const [contentsOpen, setContentsOpen] = useState(() => matchMedia("(min-width: 1100px)").matches);
  const closeContents = useCallback(() => setContentsOpen(false), []);
  const [notices, setNotices] = useState(initial.notices);
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const [previewPlace, setPreviewPlace] = useState<PreviewPlace>({ deviceId: PREVIEW_DEVICES[0].id, position: 0 });
  const noticesRef = useRef(initial.notices);
  const [outputNotice, setOutputNotice] = useNotice();

  const editor = useEditor({
    // Safe because this component never renders on the server (see EditorLoader).
    immediatelyRender: true,
    extensions: [...createExtensions(store), SuggestionMarks, GrammarCheck.configure({ checker: () => grammar.checker() })],
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
      ...pagesRef.current,
      font: fontId.current,
      divider: dividerId.current,
      ...grammar.saved(),
      content: editor.getJSON(),
      notices: noticesRef.current,
    }),
    [editor, initial, grammar],
  );

  const { status, savedAt, markDirty, saveNow, flush } = useAutosave(store, getDraft);
  const { insertFiles, imagesAdded, imageNotice } = useImages(editor, store);

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

  const changePages = (change: Partial<EditablePages>) => {
    pagesRef.current = { ...pagesRef.current, ...change };
    setPages(pagesRef.current);
    markDirty();
  };

  // The preview follows where the author is, if there's room for it beside them.
  const showInPreview = (page: string, open: boolean) => {
    if (open) setPreviewOpen(true);
    if (open || previewOpen) setPreviewJump((jump) => ({ page, count: (jump?.count ?? 0) + 1 }));
  };

  const showPage = (next: BookView) => {
    setView(next);
    if (next === "text") {
      editor.commands.focus();
      return;
    }
    showInPreview(`${next}-page`, matchMedia("(min-width: 1100px)").matches);
  };

  const changeFont = (id: string) => {
    fontId.current = id;
    setFont(fontById(id));
    markDirty();
  };

  const changeDivider = (id: string) => {
    dividerId.current = dividerById(id).id;
    setDivider(dividerId.current);
    markDirty();
  };

  // The browser's own spell check would mark the same words a second time, and
  // knows nothing of the book's dictionary. It stays on when this check is off.
  useEffect(() => {
    editor.view.dom.setAttribute("spellcheck", grammar.checker() ? "false" : "true");
  }, [editor, grammar, check]);

  const changeCheck = (value: string) => {
    grammar.setCheck(value);
    setCheck(grammar.check);
    editor.commands.recheckBook();
    markDirty();
  };

  const ignoreMistake = async (open: OpenMistake) => {
    const checker = grammar.checker();
    if (!checker) return;
    grammar.setIgnored(await checker.ignore(open.text, open.mistake));
    editor.commands.recheckLines((text) => text === open.text);
    markDirty();
  };

  const addWord = (word: string) => {
    grammar.addWord(word);
    editor.commands.recheckLines((text) => text.includes(word));
    markDirty();
  };

  const dismissNotices = () => {
    noticesRef.current = [];
    setNotices([]);
    markDirty();
  };

  const leave = async (event: MouseEvent) => {
    event.preventDefault();
    await imagesAdded();
    // A full page load, so the warning about unsaved changes covers leaving this page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (await flush()) location.href = "/";
  };

  return (
    <div className="editor-page">
      <header className="topbar">
        {/* Its buttons act on the text, which a form is covering. */}
        <div className="toolbar-holder" inert={view !== "text"}>
        <Toolbar
          editor={editor}
          onImages={(files) => void insertFiles(files)}
          contentsOpen={contentsOpen}
          onToggleContents={() => setContentsOpen((open) => !open)}
        />
        </div>
        <div className="topbar-actions">
          <a className="action" href="/" onClick={leave}>
            All books
          </a>
          <button type="button" className="action" onClick={() => void saveNow()}>
            Save draft
          </button>
          <button
            type="button"
            className="action"
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            Preview
          </button>
          <TeamEpubCheck getDraft={getDraft} store={store} onNotice={setOutputNotice} />
          <SettingsMenu
            font={font}
            onFontChange={changeFont}
            divider={divider}
            onDividerChange={changeDivider}
            check={check}
            checkAvailable={grammar.english}
            onCheckChange={changeCheck}
          />
        </div>
      </header>

      <div className="editor-body">
        {contentsOpen && (
          <Contents
            editor={editor}
            view={view}
            onShowPage={showPage}
            onClose={closeContents}
          />
        )}
        <main className="sheet" data-divider={divider} style={{ "--book-font": font && fontStack(font) } as CSSProperties}>
          {font && <style>{editorFontCss(font)}</style>}
          {view === "title" && <TitlePageForm pages={pages} onChange={changePages} />}
          {view === "copyright" && <CopyrightForm pages={pages} onChange={changePages} />}
          <div hidden={view !== "text"}>
            {notices && notices.length > 0 && <NoticeList notices={notices} onDismiss={dismissNotices} />}
          <SuggestionReview editor={editor} />
            <div className="text-area">
              <EditorContent editor={editor} />
              <FootnoteEditor editor={editor} />
              <GrammarPopup editor={editor} onIgnore={(open) => void ignoreMistake(open)} onAddWord={addWord} />
            </div>
            <FootnoteList editor={editor} />
          </div>
        </main>
        {previewOpen && (
          <BookPreview
            getDraft={getDraft}
            savedAt={savedAt}
            store={store}
            place={previewPlace}
            jump={previewJump}
            onJumpDone={clearPreviewJump}
            onPlaceChange={setPreviewPlace}
            onSave={() => void saveNow()}
            onClose={closePreview}
          />
        )}
      </div>

      <StatusBar
        editor={editor}
        status={imageNotice ?? outputNotice ?? statusText(status, savedAt)}
        isError={status === "error"}
      >
        <WordDownload getDraft={getDraft} store={store} onNotice={setOutputNotice} />
      </StatusBar>
    </div>
  );
}
