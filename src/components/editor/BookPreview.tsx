import { useCallback, useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import type { Draft, DraftStore } from "@/lib/drafts";
import { imageIds } from "@/lib/epub/chapters";
import { buildPreview, fillPageEnds } from "@/lib/epub/preview";
import { editorFontCss, fontById, fontStack } from "@/lib/fonts";
import { PREVIEW_DEVICES } from "./previewDevices";

function chosenFontCss(draft: Draft) {
  const font = fontById(draft.font);
  return font ? `${editorFontCss(font)}\nbody { font-family: ${fontStack(font)}; }\n` : "";
}

// The panel covers the page in a narrow window, where it behaves like a dialog.
const coversPage = () => matchMedia("(max-width: 1099px)").matches;

export type PreviewPlace = { deviceId: string; position: number };
export type PreviewJump = { page: string; count: number };

type Props = {
  getDraft: () => Draft;
  // Changes after every save, which is when the preview catches up with the book.
  savedAt: Date | null;
  store: DraftStore;
  // Kept by the editor, so closing the preview doesn't lose the reader's place.
  place: PreviewPlace;
  // A generated page to turn to. The count tells two requests for one page apart.
  jump: PreviewJump | null;
  onJumpDone: () => void;
  onPlaceChange: (place: PreviewPlace) => void;
  onSave: () => void;
  onClose: () => void;
};

export function BookPreview({ getDraft, savedAt, store, place, jump, onJumpDone, onPlaceChange, onSave, onClose }: Props) {
  const [deviceId, setDeviceId] = useState(place.deviceId);
  const device = PREVIEW_DEVICES.find(({ id }) => id === deviceId) ?? PREVIEW_DEVICES[0];
  const { margin } = device.screen;
  const [page, setPage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(0);

  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const imageUrls = useRef(new Map<string, string>());
  const loadedDevice = useRef<string | null>(null);
  const pendingPage = useRef<string | null>(null);
  // How far through the book, so a new device or an edit keeps the reader's place.
  const position = useRef(place.position);

  useEffect(() => {
    const urls = imageUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (coversPage()) closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && coversPage()) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const measure = useCallback(() => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    fillPageEnds(view, margin);
    const total = Math.max(1, Math.round(view.document.documentElement.scrollWidth / view.innerWidth));
    const index = Math.round(position.current * (total - 1));
    setPageCount(total);
    setPageIndex(index);
    view.scrollTo(index * view.innerWidth, 0);
  }, [margin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = getDraft();
      for (const id of imageIds(draft.content)) {
        if (imageUrls.current.has(id)) continue;
        const blob = await store.loadImage(id);
        if (cancelled) return;
        if (blob) imageUrls.current.set(id, URL.createObjectURL(blob));
      }
      if (cancelled) return;
      const options = { imageUrls: imageUrls.current, fontCss: chosenFontCss(draft), screen: device.screen };
      const html = buildPreview(draft.content, draft, options);
      setFailed(false);

      // Reloading the frame would flash the page, so an edit swaps its content.
      const shown = frame.current?.contentDocument;
      if (shown?.body && loadedDevice.current === device.id) {
        const next = new DOMParser().parseFromString(html, "text/html");
        shown.head.innerHTML = next.head.innerHTML;
        shown.body.innerHTML = next.body.innerHTML;
        measure();
        // Images and a newly chosen font arrive after the swap and change where
        // pages break, so the pages are measured again once they have.
        const settled = [...shown.images].map((image) => image.decode().catch(() => {}));
        void Promise.all([shown.fonts.ready, ...settled]).then(() => {
          if (!cancelled) measure();
        });
      } else {
        setPage(html);
      }
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [getDraft, savedAt, store, device, measure]);

  const outerWidth = device.width + device.bezel * 2;
  const outerHeight = device.height + device.bezel * 2;

  useEffect(() => {
    const area = stage.current;
    if (!area) return;
    const fit = () => setScale(Math.min(1, area.clientWidth / outerWidth, area.clientHeight / outerHeight));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [outerWidth, outerHeight]);

  const showPage = (index: number) => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    const total = Math.max(1, Math.round(view.document.documentElement.scrollWidth / view.innerWidth));
    view.scrollTo(index * view.innerWidth, 0);
    setPageIndex(index);
    position.current = total > 1 ? index / (total - 1) : 0;
    onPlaceChange({ deviceId, position: position.current });
  };

  const turnToPlace = (id: string) => {
    const view = frame.current?.contentWindow;
    const place = view?.document.getElementById(id);
    if (!view || !place) return false;
    showPage(Math.floor((place.getBoundingClientRect().left + view.scrollX) / view.innerWidth));
    return true;
  };

  const followJump = useEffectEvent(() => {
    if (!jump) return;
    // A frame that's still loading turns to the page once it's ready. A page the book
    // doesn't have, such as contents with one chapter, is simply not there to show.
    if (frame.current?.contentDocument?.getElementById("title-page")) {
      turnToPlace(jump.page);
      pendingPage.current = null;
    } else {
      pendingPage.current = jump.page;
    }
    onJumpDone();
  });

  useEffect(() => followJump(), [jump]);

  const onFrameLoad = () => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    loadedDevice.current = device.id;
    measure();
    // Fonts change where pages break, and they arrive after the frame has loaded.
    void view.document.fonts.ready.then(() => {
      measure();
      if (pendingPage.current) turnToPlace(pendingPage.current);
      pendingPage.current = null;
    });

    // Inside the frame a link's address would point at the editor, so a contents
    // entry turns to its page here instead.
    view.document.addEventListener("click", (event) => {
      const link = (event.target as Element).closest?.('a[target="_self"]');
      if (!link) return;
      event.preventDefault();
      turnToPlace(link.getAttribute("href")?.slice(1) ?? "");
    });

    // Key presses inside the frame don't reach the window.
    view.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && coversPage()) onClose();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
      }
    });
    // Selecting text or searching can scroll the frame, so it snaps back to a page.
    view.addEventListener("scroll", () => {
      const root = view.document.documentElement;
      const index = Math.round(root.scrollLeft / view.innerWidth);
      if (root.scrollLeft !== index * view.innerWidth) view.scrollTo(index * view.innerWidth, 0);
      setPageIndex(index);
    });
  };

  const fitted = {
    width: outerWidth,
    height: outerHeight,
    padding: device.bezel,
    background: device.body,
    borderRadius: device.radius,
    transform: `scale(${scale})`,
    "--bezel": `${device.bezel}px`,
  } as CSSProperties;

  const screen: CSSProperties = {
    height: device.height,
    paddingTop: device.topBar,
    paddingBottom: device.bottomBar,
    color: device.screen.ink,
    background: device.screen.paper,
    borderRadius: device.radius - device.bezel,
  };

  return (
    <aside className="preview-panel" aria-label="Book preview">
      <header className="preview-bar">
        <select
          className="book-font"
          aria-label="Preview device"
          value={deviceId}
          onChange={(event) => {
            setDeviceId(event.target.value);
            onPlaceChange({ deviceId: event.target.value, position: position.current });
          }}
        >
          {PREVIEW_DEVICES.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button ref={closeButton} type="button" className="action" onClick={onClose}>
          Close
        </button>
      </header>
      {failed && (
        <p className="load-error" role="alert">
          Couldn’t build the preview. Close it and try again
        </p>
      )}
      <div ref={stage} className="preview-stage">
        <div className={`preview-device camera-${device.camera}`} style={fitted}>
          <span className="device-camera" />
          <div className="device-screen" style={screen}>
            <div className="device-status" style={{ height: device.topBar }}>
              <span>{device.clock}</span>
              <span className="device-battery" />
            </div>
            <span className="device-home" />
          {/* No scripts can run in here. Same origin lets it load the book's images and
              lets the editor turn its pages, and popups let links open away from it. */}
          {page && (
            <iframe
              ref={frame}
              title="Book preview"
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              srcDoc={page}
              width={device.width}
              height={device.height - device.topBar - device.bottomBar}
              onLoad={onFrameLoad}
            />
          )}
          </div>
        </div>
      </div>
      <footer className="preview-pages">
        <button
          type="button"
          className="action"
          aria-label="Previous page"
          disabled={pageIndex === 0}
          onClick={() => showPage(pageIndex - 1)}
        >
          ‹
        </button>
        <input
          type="range"
          aria-label="Page"
          min={0}
          max={pageCount - 1}
          value={pageIndex}
          onChange={(event) => showPage(Number(event.target.value))}
        />
        <button
          type="button"
          className="action"
          aria-label="Next page"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => showPage(pageIndex + 1)}
        >
          ›
        </button>
        <span role="status">
          Page {pageIndex + 1} of {pageCount}
        </span>
      </footer>
    </aside>
  );
}
