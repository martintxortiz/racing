export const generatedAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/10.x/glass/svg?seed=${encodeURIComponent(seed)}&size=32`;

export const AVATAR_SIZE = 32;

export type Size = { width: number; height: number };
export type Offset = { x: number; y: number };

export function maxOffset(natural: Size, zoom: number): Offset {
  const min = Math.min(natural.width, natural.height);
  return {
    x: Math.max(0, (natural.width / min) * zoom - 1) / 2,
    y: Math.max(0, (natural.height / min) * zoom - 1) / 2,
  };
}

export function coverSquarePlacement(
  natural: Size,
  zoom: number,
  offset: Offset,
  size = AVATAR_SIZE,
) {
  const scale = Math.max(size / natural.width, size / natural.height) * zoom;
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: (size - width) / 2 + offset.x * size,
    y: (size - height) / 2 + offset.y * size,
    width,
    height,
  };
}

export async function toAvatarDataUrl(
  file: Blob,
  zoom: number,
  offset: Offset,
) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d")!;
  const { x, y, width, height } = coverSquarePlacement(bitmap, zoom, offset);
  ctx.drawImage(bitmap, x, y, width, height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.9);
}
