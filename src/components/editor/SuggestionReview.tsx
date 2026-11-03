import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { listSuggestions, resolveAll, type SuggestionKind } from "./suggestions";

const TITLES: Record<SuggestionKind, (count: number) => string> = {
  chapter: (count) => `${count} possible chapter ${count === 1 ? "heading" : "headings"}`,
  align: (count) => `${count} alignment ${count === 1 ? "correction" : "corrections"}`,
  subtitle: (count) => `${count} possible chapter ${count === 1 ? "subtitle" : "subtitles"}`,
};

export function SuggestionReview({ editor }: { editor: Editor }) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const found = listSuggestions(current.state.doc);
      return {
        chapter: found.filter(({ kind }) => kind === "chapter").length,
        align: found.filter(({ kind }) => kind === "align").length,
        subtitle: found.filter(({ kind }) => kind === "subtitle").length,
      };
    },
  });

  if (!counts.chapter && !counts.align && !counts.subtitle) return null;
  return (
    <section className="suggestion-review" aria-label="Suggestions">
      {(["chapter", "subtitle", "align"] as const).map(
        (kind) =>
          counts[kind] > 0 && (
            <div key={kind} className="suggestion-group">
              <span>{TITLES[kind](counts[kind])}</span>
              <button type="button" className="action" onClick={() => resolveAll(editor, kind, true)}>
                Accept all
              </button>
              <button type="button" className="action" onClick={() => resolveAll(editor, kind, false)}>
                Reject all
              </button>
            </div>
          ),
      )}
    </section>
  );
}
