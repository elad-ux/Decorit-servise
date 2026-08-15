/** Meta's real per-media-type limits for WhatsApp template headers. */
export const META_MEDIA_LIMITS: Record<"image" | "video" | "document", { bytes: number; label: string }> = {
  image: { bytes: 5 * 1024 * 1024, label: "5MB" },
  video: { bytes: 16 * 1024 * 1024, label: "16MB" },
  document: { bytes: 100 * 1024 * 1024, label: "100MB" },
};

/**
 * Re-encodes an image as JPEG, stepping quality down and (if still too big)
 * shrinking dimensions too, until it fits under maxBytes. Returns the
 * original file untouched if it's already under the limit. Non-image files
 * should never be passed here — video/document can't be safely
 * re-compressed client-side, so those just get validated against the size
 * limit as-is.
 */
export async function compressImageIfNeeded(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;

  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;

  const tryEncode = (w: number, h: number, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });

  const makeFile = (blob: Blob) => new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });

  // Pass 1: same dimensions, step quality down — cheapest way to shrink
  // without visibly hurting quality, so try this before touching size.
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await tryEncode(width, height, quality);
    if (blob && blob.size <= maxBytes) return makeFile(blob);
  }

  // Pass 2: still too big at low quality — the image itself is just huge
  // (e.g. a raw photo), so scale dimensions down incrementally too.
  for (let attempt = 0; attempt < 8; attempt++) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    const blob = await tryEncode(width, height, 0.6);
    if (blob && blob.size <= maxBytes) return makeFile(blob);
  }

  // Couldn't get it under the limit even after aggressive compression —
  // let the caller's size check reject it with a clear message instead of
  // silently uploading something that will still fail at Meta.
  return file;
}
