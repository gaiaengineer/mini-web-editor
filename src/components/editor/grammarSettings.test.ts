import { describe, expect, it } from "vitest";
import type { Draft } from "@/lib/drafts";
import { defaultDialect } from "@/lib/grammar/harper";
import { GrammarSettings } from "./grammarSettings";

const draft = (words: string, extra: Partial<Draft> = {}): Draft => ({
  id: "d",
  bookId: "b",
  title: "",
  author: "",
  updatedAt: "",
  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] },
  ...extra,
});

const ENGLISH = "The rain kept falling on the town and the market, and nobody in it could remember a wetter spring than this one. ".repeat(3);
const SPANISH = "La lluvia cayó sobre la ciudad y los vecinos de la plaza que estaban en el mercado se fueron para las casas del río. ".repeat(3);

describe("spelling and grammar settings", () => {
  it("check an English book by default", () => {
    expect(new GrammarSettings(draft(ENGLISH)).checker()).not.toBeNull();
  });

  it("don't check a French book, even in an English browser", () => {
    const french = "La pluie tombait sur la ville depuis trois jours et personne au marché ne se souvenait d'un printemps aussi humide que celui-ci, disait la vieille femme. ".repeat(3);
    expect(new GrammarSettings(draft(french)).english).toBe(false);
  });

  it("take a new, empty book to be in the browser's language", async () => {
    const { isEnglishBook } = await import("./grammarSettings");
    expect(isEnglishBook(draft("").content, "en-GB")).toBe(true);
    expect(isEnglishBook(draft("").content, "es-ES")).toBe(false);
  });

  it("never check a book in another language", () => {
    const settings = new GrammarSettings(draft(SPANISH, { check: "british" }));
    expect(settings.english).toBe(false);
    expect(settings.checker()).toBeNull();
  });

  it("keep the author's choice, and turn off for one that no longer exists", () => {
    expect(new GrammarSettings(draft(ENGLISH, { check: "british" })).check).toBe("british");
    expect(new GrammarSettings(draft(ENGLISH, { check: "off" })).checker()).toBeNull();
    const settings = new GrammarSettings(draft(ENGLISH));
    settings.setCheck("klingon");
    expect(settings.check).toBe("off");
  });

  it("keep the book's dictionary sorted and without repeats", () => {
    const settings = new GrammarSettings(draft(ENGLISH, { dictionary: ["Zia"] }));
    settings.addWord("Arlo");
    settings.addWord("Zia");
    expect(settings.saved().dictionary).toEqual(["Arlo", "Zia"]);
  });

  it("pick the dialect from the browser's region", () => {
    expect(defaultDialect("en-GB")).toBe("british");
    expect(defaultDialect("en-AU")).toBe("australian");
    expect(defaultDialect("en-US")).toBe("american");
    expect(defaultDialect("de-DE")).toBe("american");
  });
});
