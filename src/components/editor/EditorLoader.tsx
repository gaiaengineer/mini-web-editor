"use client";

import dynamic from "next/dynamic";

// The editor depends on the DOM and IndexedDB, so it only ever runs in the browser.
const BookEditor = dynamic(() => import("./BookEditor"), { ssr: false });

export default function EditorLoader() {
  return <BookEditor />;
}
