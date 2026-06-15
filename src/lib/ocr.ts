import Tesseract from 'tesseract.js';

/** Run OCR on an image (File, Blob, or data URL) entirely in the browser.
 *  Free, private, no API key. First call downloads ~10MB of language data,
 *  then it is cached by the browser. `onProgress` reports 0..1. */
export async function ocrImage(
  image: File | Blob | string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const result = await Tesseract.recognize(image, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    },
  });
  return result.data.text.trim();
}
