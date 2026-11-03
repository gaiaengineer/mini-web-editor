import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftStore } from "@/lib/drafts";
import { imageUrl } from "./imageUrl";

const storeLoading = (loadImage: DraftStore["loadImage"]) => ({ loadImage }) as DraftStore;

let nextId = 0;
const id = () => `image-${nextId++}`;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:image");
});

describe("imageUrl", () => {
  it("loads each image once", async () => {
    const loadImage = vi.fn(async () => new Blob(["x"]));
    const image = id();
    await imageUrl(storeLoading(loadImage), image);
    expect(await imageUrl(storeLoading(loadImage), image)).toBe("blob:image");
    expect(loadImage).toHaveBeenCalledTimes(1);
  });

  it("gives no address for an image that fails to load", async () => {
    const failing = storeLoading(async () => {
      throw new Error("storage failed");
    });
    await expect(imageUrl(failing, id())).resolves.toBeNull();
  });

  it("tries again after a failed load", async () => {
    const image = id();
    await imageUrl(
      storeLoading(async () => {
        throw new Error("storage failed");
      }),
      image,
    ).catch(() => {});
    expect(await imageUrl(storeLoading(async () => new Blob(["x"])), image)).toBe("blob:image");
  });

  it("tries again after an image wasn't found", async () => {
    const image = id();
    await imageUrl(storeLoading(async () => null), image);
    expect(await imageUrl(storeLoading(async () => new Blob(["x"])), image)).toBe("blob:image");
  });
});
