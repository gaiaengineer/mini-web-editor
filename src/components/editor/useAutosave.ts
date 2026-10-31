import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft, DraftStore } from "@/lib/drafts";

const AUTOSAVE_MS = 2000;

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export function useAutosave(store: DraftStore, getDraft: () => Draft) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    await inFlight.current;
    if (!dirty.current) return;

    dirty.current = false;
    setStatus("saving");
    inFlight.current = store
      .save({ ...getDraft(), updatedAt: new Date().toISOString() })
      .then(() => {
        setStatus(dirty.current ? "dirty" : "saved");
        setSavedAt(new Date());
      })
      .catch(() => {
        dirty.current = true;
        setStatus("error");
      });
    await inFlight.current;
  }, [store, getDraft]);

  // The timer is not reset on each keystroke, so that an author who types
  // without pausing still gets saved every couple of seconds.
  const markDirty = useCallback(() => {
    dirty.current = true;
    setStatus("dirty");
    timer.current ??= setTimeout(flush, AUTOSAVE_MS);
  }, [flush]);

  const saveNow = useCallback(() => {
    dirty.current = true;
    return flush();
  }, [flush]);

  useEffect(() => {
    // Phones can kill a hidden tab without warning, so this is the last safe moment.
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  return { status, savedAt, markDirty, saveNow };
}
