import type { Editor } from "@tiptap/core";
import { useEffect, useState, type ReactNode } from "react";
import { countBook } from "./bookCounts";

const REFRESH_MS = 250;

type Props = {
  editor: Editor;
  status: string;
  isError: boolean;
  children: ReactNode;
};

export function StatusBar({ editor, status, isError, children }: Props) {
  const [{ words, characters }, setCounts] = useState(() => countBook(editor.state.doc));

  // Not on every keystroke: in a long book that means reading the whole text.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      timer = undefined;
      setCounts(countBook(editor.state.doc));
    };
    const onUpdate = () => {
      timer ??= setTimeout(refresh, REFRESH_MS);
    };
    editor.on("update", onUpdate);
    return () => {
      clearTimeout(timer);
      editor.off("update", onUpdate);
    };
  }, [editor]);

  return (
    <footer className="status-bar">
      <span className={`save-status ${isError ? "is-error" : ""}`} role="status">
        {status}
      </span>
      <span className="book-counts">
        {words.toLocaleString()} {words === 1 ? "word" : "words"} · {characters.toLocaleString()}{" "}
        {characters === 1 ? "character" : "characters"}
      </span>
      {children}
    </footer>
  );
}
