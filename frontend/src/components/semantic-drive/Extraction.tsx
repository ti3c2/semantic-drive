import { useState } from 'react';
import { InlineSpinner } from './StatusIndicator';

type ExtractionProps = {
  title: string;
  text?: string | null;
  deleting?: boolean;
  onDelete?: () => void;
};

export function Extraction({ title, text, deleting, onDelete }: ExtractionProps) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <section className="sd-extraction">
      <div className="sd-extraction-header">
        <button
          type="button"
          className="sd-extraction-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{open ? '-' : '+'}</span>
          {title}
        </button>
        {onDelete && (
          <button
            type="button"
            className="sd-extraction-delete"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting && <InlineSpinner />}
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
      {open && <pre>{text}</pre>}
    </section>
  );
}
