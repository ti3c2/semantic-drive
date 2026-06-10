export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  activeElement?.focus();
  if (!copied) throw new Error('Clipboard is unavailable');
}

export async function copyImageUrlToClipboard(url: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is unavailable');
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load image for copying');
  const sourceBlob = await response.blob();
  const clipboardBlob =
    sourceBlob.type === 'image/png' ? sourceBlob : await convertImageBlobToPng(sourceBlob);
  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': clipboardBlob,
    }),
  ]);
}

async function convertImageBlobToPng(blob: Blob) {
  const image = await loadImageFromBlob(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Could not read image dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare image for copying');
  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        resolve(pngBlob);
      } else {
        reject(new Error('Could not prepare image for copying'));
      }
    }, 'image/png');
  });
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image for copying'));
    };
    image.src = url;
  });
}
