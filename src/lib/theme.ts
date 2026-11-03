export const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "sepia", label: "Sepia" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

export const THEME_KEY = "mini-web-editor-theme";

// Runs before the first paint, so a dark or sepia page never flashes white.
// Until an author chooses, the theme follows their device.
export const themeScript = `(function () {
  var theme;
  try { theme = localStorage.getItem("${THEME_KEY}"); } catch (e) {}
  if (theme !== "light" && theme !== "dark" && theme !== "sepia") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
})();`;
