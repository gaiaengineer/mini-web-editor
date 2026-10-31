import { useCallback, useRef, useState } from "react";

const NOTICE_MS = 6000;

// Notices share a spot with the save status, so they must not stay there for good.
export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string | null, { persist = false } = {}) => {
    clearTimeout(timer.current);
    setNotice(text);
    if (text && !persist) timer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  return [notice, show] as const;
}
