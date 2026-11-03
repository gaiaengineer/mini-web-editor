import { Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useRef } from "react";
import { cleanNote, noteText, type NoteContent } from "@/lib/footnote";

// The box for a note holds one paragraph: words, emphasis and line breaks.
const NoteDocument = Node.create({ name: "doc", topNode: true, content: "paragraph" });

const noteExtensions = [
  NoteDocument,
  StarterKit.configure({
    document: false,
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    link: false,
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
  }),
  Placeholder.configure({ placeholder: "Footnote text" }),
];

// Set just before a footnote is selected on purpose, by a click or the toolbar, so
// that its box takes the typing. Moving the cursor over a footnote only shows it.
const focusRequest = new WeakMap<Editor, boolean>();
export const focusNextNote = (editor: Editor) => focusRequest.set(editor, true);

function selectedFootnote(editor: Editor) {
  const { selection, doc } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "footnote") return null;
  let number = 1;
  doc.nodesBetween(0, selection.from, (node, pos) => {
    if (node.type.name === "footnote" && pos < selection.from) number++;
  });
  return { pos: selection.from, number };
}

// The note of the footnote selected in the text, in a box under its marker.
export function FootnoteEditor({ editor }: { editor: Editor }) {
  const selected = useEditorState({ editor, selector: ({ editor }) => selectedFootnote(editor) });

  // Clicking a marker is a request to edit it.
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if ((event.target as Element).closest?.("sup.footnote-ref")) focusNextNote(editor);
    };
    const dom = editor.view.dom;
    dom.addEventListener("mousedown", onMouseDown);
    return () => dom.removeEventListener("mousedown", onMouseDown);
  }, [editor]);

  if (!selected) return null;
  return <NoteBox key={selected.pos} editor={editor} pos={selected.pos} number={selected.number} />;
}

function NoteBox({ editor, pos, number }: { editor: Editor; pos: number; number: number }) {
  const box = useRef<HTMLDivElement>(null);

  const close = () => {
    const note: NoteContent = editor.state.doc.nodeAt(pos)?.attrs.note ?? [];
    // A footnote with nothing in it would show a number with no note.
    if (!noteText(note).trim()) {
      editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run();
    } else {
      editor.chain().focus().setTextSelection(pos + 1).run();
    }
  };
  const note = useEditor({
    immediatelyRender: true,
    extensions: noteExtensions,
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: editor.state.doc.nodeAt(pos)?.attrs.note?.length ? editor.state.doc.nodeAt(pos)?.attrs.note : undefined }],
    },
    editorProps: { attributes: { "aria-label": `Footnote ${number}` } },
    onUpdate: ({ editor: box }) => {
      const text = cleanNote(box.getJSON().content?.[0]?.content ?? []);
      editor.commands.command(({ tr }) => {
        tr.setNodeAttribute(pos, "note", text);
        return true;
      });
    },
  });

  // Takes the typing if the footnote was clicked or just added, or is clicked again.
  useEffect(() => {
    if (focusRequest.get(editor)) {
      focusRequest.delete(editor);
      note.commands.focus("end");
    }
    const marker = editor.view.nodeDOM(pos);
    const onMouseDown = () => setTimeout(() => note.commands.focus("end"));
    marker?.addEventListener("mousedown", onMouseDown);
    return () => marker?.removeEventListener("mousedown", onMouseDown);
  }, [editor, note, pos]);

  // Sits under the marker, kept inside the text's width.
  useLayoutEffect(() => {
    const place = () => {
      // After an edit the footnote may be gone, before this box is.
      const marker = editor.view.nodeDOM(pos);
      const el = box.current;
      const area = el?.offsetParent;
      if (!(marker instanceof Element) || !el || !area) return;
      const m = marker.getBoundingClientRect();
      const a = area.getBoundingClientRect();
      const left = Math.min(Math.max(0, m.left - a.left - 16), Math.max(0, a.width - el.offsetWidth));
      el.style.top = `${m.bottom - a.top + 6}px`;
      el.style.left = `${left}px`;
    };
    place();
    window.addEventListener("resize", place);
    editor.on("update", place);
    return () => {
      window.removeEventListener("resize", place);
      editor.off("update", place);
    };
  }, [editor, pos]);

  return (
    <div
      ref={box}
      className="note-box"
      role="group"
      aria-label={`Footnote ${number}`}
      // Enter or Escape finishes the note; Shift+Enter starts a new line in it.
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="note-box-head">
        <span>Footnote {number}</span>
        <span className="note-box-actions">
          <button type="button" className="note-action" onClick={() => editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run()}>
            Delete
          </button>
          <button type="button" className="note-action note-done" onClick={close}>
            Done
          </button>
        </span>
      </div>
      <EditorContent editor={note} className="note-text" />
    </div>
  );
}

// Every note, in order, after the text, as the book will have them. Each number
// leads back to its place in the text.
export function FootnoteList({ editor }: { editor: Editor }) {
  const notes = useEditorState({
    editor,
    selector: ({ editor }) => {
      const found: { pos: number; text: string }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnote") found.push({ pos, text: noteText(node.attrs.note ?? []) });
      });
      return found;
    },
  });
  if (!notes.length) return null;
  return (
    <section className="note-list" aria-label="Notes">
      <h2>Notes</h2>
      <ol>
        {notes.map((note, index) => (
          <li key={note.pos}>
            <button
              type="button"
              className="note-number"
              aria-label={`Go to footnote ${index + 1} in the text`}
              onClick={() => {
                focusNextNote(editor);
                editor.chain().focus().setNodeSelection(note.pos).scrollIntoView().run();
              }}
            >
              {index + 1}.
            </button>{" "}
            {note.text || <span className="note-empty">Empty note</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
