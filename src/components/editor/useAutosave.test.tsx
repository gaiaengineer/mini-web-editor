import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { newDraft, type DraftStore } from "@/lib/drafts";
import { useAutosave } from "./useAutosave";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Saving = ReturnType<typeof useAutosave>;

function mount(save: DraftStore["save"]) {
  const store = { save } as DraftStore;
  const draft = newDraft("a");
  let current: Saving;
  function Probe() {
    current = useAutosave(store, () => draft);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  mounted = root;
  return () => current;
}

let mounted: ReturnType<typeof createRoot> | undefined;
afterEach(() => act(() => mounted?.unmount()));

it("writes nothing when leaving a book that hasn't changed", async () => {
  const save = vi.fn(async () => {});
  const saving = mount(save);
  await act(async () => {
    expect(await saving().flush()).toBe(true);
  });
  expect(save).not.toHaveBeenCalled();
});

it("saves unsaved changes before saying it's safe to leave", async () => {
  const save = vi.fn(async () => {});
  const saving = mount(save);
  await act(async () => {
    saving().markDirty();
    expect(await saving().flush()).toBe(true);
  });
  expect(save).toHaveBeenCalledTimes(1);
});

it("reports a failed save so the book isn't left", async () => {
  const saving = mount(async () => {
    throw new Error("storage failed");
  });
  await act(async () => {
    saving().markDirty();
    expect(await saving().flush()).toBe(false);
  });
});

it("waits for every save in progress before saying it's safe to leave", async () => {
  const finish: (() => void)[] = [];
  const running = () => finish.length;
  const save = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
  const saving = mount(save);
  let left = false;

  await act(async () => {
    saving().markDirty();
    void saving().flush();
    await vi.waitFor(() => expect(running()).toBe(1));

    saving().markDirty();
    void saving().flush();
    void saving().flush().then(() => (left = true));
    finish[0]();
    await vi.waitFor(() => expect(running()).toBe(2));
    await Promise.resolve();
    expect(left).toBe(false);
    finish[1]();
    await vi.waitFor(() => expect(left).toBe(true));
  });
});
