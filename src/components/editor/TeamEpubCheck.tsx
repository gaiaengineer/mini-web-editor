import { useState } from "react";
import { saveFile } from "@/lib/download";
import { type Draft, type DraftStore } from "@/lib/drafts";
import { buildEpub, epubFileName, imageIds, type EpubImages } from "@/lib/epub";
import { plainText } from "@/lib/epub/serialize";
import { fontById, loadEpubFont } from "@/lib/fonts";

type Props = {
  getDraft: () => Draft;
  store: DraftStore;
  onNotice: (notice: string | null) => void;
};

// For checking quality in a real reading app. Authors never get an EPUB export.
export default function TeamEpubCheck({ getDraft, store, onNotice }: Props) {
  const [building, setBuilding] = useState(false);

  const check = async () => {
    setBuilding(true);
    onNotice(null);
    try {
      const draft = getDraft();
      const ids = imageIds(draft.content);
      const images: EpubImages = new Map();
      for (const id of ids) {
        const blob = await store.loadImage(id);
        if (blob) images.set(id, { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type });
      }

      const font = fontById(draft.font);
      const epubFont =
        font && (await loadEpubFont(font, `${draft.title} ${draft.author} ${plainText(draft.content)}`));

      saveFile(
        buildEpub(draft.content, draft, { images, font: epubFont }) as Uint8Array<ArrayBuffer>,
        epubFileName(draft.title),
        "application/epub+zip",
      );
      const missing = ids.length - images.size;
      const absent = [!draft.title.trim() && "a title", !draft.author.trim() && "an author"];
      if (missing) {
        onNotice(`Built without ${missing} missing image${missing > 1 ? "s" : ""}`);
      } else if (absent.some(Boolean)) {
        onNotice(`Built without ${absent.filter(Boolean).join(" or ")}`);
      }
    } catch (error) {
      console.error(error);
      onNotice("EPUB check failed. Try again");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <button type="button" className="action action-primary" onClick={() => void check()} disabled={building}>
      Check EPUB
    </button>
  );
}
