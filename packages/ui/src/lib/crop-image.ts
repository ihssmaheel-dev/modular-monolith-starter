export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropImageOptions {
  outputWidth?: number;
  outputHeight?: number;
  mimeType?: string;
  quality?: number;
  fileName?: string;
}

export const DEFAULT_AVATAR_SIZE = 512;
export const DEFAULT_CROP_QUALITY = 0.92;
export const DEFAULT_MIME_TYPE = "image/webp";
export const FALLBACK_MIME_TYPE = "image/jpeg";
export const DEFAULT_FILE_NAME = "avatar.webp";

export function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

function calculateRotatedBoundingBox(width: number, height: number, rotationDegrees: number) {
  const rad = (rotationDegrees * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

export async function getCroppedCanvas(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation = 0,
  outputWidth = DEFAULT_AVATAR_SIZE,
  outputHeight = DEFAULT_AVATAR_SIZE,
): Promise<HTMLCanvasElement> {
  const image = await createImage(imageSrc);
  const rotRad = (rotation * Math.PI) / 180;

  const { width: bBoxWidth, height: bBoxHeight } = calculateRotatedBoundingBox(
    image.width,
    image.height,
    rotation,
  );

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = bBoxWidth;
  rotCanvas.height = bBoxHeight;
  const rotCtx = rotCanvas.getContext("2d");

  if (!rotCtx) {
    throw new Error("Failed to create 2D context for rotated canvas");
  }

  rotCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
  rotCtx.rotate(rotRad);
  rotCtx.translate(-image.width / 2, -image.height / 2);
  rotCtx.drawImage(image, 0, 0);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  const outCtx = outCanvas.getContext("2d");

  if (!outCtx) {
    throw new Error("Failed to create 2D context for output canvas");
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";

  outCtx.drawImage(
    rotCanvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return outCanvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation = 0,
  options: CropImageOptions = {},
): Promise<File> {
  const outputWidth = options.outputWidth ?? DEFAULT_AVATAR_SIZE;
  const outputHeight = options.outputHeight ?? DEFAULT_AVATAR_SIZE;
  const mimeType = options.mimeType ?? DEFAULT_MIME_TYPE;
  const quality = options.quality ?? DEFAULT_CROP_QUALITY;
  const fileName = options.fileName ?? DEFAULT_FILE_NAME;

  const canvas = await getCroppedCanvas(imageSrc, pixelCrop, rotation, outputWidth, outputHeight);

  let blob = await canvasToBlob(canvas, mimeType, quality);

  // Fallback to jpeg if webp export is unsupported by browser canvas
  if (!blob && mimeType === DEFAULT_MIME_TYPE) {
    blob = await canvasToBlob(canvas, FALLBACK_MIME_TYPE, quality);
  }

  if (!blob) {
    throw new Error("Canvas export failed: could not generate image blob");
  }

  const resolvedFileName =
    blob.type === FALLBACK_MIME_TYPE && fileName.endsWith(".webp")
      ? fileName.replace(/\.webp$/i, ".jpg")
      : fileName;

  return new File([blob], resolvedFileName, {
    type: blob.type || mimeType,
    lastModified: Date.now(),
  });
}
