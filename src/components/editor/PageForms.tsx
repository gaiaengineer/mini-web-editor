import type { BookPages, CopyrightDetails } from "@/lib/bookPages";
import { copyrightLines } from "@/lib/bookPages";

export type EditablePages = BookPages & { title: string };

type Props = {
  pages: EditablePages;
  onChange: (change: Partial<EditablePages>) => void;
};

function Field({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="page-field">
      <span>{label}</span>
      <input value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function TitlePageForm({ pages, onChange }: Props) {
  return (
    <section className="page-form" aria-label="Title page">
      <h1>Title page</h1>
      <Field label="Title" value={pages.title} onChange={(title) => onChange({ title })} />
      <Field label="Subtitle" value={pages.subtitle} onChange={(subtitle) => onChange({ subtitle })} />
      <Field label="Author" value={pages.author} onChange={(author) => onChange({ author })} />
    </section>
  );
}

export function CopyrightForm({ pages, onChange }: Props) {
  const details = pages.copyright ?? {};
  const change = (patch: CopyrightDetails) => onChange({ copyright: { ...details, ...patch } });
  const lines = copyrightLines(pages);

  return (
    <section className="page-form" aria-label="Copyright">
      <h1>Copyright</h1>
      <Field
        label="Year"
        value={details.year}
        placeholder={String(new Date().getFullYear())}
        onChange={(year) => change({ year })}
      />
      <Field label="Copyright holder" value={details.holder} placeholder={pages.author} onChange={(holder) => change({ holder })} />
      <Field label="ISBN (optional)" value={details.isbn} onChange={(isbn) => change({ isbn })} />
      <Field label="Edition (optional)" value={details.edition} placeholder="First edition" onChange={(edition) => change({ edition })} />
      <label className="page-field">
        <span>Other text (optional)</span>
        <textarea
          rows={4}
          value={details.note ?? ""}
          placeholder="Credits, or a note that this is a work of fiction"
          onChange={(event) => change({ note: event.target.value })}
        />
      </label>
      <div className="page-sample">
        <h2>On the page</h2>
        {lines.length ? lines.map((line, index) => <p key={index}>{line}</p>) : <p>Add an author or copyright holder.</p>}
      </div>
    </section>
  );
}
