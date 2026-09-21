"use client";

import * as React from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Loader2 } from "lucide-react";

import "react-easy-crop/react-easy-crop.css";
import { cn } from "@repo/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Slider } from "@repo/ui/components/ui/slider";
import { Button } from "@repo/ui/components/ui/button";
import { getCroppedImg, DEFAULT_AVATAR_SIZE, type PixelCrop } from "../../lib/crop-image";

export interface ImageCropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string | null;
  onCropComplete: (file: File) => void | Promise<void>;
  aspectRatio?: number;
  cropShape?: "round" | "rect";
  outputSize?: number;
  showGrid?: boolean;
  title?: string;
  description?: string;
  zoomLabel?: string;
  rotateLabel?: string;
  resetLabel?: string;
  cancelLabel?: string;
  applyLabel?: string;
  previewLabel?: string;
  isPending?: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;
const ZOOM_DELTA = 0.2;
const ROTATION_STEP = 90;
const FULL_ROTATION = 360;
const PREVIEW_CANVAS_SIZE = 64;

export function ImageCropperDialog({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
  aspectRatio = 1,
  cropShape = "round",
  outputSize = DEFAULT_AVATAR_SIZE,
  showGrid = false,
  title = "Adjust profile photo",
  description = "Drag to position and use the slider to zoom.",
  zoomLabel = "Zoom",
  rotateLabel = "Rotate",
  resetLabel = "Reset",
  cancelLabel = "Cancel",
  applyLabel = "Save photo",
  previewLabel = "Preview",
  isPending = false,
}: ImageCropperDialogProps) {
  const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState<number>(MIN_ZOOM);
  const [rotation, setRotation] = React.useState<number>(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);

  const previewCanvasRef = React.useRef<HTMLCanvasElement>(null);

  const resetState = React.useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setRotation(0);
    setCroppedAreaPixels(null);
    setIsProcessing(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const handleCropComplete = React.useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  React.useEffect(() => {
    if (!imageSrc || !croppedAreaPixels || !previewCanvasRef.current) return;
    let isMounted = true;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!isMounted) return;
      const rad = (rotation * Math.PI) / 180;
      const bBoxW = Math.abs(Math.cos(rad) * img.width) + Math.abs(Math.sin(rad) * img.height);
      const bBoxH = Math.abs(Math.sin(rad) * img.width) + Math.abs(Math.cos(rad) * img.height);

      const rotCanvas = document.createElement("canvas");
      rotCanvas.width = bBoxW;
      rotCanvas.height = bBoxH;
      const rotCtx = rotCanvas.getContext("2d");
      if (!rotCtx) return;

      rotCtx.translate(bBoxW / 2, bBoxH / 2);
      rotCtx.rotate(rad);
      rotCtx.translate(-img.width / 2, -img.height / 2);
      rotCtx.drawImage(img, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        rotCanvas,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    };
    img.src = imageSrc;

    return () => {
      isMounted = false;
    };
  }, [imageSrc, croppedAreaPixels, rotation]);

  const busy = isPending || isProcessing;

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_DELTA).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(MIN_ZOOM, Number((prev - ZOOM_DELTA).toFixed(2))));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + ROTATION_STEP) % FULL_ROTATION);
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setRotation(0);
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, {
        outputWidth: outputSize,
        outputHeight: outputSize,
      });
      await onCropComplete(croppedFile);
    } finally {
      setIsProcessing(false);
    }
  };

  const isPristine = zoom === MIN_ZOOM && rotation === 0 && crop.x === 0 && crop.y === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="gap-1 pb-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black/90 select-none touch-none sm:h-80">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspectRatio}
                cropShape={cropShape}
                showGrid={showGrid}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={handleCropComplete}
                classes={{
                  containerClassName: "rounded-lg",
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-2 px-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleZoomOut}
              disabled={busy || zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Slider
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={[zoom]}
              onValueChange={(val) => {
                const next = Array.isArray(val) ? val[0] : val;
                if (typeof next === "number") setZoom(next);
              }}
              aria-label={zoomLabel}
              className="flex-1"
              disabled={busy}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleZoomIn}
              disabled={busy || zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "relative shrink-0 overflow-hidden border border-border bg-muted shadow-xs",
                  cropShape === "round" ? "rounded-full" : "rounded-md",
                )}
                style={{ width: PREVIEW_CANVAS_SIZE, height: PREVIEW_CANVAS_SIZE }}
              >
                <canvas
                  ref={previewCanvasRef}
                  width={PREVIEW_CANVAS_SIZE}
                  height={PREVIEW_CANVAS_SIZE}
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0 text-xs">
                <p className="font-medium text-foreground">{previewLabel}</p>
                <p className="text-muted-foreground">
                  {outputSize}×{outputSize}px • WebP
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRotate}
                disabled={busy}
              >
                <RotateCw className="size-3.5" />
                <span className="hidden sm:inline">{rotateLabel}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={busy || isPristine}
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">{resetLabel}</span>
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy || !imageSrc}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
