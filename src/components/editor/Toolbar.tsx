import { useEditorState, type Editor } from "@tiptap/react";
import { useRef, type ReactNode } from "react";
import { focusNextNote } from "./Footnotes";
import { useKeyboardOffset } from "./useKeyboardOffset";

type ChainFn = ReturnType<Editor["chain"]>;

type Action = {
  label: string;
  shortcut: string;
  icon: ReactNode;
  isActive: (editor: Editor) => boolean;
  run: (chain: ChainFn) => ChainFn;
};

const alignIcon = (lines: [number, number][]) => (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
    {lines.map(([x, width], i) => (
      <rect key={i} x={x} y={3 + i * 4} width={width} height="1.8" rx="0.9" fill="currentColor" />
    ))}
  </svg>
);

const heading = (level: 1 | 2 | 3): Action => ({
  label: `Heading ${level}`,
  shortcut: `Mod+Alt+${level}`,
  icon: `H${level}`,
  isActive: (editor) => editor.isActive("heading", { level }),
  run: (chain) => chain.toggleHeading({ level }),
});

const GROUPS: Action[][] = [
  [
    {
      label: "Bold",
      shortcut: "Mod+B",
      icon: <b>B</b>,
      isActive: (editor) => editor.isActive("bold"),
      run: (chain) => chain.toggleBold(),
    },
    {
      label: "Italic",
      shortcut: "Mod+I",
      icon: <i>I</i>,
      isActive: (editor) => editor.isActive("italic"),
      run: (chain) => chain.toggleItalic(),
    },
    {
      label: "Underline",
      shortcut: "Mod+U",
      icon: <u>U</u>,
      isActive: (editor) => editor.isActive("underline"),
      run: (chain) => chain.toggleUnderline(),
    },
  ],
  [
    {
      label: "Align left",
      shortcut: "Mod+Shift+L",
      icon: alignIcon([[2, 14], [2, 9], [2, 12]]),
      isActive: (editor) =>
        !editor.isActive({ textAlign: "center" }) && !editor.isActive({ textAlign: "right" }),
      run: (chain) => chain.unsetTextAlign(),
    },
    {
      label: "Align center",
      shortcut: "Mod+Shift+E",
      icon: alignIcon([[2, 14], [4.5, 9], [3, 12]]),
      isActive: (editor) => editor.isActive({ textAlign: "center" }),
      run: (chain) => chain.setTextAlign("center"),
    },
    {
      label: "Align right",
      shortcut: "Mod+Shift+R",
      icon: alignIcon([[2, 14], [7, 9], [4, 12]]),
      isActive: (editor) => editor.isActive({ textAlign: "right" }),
      run: (chain) => chain.setTextAlign("right"),
    },
  ],
  [
    heading(1),
    heading(2),
    heading(3),
    {
      label: "Chapter subtitle",
      shortcut: "Mod+Alt+4",
      icon: <span className="tool-text">Sub</span>,
      isActive: (editor) => editor.isActive("subtitle"),
      run: (chain) => chain.toggleNode("subtitle", "paragraph"),
    },
  ],
];

const ACTIONS = GROUPS.flat();

function readableShortcut(shortcut: string) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  return isMac
    ? shortcut.replace("Mod+", "⌘").replace("Alt+", "⌥").replace("Shift+", "⇧")
    : shortcut.replace("Mod", "Ctrl");
}

const imageIcon = (
  <svg viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true">
    <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="6.2" cy="7" r="1.3" fill="currentColor" />
    <path d="M3 13.5l4-3.5 2.5 2 3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const dividerIcon = (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
    <circle cx="4" cy="9" r="1.5" fill="currentColor" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <circle cx="14" cy="9" r="1.5" fill="currentColor" />
  </svg>
);

const footnoteIcon = (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
    <path d="M2.5 14.5 6 4.5l3.5 10M3.8 11h4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12.5 4.2 14.3 3v5.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const contentsIcon = (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
    <rect x="2" y="3.5" width="14" height="1.8" rx="0.9" fill="currentColor" />
    <rect x="5" y="8" width="11" height="1.8" rx="0.9" fill="currentColor" />
    <rect x="2" y="12.5" width="14" height="1.8" rx="0.9" fill="currentColor" />
  </svg>
);

type Props = {
  editor: Editor;
  onImages: (files: File[]) => void;
  contentsOpen: boolean;
  onToggleContents: () => void;
};

export function Toolbar({ editor, onImages, contentsOpen, onToggleContents }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useKeyboardOffset(ref);

  // A selector, so the buttons only re-render when an active state really changes.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ACTIONS.map((action) => action.isActive(editor)).join(),
  }).split(",");

  let index = 0;
  return (
    <div ref={ref} className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="toolbar-group toolbar-single">
        <button
          type="button"
          className="tool"
          aria-label="Contents"
          title="Contents"
          aria-pressed={contentsOpen}
          aria-controls="book-contents"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleContents}
        >
          {contentsIcon}
        </button>
      </div>
      {GROUPS.map((group, groupIndex) => (
        <div key={groupIndex} className="toolbar-group">
          {group.map((action) => {
            const pressed = active[index++] === "true";
            return (
              <button
                key={action.label}
                type="button"
                className="tool"
                aria-label={action.label}
                aria-pressed={pressed}
                aria-keyshortcuts={action.shortcut.replace("Mod", "Control")}
                title={`${action.label} (${readableShortcut(action.shortcut)})`}
                // Keeps the text selection when the button is pressed; on a
                // phone that is what makes select-then-tap work.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  action.run(editor.chain().focus(undefined, { scrollIntoView: false })).run();
                }}
              >
                {action.icon}
              </button>
            );
          })}
        </div>
      ))}
      <div className="toolbar-group">
        <button
          type="button"
          className="tool"
          aria-label="Add divider"
          title="Add divider (a scene break). Click a divider to select it, then Delete removes it."
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setHorizontalRule().run()}
        >
          {dividerIcon}
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Add footnote"
          title="Add footnote. Click a footnote's number to edit or delete it."
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            focusNextNote(editor);
            editor.chain().focus(undefined, { scrollIntoView: false }).addFootnote().run();
          }}
        >
          {footnoteIcon}
        </button>
        <button
          type="button"
          className="tool"
          aria-label="Add image"
          title="Add image"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => fileInput.current?.click()}
        >
          {imageIcon}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            onImages([...(event.target.files ?? [])]);
            // Otherwise picking the same file twice in a row does nothing.
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
