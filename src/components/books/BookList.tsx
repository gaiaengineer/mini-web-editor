"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { listBooks, openWordFile, startBlankBook } from "@/lib/books";
import { localDraftStore } from "@/lib/drafts";
import "./books.css";

type Books = Awaited<ReturnType<typeof listBooks>>;

const bookPath = (id: string) => `/book/${id}`;

const OPEN_FAILED = {
  unreadable: "Couldn’t read this file. If it’s an older .doc file, save it as .docx in Word first",
  empty: "This file has no text or images",
};

// Links here load the whole page, so the editor's warning about unsaved changes
// also covers the browser's back button.
export default function BookList() {
  const [books, setBooks] = useState<Books | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The back button can restore this page as it was, without running effects.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setStarting(false);
      setAttempt((n) => n + 1);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listBooks(localDraftStore)
      .then((listed) => {
        if (!cancelled) setBooks(listed);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const startBook = async () => {
    setMessage(null);
    setStarting(true);
    try {
      location.href = bookPath(await startBlankBook(localDraftStore));
    } catch {
      setMessage("Couldn’t start a book. Try again");
      setStarting(false);
    }
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    setStarting(true);
    try {
      const book = await openWordFile(file, localDraftStore);
      if (book.ok) {
        location.href = bookPath(book.id);
        return;
      }
      setMessage(OPEN_FAILED[book.reason]);
    } catch {
      setMessage("Couldn’t save this book. Try again");
    }
    setStarting(false);
  };

  return (
    <main className="books">
      <header className="books-header">
        <h1>Books</h1>
        <div className="books-actions">
          <button type="button" className="action" onClick={() => void startBook()} disabled={starting}>
            New book
          </button>
          <button
            type="button"
            className="action action-primary"
            onClick={() => fileInput.current?.click()}
            disabled={starting}
          >
            {starting ? "Opening…" : "Open Word file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".docx"
            aria-label="Word file"
            hidden
            onChange={(event) => void openFile(event)}
          />
        </div>
      </header>
      {message && <p role="alert">{message}</p>}
      {failed && (
        <p role="alert">
          Couldn’t list your books.{" "}
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
      )}
      {books?.length === 0 && <p className="books-empty">No books yet.</p>}
      {books && books.length > 0 && (
        <ul className="books-list">
          {books.map((book) => (
            <li key={book.id}>
              <a href={bookPath(book.id)}>
                <span className="books-title">{book.title}</span>
                <time dateTime={book.updatedAt}>{new Date(book.updatedAt).toLocaleDateString()}</time>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
