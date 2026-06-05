export function computeDownsize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Browser-only: fetch the page image, downscale via canvas, return JPEG bytes.
// Not unit-tested (canvas/DOM); covered by the manual verification gate.
export async function downscaleImage(sourceUrl: string, maxEdge = 2200): Promise<Blob> {
  const bitmap = await createImageBitmap(await (await fetch(sourceUrl)).blob());
  const { width, height } = computeDownsize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9),
  );
}
