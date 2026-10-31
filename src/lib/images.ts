import { randomId, type DraftStore } from "./drafts";

// Enough for a full-screen page on any e-reader, and keeps books downloadable.
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.88;

const PHOTO_TYPES = ["image/jpeg", "image/heic", "image/heif"];

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), type, JPEG_QUALITY);
  });
}

// Everything is re-encoded, even images that are small enough. It leaves only
// formats every reader supports, and it strips EXIF data: a phone photo's GPS
// location must not end up inside a published book.
async function prepareImage(source: Blob) {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // Re-encoding would flatten an animated GIF, which has no location data anyway.
  if (source.type === "image/gif" && scale === 1) {
    bitmap.close();
    return { blob: source, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const type = PHOTO_TYPES.includes(source.type) ? "image/jpeg" : "image/png";
  return { blob: await encode(canvas, type), width, height };
}

export async function storeImage(store: DraftStore, source: Blob) {
  const { blob, width, height } = await prepareImage(source);
  const assetId = randomId();
  await store.saveImage(assetId, blob);
  return { assetId, width, height, mimeType: blob.type };
}
