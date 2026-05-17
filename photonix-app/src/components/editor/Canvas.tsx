import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";

interface CanvasProps {
  imageSrc: string | null;
  showMaskOverlay: boolean;
  brushMode: "brush" | "erase" | "none";
  brushSize: number;
  /** Existing mask data URL to restore when re-mounting */
  existingMaskDataUrl?: string;
  onMaskChange?: (maskDataUrl: string) => void;
}

export function Canvas({
  imageSrc,
  showMaskOverlay,
  brushMode,
  brushSize,
  existingMaskDataUrl,
  onMaskChange,
}: CanvasProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });

  // Restore existing mask when component mounts or existingMaskDataUrl changes
  useEffect(() => {
    if (!existingMaskDataUrl || !maskCanvasRef.current || naturalSize.w === 0) return;
    const ctx = maskCanvasRef.current.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, maskCanvasRef.current!.width, maskCanvasRef.current!.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = existingMaskDataUrl;
  }, [existingMaskDataUrl, naturalSize]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(10, z * delta)));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Pan: middle mouse or alt+left
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
        e.preventDefault();
        return;
      }
      // Brush drawing
      if (e.button === 0 && brushMode !== "none" && maskCanvasRef.current) {
        setIsDrawing(true);
        drawOnMask(e.nativeEvent);
      }
    },
    [offset, brushMode, brushSize, zoom, naturalSize]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        return;
      }
      if (isDrawing && brushMode !== "none") {
        drawOnMask(e.nativeEvent);
      }
    },
    [isPanning, panStart, isDrawing, brushMode, brushSize, zoom, naturalSize]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    if (isDrawing) {
      setIsDrawing(false);
      if (maskCanvasRef.current && onMaskChange) {
        onMaskChange(maskCanvasRef.current.toDataURL("image/png"));
      }
    }
  }, [isDrawing, onMaskChange]);

  /**
   * Correct coordinate mapping:
   * The mask canvas has dimensions = natural image size.
   * The displayed <img> is scaled by CSS (object-contain + zoom transform).
   * We need to map screen coords → natural image coords.
   */
  function drawOnMask(e: MouseEvent) {
    const canvas = maskCanvasRef.current;
    const imgEl = imgRef.current;
    if (!canvas || !imgEl || naturalSize.w === 0) return;

    // Get the img element's bounding rect (includes CSS transforms via parent)
    const imgRect = imgEl.getBoundingClientRect();

    // Map screen position to 0..1 within the displayed image
    const relX = (e.clientX - imgRect.left) / imgRect.width;
    const relY = (e.clientY - imgRect.top) / imgRect.height;

    // Map to natural pixel coordinates
    const x = relX * naturalSize.w;
    const y = relY * naturalSize.h;

    // Scale brush size to natural coordinates
    const scaleFactor = naturalSize.w / imgRect.width;
    const naturalBrushSize = brushSize * scaleFactor;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.globalCompositeOperation =
      brushMode === "erase" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.arc(x, y, naturalBrushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
    ctx.fill();
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNaturalSize({ w, h });

    // Set mask canvas to exact natural image dimensions
    if (maskCanvasRef.current) {
      maskCanvasRef.current.width = w;
      maskCanvasRef.current.height = h;
    }
  }

  function handleClearMask() {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onMaskChange?.("");
  }

  function handleInvertMask() {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      const current = data[i] ?? 0;
      data[i] = current > 0 ? 0 : 128;
    }
    ctx.putImageData(imageData, 0, 0);
    onMaskChange?.(canvas.toDataURL("image/png"));
  }

  const handleFit = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      {/* Canvas controls */}
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        {brushMode !== "none" && (
          <>
            <button
              onClick={handleClearMask}
              className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] text-neutral-300 backdrop-blur hover:bg-neutral-700"
            >
              {t("editor.mask.clearMask")}
            </button>
            <button
              onClick={handleInvertMask}
              className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] text-neutral-300 backdrop-blur hover:bg-neutral-700"
            >
              {t("editor.canvas.invert")}
            </button>
          </>
        )}
        <button
          onClick={handleFit}
          className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] text-neutral-300 backdrop-blur hover:bg-neutral-700"
        >
          {t("editor.canvas.fit")}
        </button>
        <span className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] text-neutral-400 backdrop-blur">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden ${
          brushMode !== "none" ? "cursor-crosshair" : "cursor-grab"
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {imageSrc ? (
            <div className="relative inline-block">
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Editor canvas"
                className="max-h-[80vh] max-w-full object-contain select-none"
                draggable={false}
                onLoad={handleImageLoad}
              />
              {/* Mask overlay — always rendered to preserve state, visibility toggled */}
              <canvas
                ref={maskCanvasRef}
                className={`absolute inset-0 pointer-events-none transition-opacity ${
                  showMaskOverlay ? "opacity-60" : "opacity-0"
                }`}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          ) : (
            <div className="flex h-64 w-96 items-center justify-center rounded border border-dashed border-neutral-700 text-neutral-600">
              <span className="text-sm">{t("editor.canvas.noImage")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
