import { useEffect, useState } from 'react';
import { isImageFile } from './utils';

export function PendingFileThumb({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImageFile(file)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (previewUrl) {
    return <img className="sd-file-thumb" src={previewUrl} alt="" />;
  }

  return (
    <span className="sd-file-thumb sd-file-thumb-placeholder">
      {file.type.split('/')[0] || 'file'}
    </span>
  );
}
