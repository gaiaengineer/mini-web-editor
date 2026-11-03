import { describe, expect, it } from "vitest";
import { copyrightLines } from "./bookPages";

const year = new Date().getFullYear();

describe("copyrightLines", () => {
  it("writes a standard line from the author", () => {
    expect(copyrightLines({ author: "A. Writer" })).toEqual([`© ${year} A. Writer. All rights reserved.`]);
  });

  it("uses the year and holder given", () => {
    expect(copyrightLines({ author: "A. Writer", copyright: { year: "2019", holder: "Rain Press" } })).toEqual([
      "© 2019 Rain Press. All rights reserved.",
    ]);
  });

  it("adds the edition, ISBN and other text", () => {
    const copyright = { edition: "First edition", isbn: "978-3-16-148410-0", note: "A work of fiction.\nCover by Ana." };
    expect(copyrightLines({ author: "A. Writer", copyright })).toEqual([
      `© ${year} A. Writer. All rights reserved.`,
      "First edition",
      "ISBN 978-3-16-148410-0",
      "A work of fiction.",
      "Cover by Ana.",
    ]);
  });

  it("doesn't double a period after a holder's initials", () => {
    expect(copyrightLines({ author: "Rain Inc." })).toEqual([`© ${year} Rain Inc. All rights reserved.`]);
  });

  it("invents no copyright line when the author's own is in the text", () => {
    expect(copyrightLines({ author: "A. Writer", copyright: { note: "All rights reserved." } })).toEqual(["All rights reserved."]);
  });

  it("has nothing to say with no author or details", () => {
    expect(copyrightLines({ author: "  " })).toEqual([]);
  });

  it("keeps other details with no author", () => {
    expect(copyrightLines({ author: "", copyright: { isbn: "123" } })).toEqual(["ISBN 123"]);
  });
});
