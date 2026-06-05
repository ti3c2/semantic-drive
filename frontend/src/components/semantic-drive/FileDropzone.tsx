import type { ReactNode } from 'react';

type FileDropzoneProps = {
  className: string;
  uploading: boolean;
  title: string;
  subtitle: ReactNode;
  onOpenFilePicker: () => void;
  onAddFiles: (files: File[]) => void;
};

export function FileDropzone({
  className,
  uploading,
  title,
  subtitle,
  onOpenFilePicker,
  onAddFiles,
}: FileDropzoneProps) {
  return (
    <div
      className={className}
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-disabled={uploading}
      onClick={() => {
        if (!uploading) onOpenFilePicker();
      }}
      onKeyDown={(event) => {
        if (uploading) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenFilePicker();
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onAddFiles(Array.from(event.dataTransfer.files || []));
      }}
    >
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}
