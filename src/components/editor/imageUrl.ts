import type { DraftStore } from "@/lib/drafts";

// Kept for the whole session: undo and drag recreate the view of the same image.
// Only images that loaded stay here, so a failed load can be tried again.
const urls = new Map<string, Promise<string | null>>();

async function load(store: DraftStore, id: string) {
  try {
    const blob = await store.loadImage(id);
    if (blob) return URL.createObjectURL(blob);
  } catch {
    // The view shows an image as unavailable when it has no address.
  }
  urls.delete(id);
  return null;
}

export function imageUrl(store: DraftStore, id: string) {
  let url = urls.get(id);
  if (!url) {
    url = load(store, id);
    urls.set(id, url);
  }
  return url;
}
