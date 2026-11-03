import { useEffect, useRef, useState } from "react";
import { DIVIDERS } from "@/lib/dividers";
import { FONTS, type BookFont } from "@/lib/fonts";
import { DIALECTS } from "@/lib/grammar/harper";
import { ThemePicker } from "./ThemePicker";

function CogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.17l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.26 14H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.17-2.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9.92 3.2V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 1.17 2.82H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </svg>
  );
}

type Props = {
  font: BookFont | undefined;
  onFontChange: (id: string) => void;
  divider: string;
  onDividerChange: (id: string) => void;
  check: string;
  // Only English books can be checked.
  checkAvailable: boolean;
  onCheckChange: (value: string) => void;
};

export function SettingsMenu({ font, onFontChange, divider, onDividerChange, check, checkAvailable, onCheckChange }: Props) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menu} className="settings">
      <button
        type="button"
        className="tool"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <CogIcon />
      </button>
      {open && (
        <div className="settings-menu" role="group" aria-label="Settings">
          <label className="settings-row">
            <span>Book font</span>
            <select className="book-font" value={font?.id ?? ""} onChange={(event) => onFontChange(event.target.value)}>
              <option value="">Default font</option>
              {(["Serif", "Sans-serif"] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {FONTS.filter((option) => option.group === group).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>Scene divider</span>
            <select className="book-divider" value={divider} onChange={(event) => onDividerChange(event.target.value)}>
              {DIVIDERS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>Spelling and grammar</span>
            <select
              className="book-check"
              value={checkAvailable ? check : "off"}
              disabled={!checkAvailable}
              onChange={(event) => onCheckChange(event.target.value)}
            >
              <option value="off">{checkAvailable ? "Off" : "English books only"}</option>
              {DIALECTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-row">
            <span>Theme</span>
            <ThemePicker />
          </div>
        </div>
      )}
    </div>
  );
}
