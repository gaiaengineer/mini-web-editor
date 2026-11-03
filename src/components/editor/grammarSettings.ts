import type { JSONContent } from "@tiptap/core";
import type { Draft } from "@/lib/drafts";
import { plainText } from "@/lib/epub/serialize";
import { defaultDialect, harperChecker, isDialect, type CheckSetting, type Checker } from "@/lib/grammar/harper";

// The checker knows English only. A book in another language would be marked on
// nearly every word, so it is checked only when its text reads as English:
// English prose is full of these words, and other languages rarely use them.
const ENGLISH_WORDS = /^(the|and|of|to|was|that|with|for|his|her|she|he|it|is|you|in|had|not|but)$/;
const ENOUGH_WORDS = 30;
const ENGLISH_SHARE = 0.12;

export function isEnglishBook(content: JSONContent, browserLanguage = typeof navigator === "undefined" ? "en" : navigator.language) {
  const words = plainText(content).slice(0, 20000).toLowerCase().match(/\p{L}+/gu) ?? [];
  // Too little text to tell: a new book is taken to be in the browser's language.
  if (words.length < ENOUGH_WORDS) return browserLanguage.toLowerCase().startsWith("en");
  return words.filter((word) => ENGLISH_WORDS.test(word)).length / words.length >= ENGLISH_SHARE;
}

// A book's spelling and grammar settings. The editor's checker reads them each time
// it runs, so a change applies on the next check without rebuilding the editor.
export class GrammarSettings {
  readonly english: boolean;
  check: CheckSetting;
  words: string[];
  ignored: string;

  constructor(draft: Draft) {
    this.english = isEnglishBook(draft.content);
    const saved = draft.check;
    this.check = saved === "off" || isDialect(saved) ? saved : this.english ? defaultDialect() : "off";
    this.words = draft.dictionary ?? [];
    this.ignored = draft.ignoredMistakes ?? "";
  }

  checker(): Checker | null {
    if (!this.english || this.check === "off") return null;
    return harperChecker({ dialect: this.check, words: this.words, ignored: this.ignored });
  }

  setCheck(value: string) {
    this.check = value === "off" || isDialect(value) ? value : "off";
  }

  setIgnored(ignored: string) {
    this.ignored = ignored;
  }

  addWord(word: string) {
    if (!this.words.includes(word)) this.words = [...this.words, word].sort();
  }

  saved() {
    return { check: this.check, dictionary: this.words, ignoredMistakes: this.ignored };
  }
}
