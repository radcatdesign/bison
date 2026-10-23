import "server-only";
// Uploaded images for emails and logos. Everything is re-encoded here: turned
// upright, resized for email (twice the display width, for sharp screens),
// stripped of camera details like location, and saved as PNG, JPEG or GIF,
// the formats every email app shows.
import sharp, { type Metadata, type OutputInfo } from "sharp";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;

export type ImageKind = "logo" | "email-image";
export type ProcessedImage = { bytes: Buffer; contentType: "image/png" | "image/jpeg" | "image/gif"; width: number; height: number };

export class ImageError extends Error {}

const MAX_WIDTH: Record<ImageKind, number> = { logo: 600, "email-image": 1200 };

export async function processImage(input: Buffer, kind: ImageKind): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageError("That file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError("That image is over 12 MB. Try a smaller one.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { animated: true, limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new ImageError("That file isn't an image we can read. Use a PNG, JPEG, GIF, WebP or HEIC.");
  }
  if (!meta.format || !["png", "jpeg", "gif", "webp", "heif", "avif", "tiff"].includes(meta.format)) {
    throw new ImageError("That file isn't an image we can read. Use a PNG, JPEG, GIF, WebP or HEIC.");
  }

  const maxWidth = MAX_WIDTH[kind];
  const animated = meta.format === "gif" && (meta.pages ?? 1) > 1;

  const encode = async (width: number, quality: number): Promise<ProcessedImage> => {
    const base = sharp(input, { animated, limitInputPixels: 60_000_000 }).rotate().resize({ width, withoutEnlargement: true });
    let out: { data: Buffer; info: OutputInfo };
    let contentType: ProcessedImage["contentType"];
    if (animated) {
      out = await base.gif({ effort: 7 }).toBuffer({ resolveWithObject: true });
      contentType = "image/gif";
    } else if (meta.hasAlpha || meta.format === "png" || kind === "logo") {
      out = await base.png({ compressionLevel: 9, palette: kind === "logo" }).toBuffer({ resolveWithObject: true });
      contentType = "image/png";
    } else {
      out = await base.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      contentType = "image/jpeg";
    }
    const height = animated && out.info.pageHeight ? out.info.pageHeight : out.info.height;
    return { bytes: out.data, contentType, width: out.info.width, height };
  };

  let result = await encode(maxWidth, 82);
  // Large photos get smaller until they fit, so nothing is refused for being too big.
  for (const [width, quality] of [
    [Math.round(maxWidth * 0.8), 76],
    [Math.round(maxWidth * 0.6), 70],
    [Math.round(maxWidth * 0.45), 64],
  ] as const) {
    if (result.bytes.length <= MAX_STORED_BYTES) break;
    result = await encode(width, quality);
  }
  if (result.bytes.length > MAX_STORED_BYTES) throw new ImageError("That image is still over 2 MB after resizing. Try a shorter animation or a smaller image.");
  return result;
}
