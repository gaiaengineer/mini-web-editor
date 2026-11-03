import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import type { DraftStore } from "@/lib/drafts";
import { imageUrl } from "./imageUrl";

function ImageView({ node, editor, extension, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const { assetId, pendingSrc, alt, width, height, textAlign } = node.attrs;
  const store: DraftStore = extension.options.store;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (assetId) {
      void imageUrl(store, assetId).then((value) => {
        if (!cancelled) setUrl(value);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [assetId, store]);

  const src = pendingSrc ?? url;
  return (
    <NodeViewWrapper className="book-image" style={{ textAlign: textAlign ?? undefined }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob, not a page asset
        <img src={src} alt={alt} width={width ?? undefined} height={height ?? undefined} data-drag-handle />
      ) : (
        <div className="book-image-empty" style={{ aspectRatio: width ? `${width} / ${height}` : undefined }}>
          Image unavailable
        </div>
      )}
      {selected && (
        <div className="book-image-controls">
          <input
            aria-label="Image description"
            placeholder="Describe this image for people who can’t see it"
            defaultValue={alt}
            onChange={(event) => updateAttributes({ alt: event.target.value })}
          />
          <button
            type="button"
            className="action"
            onClick={() => {
              deleteNode();
              editor.commands.focus();
            }}
          >
            Remove
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const BookImage = Node.create<{ store: DraftStore | null }>({
  name: "bookImage",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return { store: null };
  },

  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-asset-id"),
        renderHTML: (attrs) => ({ "data-asset-id": attrs.assetId }),
      },
      // Where a pasted image came from, until useImages has copied it into the store.
      pendingSrc: {
        default: null,
        parseHTML: (el) => (el.hasAttribute("data-asset-id") ? null : el.getAttribute("src")),
        renderHTML: (attrs) => (attrs.pendingSrc ? { src: attrs.pendingSrc } : {}),
      },
      mimeType: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mime-type"),
        renderHTML: (attrs) => ({ "data-mime-type": attrs.mimeType }),
      },
      alt: { default: "" },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-asset-id]" }, { tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
