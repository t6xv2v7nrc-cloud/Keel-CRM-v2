import { supabase } from '../../lib/supabase';

/** Compress an image to a max dimension, returning a JPEG blob.
 *  Keeps OCR fast and storage small. */
export async function compressImage(file: File | Blob, maxDim = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
      'image/jpeg',
      0.85,
    );
  });
}

/** Upload a screenshot to the private 'bin' bucket and return its storage path. */
export async function uploadToBin(blob: Blob): Promise<string> {
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('bin').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Short-lived signed URL so the UI can show a private screenshot. */
export async function signedBinUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from('bin').createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
