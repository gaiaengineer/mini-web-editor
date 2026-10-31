// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanPastedHtml } from "./paste";

describe("cleanPastedHtml", () => {
  it("moves the align attribute into a style", () => {
    expect(cleanPastedHtml('<p align="center">x</p>')).toContain("text-align: center");
  });

  it("turns aligned wrappers around text into paragraphs", () => {
    expect(cleanPastedHtml('<div style="text-align: right">x</div>')).toBe(
      '<p style="text-align: right">x</p>',
    );
    expect(cleanPastedHtml("<center>x</center>")).toContain('<p style="text-align: center');
  });

  it("passes wrapper alignment down to the blocks inside", () => {
    const html = cleanPastedHtml('<div style="text-align: center"><p>a</p><h2>b</h2></div>');
    expect(html).toContain('<p style="text-align: center');
    expect(html).toContain('<h2 style="text-align: center');
  });

  it("maps headings the editor has no level for", () => {
    expect(cleanPastedHtml("<h5>x</h5>")).toBe("<h3>x</h3>");
    expect(cleanPastedHtml('<p class="MsoTitle">x</p>')).toContain("<h1");
    expect(cleanPastedHtml('<p class="MsoSubtitle">x</p>')).toContain("<h2");
  });
});
