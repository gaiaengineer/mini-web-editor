import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";
import type { DraftStore } from "@/lib/drafts";
import { storeImage } from "@/lib/images";
import { useNotice } from "./useNotice";

const pluginKey = new PluginKey("bookImages");

const imageFiles = (files?: FileList | null) =>
  [...(files ?? [])].filter((file) => file.type.startsWith("image/"));

const count = (n: number) => (n === 1 ? "1 image" : `${n} images`);

export function useImages(editor: Editor, store: DraftStore) {
  const [notice, setNotice] = useNotice();
  const importing = useRef(new Set<string>());
  const adding = useRef(Promise.resolve());

  const addFiles = useCallback(
    async (files: File[], at?: number) => {
      setNotice(`Adding ${count(files.length)}…`, { persist: true });
      let failed = 0;
      let position = at;
      for (const file of files) {
        try {
          const attrs = await storeImage(store, file);
          const content = { type: "bookImage", attrs: { ...attrs, textAlign: "center" } };
          const chain = editor.chain().focus();
          if (position === undefined) chain.insertContent(content).run();
          else chain.insertContentAt(position, content).run();
          position = editor.state.selection.to;
        } catch (error) {
          console.error(error);
          failed += 1;
        }
      }
      // Leaving the image selected would let the next keystroke replace it.
      if (position !== undefined) {
        const after = position;
        editor.commands.command(({ tr }) => {
          tr.setSelection(Selection.near(tr.doc.resolve(after)));
          return true;
        });
      }
      setNotice(failed ? `Couldn’t add ${count(failed)}. Try a JPEG or PNG` : null);
    },
    [editor, store, setNotice],
  );

  const insertFiles = useCallback(
    (files: File[], at?: number) => {
      const done = addFiles(files, at);
      adding.current = Promise.all([adding.current, done]).then(() => {});
      return done;
    },
    [addFiles],
  );

  // An image joins the book only after it's stored, so until then it's not unsaved work.
  const imagesAdded = useCallback(() => adding.current, []);

  // Pasted HTML only carries an image's address. Copy each image in, so the book
  // doesn't depend on someone else's server. Sites that refuse the request can't
  // be read at all, so those images are removed and the author is told.
  const importPending = useCallback(async () => {
    const sources = new Set<string>();
    editor.state.doc.descendants((node) => {
      const src = node.attrs.pendingSrc;
      if (src && !importing.current.has(src)) sources.add(src);
    });

    let failed = 0;
    for (const src of sources) {
      importing.current.add(src);
      const attrs = await fetch(src)
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(src))))
        .then((blob) => storeImage(store, blob))
        .catch(() => null);
      importing.current.delete(src);

      const { tr, doc } = editor.state;
      const matches: { pos: number; size: number; attrs: Record<string, unknown> }[] = [];
      doc.descendants((node, pos) => {
        if (node.attrs.pendingSrc === src) {
          matches.push({ pos, size: node.nodeSize, attrs: node.attrs });
        }
      });
      if (!attrs) failed += matches.length;
      for (const match of matches.reverse()) {
        if (attrs) {
          tr.setNodeMarkup(match.pos, undefined, {
            ...match.attrs,
            ...attrs,
            pendingSrc: null,
            textAlign: match.attrs.textAlign ?? "center",
          });
        } else {
          tr.delete(match.pos, match.pos + match.size);
        }
      }
      if (matches.length) editor.view.dispatch(tr.setMeta("addToHistory", false));
    }
    if (failed) setNotice(`Couldn’t copy ${count(failed)}. Add them with the image button`);
  }, [editor, store, setNotice]);

  useEffect(() => {
    const plugin = new Plugin({
      key: pluginKey,
      props: {
        // A copied chart or a Word selection also offers an image of itself
        // alongside its text, so files only win when there is no text.
        handlePaste: (_view, event) => {
          const files = imageFiles(event.clipboardData?.files);
          if (!files.length || event.clipboardData?.getData("text/plain").trim()) return false;
          void insertFiles(files);
          return true;
        },
        handleDrop: (view, event) => {
          const files = imageFiles(event.dataTransfer?.files);
          if (!files.length) return false;
          const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
          void insertFiles(files, target?.pos);
          return true;
        },
      },
    });
    editor.registerPlugin(plugin, (imagePlugin, plugins) => [imagePlugin, ...plugins]);

    const onTransaction = ({ transaction }: { transaction: { getMeta(key: string): unknown } }) => {
      const source = transaction.getMeta("uiEvent");
      if (source === "paste" || source === "drop") void importPending();
    };
    editor.on("transaction", onTransaction);
    // Picks up anything left over if the tab closed in the middle of a paste.
    const leftovers = setTimeout(importPending);

    return () => {
      clearTimeout(leftovers);
      editor.off("transaction", onTransaction);
      editor.unregisterPlugin(pluginKey);
    };
  }, [editor, insertFiles, importPending]);

  return { insertFiles, imagesAdded, imageNotice: notice };
}
