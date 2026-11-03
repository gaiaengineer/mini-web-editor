import type { Lint, WorkerLinter } from "harper.js";

// Spelling and grammar checking with Harper, which runs entirely in the browser:
// no text leaves the author's computer. English only.

export const DIALECTS = [
  { id: "american", label: "American English" },
  { id: "british", label: "British English" },
  { id: "canadian", label: "Canadian English" },
  { id: "australian", label: "Australian English" },
  { id: "indian", label: "Indian English" },
] as const;

export type DialectId = (typeof DIALECTS)[number]["id"];
export type CheckSetting = DialectId | "off";

export const isDialect = (value: unknown): value is DialectId => DIALECTS.some(({ id }) => id === value);

// The dialect an English-speaking author most likely writes in, from the browser.
export function defaultDialect(language = typeof navigator === "undefined" ? "" : navigator.language): DialectId {
  const region = language.split("-")[1]?.toUpperCase();
  if (region === "GB" || region === "IE" || region === "NZ") return "british";
  if (region === "CA") return "canadian";
  if (region === "AU") return "australian";
  if (region === "IN") return "indian";
  return "american";
}

// Rules that are style opinions, or that fiction breaks on purpose: dialogue that
// runs over several paragraphs leaves its quote open, characters swear and say
// "gonna". Tuned on the test manuscripts.
export const RULES_OFF = [
  "LongSentences",
  "UnclosedQuotes",
  "OxfordComma",
  "AvoidCurses",
  "UseEllipsisCharacter",
  "EllipsisLength",
  "Gonna",
  "Wanna",
  "Gotta",
] as const;

export type Fix = { kind: "replace" | "remove" | "insertAfter"; text: string };
// Positions are offsets into the text that was checked, in the same units as
// JavaScript strings, which is also how the editor counts.
export type Mistake = { start: number; end: number; message: string; kind: string; problem: string; fixes: Fix[] };

export type CheckSettings = { dialect: DialectId; words: string[]; ignored: string };

export interface Checker {
  check(text: string): Promise<Mistake[]>;
  // Returns the book's ignored mistakes, with this one added, to be saved.
  ignore(text: string, mistake: Mistake): Promise<string>;
}

const FIX_KINDS = ["replace", "remove", "insertAfter"] as const;
const MAX_FIXES = 4;

function toMistake(lint: Lint): Mistake {
  const span = lint.span();
  return {
    start: span.start,
    end: span.end,
    message: lint.message(),
    kind: lint.lint_kind(),
    problem: lint.get_problem_text(),
    fixes: lint
      .suggestions()
      .slice(0, MAX_FIXES)
      .map((fix) => ({ kind: FIX_KINDS[fix.kind()] ?? "replace", text: fix.get_replacement_text() })),
  };
}

let linter: Promise<WorkerLinter> | null = null;
const applied = { dialect: "", words: "", ignored: "" };

async function createLinter(dialect: DialectId) {
  // Loaded only when a book is checked: the checker is about 8 MB to download.
  const [{ WorkerLinter, Dialect, createBinaryModuleFromUrl }, { binary: bundled }] = await Promise.all([
    import("harper.js"),
    import("harper.js/binary"),
  ]);
  // The bundler gives the binary a path on this site. The checker's worker runs from
  // a blob: address, where such a path means nothing, so it gets the full address.
  const binary = createBinaryModuleFromUrl(new URL(String(bundled.url), location.href).href, "full");
  const dialects: Record<DialectId, number> = {
    american: Dialect.American,
    british: Dialect.British,
    canadian: Dialect.Canadian,
    australian: Dialect.Australian,
    indian: Dialect.Indian,
  };
  const created = new WorkerLinter({ binary, dialect: dialects[dialect] });
  const config = await created.getDefaultLintConfig();
  for (const rule of RULES_OFF) config[rule] = false;
  await created.setLintConfig(config);
  applied.dialect = dialect;
  return Object.assign(created, { dialects });
}

async function linterFor({ dialect, words, ignored }: CheckSettings) {
  // A failed load is forgotten, so the next check tries again rather than
  // failing for the rest of the session.
  linter ??= createLinter(dialect).catch((error) => {
    linter = null;
    applied.dialect = applied.words = applied.ignored = "";
    throw error;
  });
  const ready = (await linter) as WorkerLinter & { dialects: Record<DialectId, number> };
  if (applied.dialect !== dialect) {
    await ready.setDialect(ready.dialects[dialect]);
    applied.dialect = dialect;
  }
  const wordKey = words.join("\n");
  if (applied.words !== wordKey) {
    await ready.clearWords();
    if (words.length) await ready.importWords(words);
    applied.words = wordKey;
  }
  if (applied.ignored !== ignored) {
    await ready.clearIgnoredLints();
    if (ignored) await ready.importIgnoredLints(ignored);
    applied.ignored = ignored;
  }
  return ready;
}

export function harperChecker(settings: CheckSettings): Checker {
  return {
    async check(text) {
      const ready = await linterFor(settings);
      return (await ready.lint(text, { language: "plaintext" })).map(toMistake);
    },
    async ignore(text, mistake) {
      const ready = await linterFor(settings);
      const lint = (await ready.lint(text, { language: "plaintext" })).find(
        (found) => found.span().start === mistake.start && found.span().end === mistake.end && found.message() === mistake.message,
      );
      if (lint) await ready.ignoreLint(text, lint);
      const exported = await ready.exportIgnoredLints();
      applied.ignored = exported;
      return exported;
    },
  };
}
