// How a book's scene dividers look. The author picks one style for the whole book;
// the text only marks where each divider is.
export const DIVIDERS = [
  { id: "line", label: "Line", text: null },
  { id: "stars", label: "* * *", text: "* * *" },
  { id: "flower", label: "❦", text: "❦" },
] as const;

export type DividerStyle = (typeof DIVIDERS)[number]["id"];

export const dividerById = (id: string | undefined) => DIVIDERS.find((style) => style.id === id) ?? DIVIDERS[0];

// The EPUB and preview markup for one divider. A line stays a plain <hr/>; the
// others are text, which every reading app shows the same way.
export function dividerHtml(id: string | undefined) {
  const { text } = dividerById(id);
  return text ? `<p class="scene-break" role="separator">${text}</p>` : "<hr/>";
}
