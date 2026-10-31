import { useEffect, useState } from "react";
import { THEME_KEY, THEMES, type Theme } from "@/lib/theme";

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemePicker() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme as Theme);

  useEffect(() => {
    const device = matchMedia("(prefers-color-scheme: dark)");
    const onDeviceChange = () => {
      if (savedTheme()) return;
      const next = device.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    device.addEventListener("change", onDeviceChange);
    return () => device.removeEventListener("change", onDeviceChange);
  }, []);

  return (
    <div className="theme-picker" role="radiogroup" aria-label="Theme">
      {THEMES.map(({ id, label }) => (
        <label key={id} className="theme-option">
          <input
            type="radio"
            name="theme"
            value={id}
            checked={theme === id}
            onChange={() => {
              applyTheme(id);
              setTheme(id);
              try {
                localStorage.setItem(THEME_KEY, id);
              } catch {
                // Private browsing: the theme still applies until the page closes.
              }
            }}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
