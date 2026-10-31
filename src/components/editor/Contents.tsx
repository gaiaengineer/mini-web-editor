import { useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { listHeadings, type Heading } from "@/lib/headings";

const REFRESH_MS = 250;
const OVERLAY = "(max-width: 1099px)";

const sameHeadings = (a: Heading[], b: Heading[]) => JSON.stringify(a) === JSON.stringify(b);

type Props = {
  editor: Editor;
  onClose: () => void;
};

export function Contents({ editor, onClose }: Props) {
  const [headings, setHeadings] = useState(() => listHeadings(editor.state.doc));

  // Not on every keystroke: in a long book that means re-walking the document.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      timer = undefined;
      const next = listHeadings(editor.state.doc);
      setHeadings((current) => (sameHeadings(current, next) ? current : next));
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && matchMedia(OVERLAY).matches) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const current = useEditorState({
    editor,
    selector: ({ editor }) => {
      const { from } = editor.state.selection;
      return headings.findLastIndex((heading) => heading.pos < from);
    },
  });

  useEffect(() => {
    document.querySelector(".contents [aria-current]")?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const goTo = (index: number) => {
    // Positions in the list can be a moment old, so look them up again.
    const heading = listHeadings(editor.state.doc)[index];
    if (!heading) return;
    editor.commands.setTextSelection(heading.pos + 1);
    (editor.view.nodeDOM(heading.pos) as HTMLElement | null)?.scrollIntoView({ block: "start" });
    // On a phone, focusing would open the keyboard over the chapter just opened.
    if (!matchMedia("(pointer: coarse)").matches) editor.view.focus();
    if (matchMedia(OVERLAY).matches) onClose();
  };

  const topLevel = Math.min(...headings.map((heading) => heading.level));

  return (
    <>
      <div className="contents-scrim" onClick={onClose} />
      <aside id="book-contents" className="contents" aria-label="Contents">
        <div className="contents-header">
          <h2>Contents</h2>
          <button type="button" className="tool" aria-label="Close contents" onClick={onClose}>
            ×
          </button>
        </div>
        {headings.length === 0 ? (
          <p className="contents-empty">
            Mark a line as H1, H2 or H3 and it will appear here. Each top-level heading starts a
            chapter.
          </p>
        ) : (
          <ol>
            {headings.map((heading, index) => (
              <li key={`${index}-${heading.title}`}>
                <button
                  type="button"
                  data-depth={heading.level - topLevel}
                  aria-current={index === current ? "location" : undefined}
                  onClick={() => goTo(index)}
                >
                  {heading.title}
                </button>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </>
  );
}
