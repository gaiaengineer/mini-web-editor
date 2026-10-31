import { useEffect, type RefObject } from "react";

// iOS draws the on-screen keyboard over the page instead of resizing it, so a
// bottom toolbar has to be lifted by hand to stay above the keyboard.
export function useKeyboardOffset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const offset = window.innerHeight - viewport.height - viewport.offsetTop;
      ref.current?.style.setProperty("--keyboard-offset", `${Math.max(0, offset)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [ref]);
}
