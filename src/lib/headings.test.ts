import type { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { listHeadings } from "./headings";

const block = (name: string, textContent: string, level?: number) =>
  ({ type: { name }, textContent, attrs: { level } }) as unknown as Node;

function doc(...nodes: Node[]) {
  return {
    forEach(callback: (node: Node, offset: number, index: number) => void) {
      nodes.forEach((node, index) => callback(node, index * 10, index));
    },
  };
}

describe("listHeadings", () => {
  it("lists headings of every level in order", () => {
    const headings = listHeadings(
      doc(block("paragraph", "text"), block("heading", "One", 1), block("heading", "Sub", 3)),
    );
    expect(headings).toEqual([
      { pos: 10, level: 1, title: "One" },
      { pos: 20, level: 3, title: "Sub" },
    ]);
  });

  it("skips empty headings", () => {
    expect(listHeadings(doc(block("heading", "  ", 1)))).toEqual([]);
  });
});
