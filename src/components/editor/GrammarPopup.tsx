import { useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Fix } from "@/lib/grammar/harper";
import { grammarKey, type OpenMistake } from "./grammarCheck";

type Props = {
  editor: Editor;
  onIgnore: (open: OpenMistake) => void;
  onAddWord: (word: string) => void;
};

const fixLabel = (fix: Fix) => (fix.kind === "remove" ? "Remove it" : fix.kind === "insertAfter" ? `Add “${fix.text}”` : fix.text);

// What's wrong with an underlined word, and how to fix it, under the word.
export function GrammarPopup({ editor, onIgnore, onAddWord }: Props) {
  const open = useEditorState({ editor, selector: ({ editor }) => grammarKey.getState(editor.state)?.open ?? null });
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const area = el?.offsetParent;
    if (!open || !el || !area) return;
    const word = editor.view.coordsAtPos(open.from);
    const a = area.getBoundingClientRect();
    const left = Math.min(Math.max(0, word.left - a.left - 12), Math.max(0, a.width - el.offsetWidth));
    el.style.top = `${word.bottom - a.top + 6}px`;
    el.style.left = `${left}px`;
  }, [editor, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") editor.commands.closeMistake();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, open]);

  if (!open) return null;
  const { mistake, from, to } = open;
  const spelling = mistake.kind === "Spelling" || mistake.kind === "Typo";

  const apply = (fix: Fix) => {
    const chain = editor.chain().focus().closeMistake();
    if (fix.kind === "remove") chain.deleteRange({ from, to });
    else if (fix.kind === "insertAfter") chain.insertContentAt(to, fix.text);
    else chain.insertContentAt({ from, to }, fix.text);
    chain.run();
  };

  return (
    <div ref={box} className="mistake-box" role="dialog" aria-label="Spelling and grammar">
      <p className="mistake-message">{mistake.message}</p>
      {mistake.fixes.length > 0 && (
        <div className="mistake-fixes">
          {mistake.fixes.map((fix, index) => (
            <button key={index} type="button" className="mistake-fix" onMouseDown={(event) => event.preventDefault()} onClick={() => apply(fix)}>
              {fixLabel(fix)}
            </button>
          ))}
        </div>
      )}
      <div className="mistake-actions">
        <button
          type="button"
          className="mistake-action"
          onClick={() => {
            editor.commands.closeMistake();
            onIgnore(open);
          }}
        >
          Ignore
        </button>
        {spelling && (
          <button
            type="button"
            className="mistake-action"
            onClick={() => {
              editor.commands.closeMistake();
              onAddWord(mistake.problem);
            }}
          >
            Add to dictionary
          </button>
        )}
      </div>
    </div>
  );
}
