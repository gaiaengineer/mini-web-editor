export type CopyrightDetails = {
  year?: string;
  holder?: string;
  isbn?: string;
  edition?: string;
  note?: string;
};

// What the title and copyright pages are made from. It lives beside the book's text.
export type BookPages = {
  author: string;
  subtitle?: string;
  copyright?: CopyrightDetails;
};

const OWN_STATEMENT = /©|all rights reserved|derechos reservados|все права защищены/iu;

export function copyrightLines({ author, copyright = {} }: Pick<BookPages, "author" | "copyright">) {
  const holder = (copyright.holder?.trim() || author.trim()).replace(/\.$/, "");
  const year = copyright.year?.trim() || String(new Date().getFullYear());
  // An author's own wording stands. A date or claim shouldn't be invented beside it.
  const ownStatement = !copyright.holder && OWN_STATEMENT.test(copyright.note ?? "");
  const lines = [
    holder && !ownStatement && `© ${year} ${holder}. All rights reserved.`,
    copyright.edition?.trim(),
    copyright.isbn?.trim() && `ISBN ${copyright.isbn.trim()}`,
    ...(copyright.note ?? "").split("\n").map((line) => line.trim()),
  ];
  return lines.filter((line): line is string => !!line);
}
