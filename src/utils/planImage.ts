/**
 * Plan images uploaded in the panel editor. A panel has no file storage, so the image is kept
 * as a data URL in the panel options, that is in the dashboard JSON: it has to stay small.
 * SVG is kept as vector; bitmaps are scaled down and re-encoded.
 */

export const PLAN_ACCEPT = {
  'image/svg+xml': ['.svg'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

/** Longest side of a bitmap plan once stored; plenty for a panel. */
export const MAX_PLAN_SIDE_PX = 2000;

/** Above this the dashboard gets heavy to load: suggest a URL instead. */
export const LARGE_PLAN_BYTES = 1_000_000;

const WEBP_QUALITY = 0.85;

export interface PlanImage {
  url: string;
  widthPx: number;
  heightPx: number;
  /** Size of the stored data URL. */
  bytes: number;
  format: string;
}

/** Size of an SVG from its width and height attributes, else its viewBox. */
export function svgSize(svg: string): { width: number; height: number } | undefined {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) {
    return undefined;
  }
  const attr = (name: string) =>
    parseFloat(root.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? '');
  const width = attr('width');
  const height = attr('height');
  // Percentages and missing sizes parse as NaN or as a bare number of a percentage: trust only the viewBox then.
  const percent = /\s(width|height)\s*=\s*["'][^"']*%/i.test(root);
  if (width > 0 && height > 0 && !percent) {
    return { width, height };
  }
  const viewBox = root
    .match(/\sviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  return undefined;
}

/** Drop comments and whitespace between tags; plans exported by drawing tools shrink a lot. */
export function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/** Height in metres matching the image's proportions for the given width, to 0.1 m. */
export function heightForImage(widthM: number, widthPx: number, heightPx: number): number {
  return Math.round(((widthM * heightPx) / widthPx) * 10) / 10;
}

function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), type, quality)
  );
}

async function loadSvg(file: File): Promise<PlanImage> {
  const text = minifySvg(await file.text());
  const size = svgSize(text);
  if (!size) {
    throw new Error('This SVG has no size: it needs width and height, or a viewBox.');
  }
  const url = `data:image/svg+xml;base64,${utf8Base64(text)}`;
  return { url, widthPx: size.width, heightPx: size.height, bytes: url.length, format: 'SVG' };
}

async function loadBitmap(file: File): Promise<PlanImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PLAN_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const widthPx = Math.round(bitmap.width * scale);
  const heightPx = Math.round(bitmap.height * scale);
  if (scale === 1 && file.size < 200_000) {
    // Already small: keep the file as it is.
    bitmap.close();
    const url = await readAsDataUrl(file);
    return { url, widthPx, heightPx, bytes: url.length, format: file.type.replace('image/', '').toUpperCase() };
  }
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('The image could not be processed in this browser.');
  }
  ctx.drawImage(bitmap, 0, 0, widthPx, heightPx);
  bitmap.close();
  const blob = await canvasBlob(canvas, 'image/webp', WEBP_QUALITY);
  const url = await readAsDataUrl(blob);
  return { url, widthPx, heightPx, bytes: url.length, format: blob.type === 'image/webp' ? 'WebP' : 'PNG' };
}

/** Read an uploaded plan into a data URL small enough for the dashboard JSON. */
export function loadPlanFile(file: File): Promise<PlanImage> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return loadSvg(file);
  }
  if (!Object.keys(PLAN_ACCEPT).includes(file.type)) {
    return Promise.reject(new Error('Use an SVG, PNG, JPEG or WebP image.'));
  }
  return loadBitmap(file);
}

export function formatBytes(bytes: number): string {
  return bytes < 1000
    ? `${bytes} B`
    : bytes < 1_000_000
      ? `${Math.round(bytes / 1000)} kB`
      : `${(bytes / 1e6).toFixed(1)} MB`;
}
