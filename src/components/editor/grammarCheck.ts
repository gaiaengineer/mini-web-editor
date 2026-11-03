import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Checker, Mistake } from "@/lib/grammar/harper";

// Underlines spelling and grammar mistakes as the author writes. Each line is
// checked on its own, in the background, and remembered by its text, so after the
// first pass only lines that change are checked again. Nothing here is saved with
// the book.

export type OpenMistake = { from: number; to: number; mistake: Mistake; text: string };
type CheckState = { decorations: DecorationSet; open: OpenMistake | null };
type Meta = { refresh?: true; reset?: true; forget?: (text: string) => boolean; open?: OpenMistake | null };

export const grammarKey = new PluginKey<CheckState>("grammarCheck");

// How long typing has to pause before a line is checked again.
const CHECK_DELAY = 600;
// After this many lines, what's been found so far is shown, so a long book
// fills in gradually instead of all at the end.
const SHOW_EVERY = 40;
const MAX_REMEMBERED = 20000;

// A line's text, and for each character the position it has in the document. A
// footnote's marker isn't text, so it is skipped; a line break reads as one.
export function lineText(line: Node, start: number) {
  let text = "";
  const positions: number[] = [];
  line.forEach((child, offset) => {
    const at = start + 1 + offset;
    if (child.isText) {
      for (let i = 0; i < child.text!.length; i++) positions.push(at + i);
      text += child.text;
    } else if (child.type.name === "hardBreak") {
      positions.push(at);
      text += "\n";
    }
  });
  positions.push(start + 1 + line.content.size);
  return { text, positions };
}

function lines(doc: Node) {
  const found: { node: Node; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    found.push({ node, pos });
    return false;
  });
  return found;
}

function decorate(doc: Node, remembered: Map<string, Mistake[]>) {
  const decorations: Decoration[] = [];
  for (const { node, pos } of lines(doc)) {
    const { text, positions } = lineText(node, pos);
    for (const mistake of remembered.get(text) ?? []) {
      const from = positions[mistake.start];
      const to = positions[mistake.end - 1] + 1;
      if (from === undefined || !(to > from)) continue;
      const spelling = mistake.kind === "Spelling" || mistake.kind === "Typo";
      decorations.push(
        Decoration.inline(from, to, { class: spelling ? "spelling-mistake" : "grammar-mistake" }, { mistake, text }),
      );
    }
  }
  return DecorationSet.create(doc, decorations);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    grammarCheck: {
      // Checks the whole book again, after its settings changed.
      recheckBook: () => ReturnType;
      // Checks again only the lines that match, after a word was ignored or added
      // to the dictionary.
      recheckLines: (matches: (text: string) => boolean) => ReturnType;
      closeMistake: () => ReturnType;
    };
  }
}

type Options = { checker: () => Checker | null };

export const GrammarCheck = Extension.create<Options>({
  name: "grammarCheck",

  addOptions: () => ({ checker: () => null }),

  addCommands() {
    return {
      recheckBook:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(grammarKey, { reset: true } satisfies Meta));
          return true;
        },
      recheckLines:
        (matches) =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(grammarKey, { forget: matches } satisfies Meta));
          return true;
        },
      closeMistake:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(grammarKey, { open: null } satisfies Meta));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { checker } = this.options;
    const remembered = new Map<string, Mistake[]>();
    let needsCheck = true;
    // Raised whenever what's remembered is thrown away, so a check that started
    // before then, with the old settings, doesn't put its results back.
    let generation = 0;

    const apply = (tr: Transaction, value: CheckState, _old: EditorState, state: EditorState): CheckState => {
      const meta = tr.getMeta(grammarKey) as Meta | undefined;
      if (meta?.reset) {
        generation++;
        remembered.clear();
        needsCheck = true;
        return { decorations: DecorationSet.empty, open: null };
      }
      if (meta?.forget) {
        generation++;
        for (const text of remembered.keys()) if (meta.forget(text)) remembered.delete(text);
        needsCheck = true;
        const stale = value.decorations.find(undefined, undefined, (spec) => meta.forget!(spec.text));
        return { decorations: value.decorations.remove(stale), open: null };
      }
      if (meta?.refresh) return { decorations: checker() ? decorate(state.doc, remembered) : DecorationSet.empty, open: value.open };
      let { decorations, open } = value;
      if (meta && "open" in meta) open = meta.open ?? null;
      if (!tr.docChanged) return { decorations, open };

      needsCheck = true;
      decorations = decorations.map(tr.mapping, tr.doc);
      // A word being typed loses its underline until it's checked again.
      const changed: Decoration[] = [];
      tr.mapping.maps.forEach((map, index) => {
        map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
          const rest = tr.mapping.slice(index + 1);
          const from = rest.map(newStart, -1);
          const to = rest.map(newEnd, 1);
          changed.push(...decorations.find(Math.max(0, from - 1), to + 1));
        });
      });
      decorations = decorations.remove(changed);
      if (open) {
        const from = tr.mapping.mapResult(open.from, 1);
        const to = tr.mapping.mapResult(open.to, -1);
        const touched = changed.some((d) => d.spec.mistake === open!.mistake);
        open = from.deleted || to.deleted || touched ? null : { ...open, from: from.pos, to: to.pos };
      }
      return { decorations, open };
    };

    return [
      new Plugin<CheckState>({
        key: grammarKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, open: null }),
          apply,
        },
        props: {
          decorations: (state) => grammarKey.getState(state)?.decorations,
          handleClick: (view, pos) => {
            const { decorations, open } = grammarKey.getState(view.state)!;
            const [found] = decorations.find(pos, pos, (spec) => !!spec.mistake);
            if (found) {
              const next: OpenMistake = { from: found.from, to: found.to, mistake: found.spec.mistake, text: found.spec.text };
              view.dispatch(view.state.tr.setMeta(grammarKey, { open: next } satisfies Meta));
            } else if (open) {
              view.dispatch(view.state.tr.setMeta(grammarKey, { open: null } satisfies Meta));
            }
            return false;
          },
        },
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          let run = 0;
          let destroyed = false;
          const show = () => {
            if (!destroyed) view.dispatch(view.state.tr.setMeta(grammarKey, { refresh: true } satisfies Meta));
          };

          const check = async () => {
            const mine = ++run;
            const started = generation;
            const current = checker();
            if (!current) return show();
            if (remembered.size > MAX_REMEMBERED) remembered.clear();
            const todo = [...new Set(lines(view.state.doc).map(({ node, pos }) => lineText(node, pos).text))].filter(
              (text) => !remembered.has(text),
            );
            let done = 0;
            for (const text of todo) {
              if (mine !== run || destroyed || started !== generation) return;
              try {
                const found = text.trim() ? await current.check(text) : [];
                if (mine !== run || destroyed || started !== generation) return;
                remembered.set(text, found);
              } catch (error) {
                // The checker couldn't load or failed: the book is simply left unmarked.
                console.warn("Spelling and grammar check couldn't run", error);
                return;
              }
              if (++done % SHOW_EVERY === 0) show();
            }
            if (mine === run) show();
          };

          const schedule = (delay: number) => {
            clearTimeout(timer);
            timer = setTimeout(() => void check(), delay);
          };
          schedule(0);
          needsCheck = false;

          return {
            update: () => {
              if (!needsCheck) return;
              needsCheck = false;
              schedule(CHECK_DELAY);
            },
            destroy: () => {
              destroyed = true;
              clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
