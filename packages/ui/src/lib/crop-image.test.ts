import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_AVATAR_SIZE,
  DEFAULT_CROP_QUALITY,
  DEFAULT_MIME_TYPE,
  FALLBACK_MIME_TYPE,
  DEFAULT_FILE_NAME,
  getCroppedImg,
  createImage,
} from "./crop-image";

describe("crop-image utility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exports correct avatar default constants", () => {
    expect(DEFAULT_AVATAR_SIZE).toBe(512);
    expect(DEFAULT_CROP_QUALITY).toBe(0.92);
    expect(DEFAULT_MIME_TYPE).toBe("image/webp");
    expect(FALLBACK_MIME_TYPE).toBe("image/jpeg");
    expect(DEFAULT_FILE_NAME).toBe("avatar.webp");
  });

  it("loads an image asynchronously via createImage", async () => {
    const addEventListenerSpy = vi.fn((event: string, handler: () => void) => {
      if (event === "load") {
        setTimeout(handler, 10);
      }
    });

    vi.spyOn(window, "Image").mockImplementation(() => {
      const img = {
        addEventListener: addEventListenerSpy,
        setAttribute: vi.fn(),
        src: "",
      } as unknown as HTMLImageElement;
      return img;
    });

    const promise = createImage("blob:http://localhost/test");
    await expect(promise).resolves.toBeDefined();
  });

  it("exports cropped image as high-dpi File", async () => {
    const mockCtx = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string) => {
        const blob = new Blob(["fake-image-bytes"], { type });
        callback(blob);
      }),
    };

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });

    vi.spyOn(window, "Image").mockImplementation(() => {
      const img = {
        width: 1000,
        height: 1000,
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === "load") handler();
        }),
        setAttribute: vi.fn(),
        src: "",
      } as unknown as HTMLImageElement;
      return img;
    });

    const file = await getCroppedImg(
      "blob:http://localhost/sample",
      { x: 100, y: 100, width: 400, height: 400 },
      90,
      { outputWidth: 512, outputHeight: 512, quality: 0.92 },
    );

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("avatar.webp");
    expect(file.type).toBe("image/webp");
    expect(mockCtx.imageSmoothingEnabled).toBe(true);
    expect(mockCtx.imageSmoothingQuality).toBe("high");
  });

  it("falls back to jpeg when webp is unsupported", async () => {
    let callCount = 0;
    const mockCtx = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string) => {
        callCount += 1;
        if (type === "image/webp") {
          callback(null); // WebP unsupported
        } else {
          const blob = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
          callback(blob);
        }
      }),
    };

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "canvas") {
        return mockCanvas as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });

    vi.spyOn(window, "Image").mockImplementation(() => {
      const img = {
        width: 800,
        height: 600,
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === "load") handler();
        }),
        setAttribute: vi.fn(),
        src: "",
      } as unknown as HTMLImageElement;
      return img;
    });

    const file = await getCroppedImg("blob:http://localhost/sample", {
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    });

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("avatar.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(callCount).toBe(2);
  });
});
