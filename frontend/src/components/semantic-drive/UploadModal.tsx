import type { FormEvent } from 'react';
import { FileDropzone } from './FileDropzone';
import { PendingFileThumb } from './PendingFileThumb';
import { fileKey, formatBytes } from './utils';

type UploadModalProps = {
  uploading: boolean;
  pendingFiles: File[];
  uploadDescription: string;
  uploadTags: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onOpenFilePicker: () => void;
  onAddFiles: (files: File[]) => void;
  onRemovePendingFile: (index: number) => void;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
};

export function UploadModal({
  uploading,
  pendingFiles,
  uploadDescription,
  uploadTags,
  onClose,
  onSubmit,
  onOpenFilePicker,
  onAddFiles,
  onRemovePendingFile,
  onDescriptionChange,
  onTagsChange,
}: UploadModalProps) {
  return (
    <div
      className="sd-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="sd-upload-modal" onSubmit={onSubmit}>
        <button type="button" className="sd-close" onClick={onClose}>
          &times;
        </button>
        <h2>Upload content</h2>

        <FileDropzone
          className="sd-upload-drop"
          uploading={uploading}
          onOpenFilePicker={onOpenFilePicker}
          onAddFiles={onAddFiles}
          title="Drop files"
          subtitle={pendingFiles.length ? `${pendingFiles.length} selected` : 'No files selected'}
        />

        {!!pendingFiles.length && (
          <ul className="sd-file-list">
            {pendingFiles.map((file, index) => (
              <li key={fileKey(file)}>
                <PendingFileThumb file={file} />
                <span className="sd-file-name">{file.name}</span>
                <small>
                  {file.type || 'file'} &middot; {formatBytes(file.size)}
                </small>
                <button type="button" onClick={() => onRemovePendingFile(index)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="sd-field">
          <span>Description</span>
          <textarea
            value={uploadDescription}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={4}
            placeholder="Project notes, source, context..."
          />
        </label>

        <label className="sd-field">
          <span>Tags</span>
          <input
            value={uploadTags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="research, invoice, client-a"
          />
        </label>

        <div className="sd-modal-actions">
          <button type="button" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button type="submit" disabled={uploading || !pendingFiles.length}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}
