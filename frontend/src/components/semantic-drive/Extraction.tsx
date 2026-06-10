import { useState } from 'react';
import { InlineSpinner } from './StatusIndicator';

type ExtractionProps = {
  title: string;
  text?: string | null;
  open?: boolean;
  deleting?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
};

export function Extraction({ title, text, open, deleting, onToggle, onDelete }: ExtractionProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  if (!text) return null;

  const isOpen = open ?? internalOpen;

  function toggleOpen() {
    if (onToggle) {
      onToggle();
      return;
    }
    setInternalOpen((current) => !current);
  }

  return (
    <section className="sd-extraction">
      <div className="sd-extraction-header">
        <button
          type="button"
          className="sd-extraction-toggle"
          aria-expanded={isOpen}
          onClick={toggleOpen}
        >
          <span>{isOpen ? '-' : '+'}</span>
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
      {isOpen && <pre>{text}</pre>}
    </section>
  );
}
