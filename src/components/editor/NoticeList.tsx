import type { ImportNotice } from "@/import/notices";

const WHAT_HAPPENED: Record<ImportNotice["kind"], string> = {
  footnote: "A footnote moved to the end of the book",
  table: "A table became plain text",
  textBox: "A text box became plain text",
  image: "An image couldn’t be kept",
  contents: "The typed table of contents was taken out. The book makes its own",
  copyright: "Copyright lines moved from the text to the Copyright page",
  title: "Title lines moved from the text to the Title page",
};

// These are about the whole book, not one place in it.
const PAGE_NOTICES: ImportNotice["kind"][] = ["contents", "copyright", "title"];

type Props = {
  notices: ImportNotice[];
  onDismiss: () => void;
};

export function NoticeList({ notices, onDismiss }: Props) {
  return (
    <section className="import-notices" aria-label="What the import changed">
      <div className="import-notices-header">
        <h2>The import couldn’t keep everything as it was</h2>
        <button type="button" className="action" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <ul>
        {notices.map(({ kind, near }, index) => (
          <li key={index}>
            {WHAT_HAPPENED[kind]}
            {near ? `, near “${near}”` : !PAGE_NOTICES.includes(kind) && " at the start of the book"}
          </li>
        ))}
      </ul>
    </section>
  );
}
