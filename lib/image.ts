/**
 * Client-side image compression. Reads a picked File, downscales it to fit
 * within `maxDim` (px, longest side) and re-encodes as a JPEG data URL.
 *
 * The app stores images as base64 data URLs (no object storage), so keeping the
 * output small matters — screenshots go straight into a text/jsonb column.
 * Runs in the browser only (uses FileReader / canvas).
 */
export function compressImage(
  file: File,
  { maxDim = 1024, quality = 0.7 }: { maxDim?: number; quality?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
