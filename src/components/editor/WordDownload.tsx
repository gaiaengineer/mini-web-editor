import { useState } from "react";
import type { WordImages } from "@/lib/docx";
import type { Draft, DraftStore } from "@/lib/drafts";
import { saveFile } from "@/lib/download";
import { imageIds } from "@/lib/epub/chapters";
import { bookFileName } from "@/lib/epub/serialize";

const WORD_FILE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"];

// Imported images have no stored size, Word can't show WebP, and a phone photo's
// rotation lives in its metadata, so each one is read here and redrawn if needed.
// An image that can't be read is left out and counted.
async function wordImage(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const stored = await createImageBitmap(blob, { imageOrientation: "none" });
  const { width, height } = bitmap;
  const rotated = stored.width !== width;
  stored.close();
  let usable = blob;
  if (rotated || !WORD_IMAGE_TYPES.includes(blob.type)) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    usable = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("encode failed"))), "image/png");
    });
  }
  bitmap.close();
  return { bytes: new Uint8Array(await usable.arrayBuffer()), type: usable.type, width, height };
}

async function loadImages(draft: Draft, store: DraftStore) {
  const images: WordImages = new Map();
  for (const id of imageIds(draft.content)) {
    const blob = await store.loadImage(id);
    if (!blob) continue;
    const image = await wordImage(blob).catch(() => null);
    if (image) images.set(id, image);
  }
  return images;
}

type Props = {
  getDraft: () => Draft;
  store: DraftStore;
  onNotice: (notice: string | null) => void;
};

export function WordDownload({ getDraft, store, onNotice }: Props) {
  const [building, setBuilding] = useState(false);

  const download = async () => {
    setBuilding(true);
    onNotice(null);
    try {
      const draft = getDraft();
      // Loaded on demand, so opening a book doesn't carry the Word writer.
      const { buildDocx } = await import("@/lib/docx");
      const { bytes, missingImages } = await buildDocx(draft.content, draft, await loadImages(draft, store));
      saveFile(bytes as Uint8Array<ArrayBuffer>, bookFileName(draft.title, "docx"), WORD_FILE);
      if (missingImages) onNotice(`Downloaded without ${missingImages} image${missingImages > 1 ? "s" : ""}`);
    } catch (error) {
      console.error(error);
      onNotice("Word download failed. Try again");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <button type="button" className="action" onClick={() => void download()} disabled={building}>
      Export .docx
    </button>
  );
}
