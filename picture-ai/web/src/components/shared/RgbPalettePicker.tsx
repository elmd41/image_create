import React, { useRef, useState, useCallback, useEffect } from 'react';

const hsvToRgb = (h: number, s: number, v: number) => {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h >= 0 && h < 60) { r1 = c; g1 = x; }
    else if (h >= 60 && h < 120) { r1 = x; g1 = c; }
    else if (h >= 120 && h < 180) { g1 = c; b1 = x; }
    else if (h >= 180 && h < 240) { g1 = x; b1 = c; }
    else if (h >= 240 && h < 300) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255)
    };
};

const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

interface RgbPalettePickerProps {
    value?: string;
    onChange: (hex: string) => void;
    onPick?: () => void;
}

export const RgbPalettePicker: React.FC<RgbPalettePickerProps> = ({ value, onChange, onPick }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hoverHex, setHoverHex] = useState<string>(value || '#FFFFFF');
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
    const width = 240;
    const height = 160;

    const getHexAt = useCallback((x: number, y: number) => {
        const h = (x / (width - 1)) * 360;
        const s = 1 - y / (height - 1);
        const { r, g, b } = hsvToRgb(h, Math.max(0, Math.min(1, s)), 1);
        return rgbToHex(r, g, b);
    }, [width, height]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const image = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const h = (x / (width - 1)) * 360;
                const s = 1 - y / (height - 1);
                const { r, g, b } = hsvToRgb(h, Math.max(0, Math.min(1, s)), 1);
                const idx = (y * width + x) * 4;
                image.data[idx] = r;
                image.data[idx + 1] = g;
                image.data[idx + 2] = b;
                image.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
    }, [width, height]);

    useEffect(() => {
        if (value) setHoverHex(value);
    }, [value]);

    const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(width - 1, Math.round(e.clientX - rect.left)));
        const y = Math.max(0, Math.min(height - 1, Math.round(e.clientY - rect.top)));
        setCursorPos({ x, y });
        setHoverHex(getHexAt(x, y));
    }, [getHexAt, width, height]);

    const handlePick = useCallback(() => {
        onChange(hoverHex);
        onPick?.();
    }, [hoverHex, onChange, onPick]);

    return (
        <div className="w-[260px]">
            <div className="flex items-center gap-2 mb-2">
                <div style={{ background: hoverHex }} className="w-9 h-9 rounded-lg border border-black/10 transition-colors" />
                <div className="font-mono text-xs text-default-900">{hoverHex}</div>
            </div>
            <div className="relative w-[240px] h-[160px] rounded-lg overflow-hidden border border-black/10">
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    className="block w-[240px] h-[160px] cursor-crosshair"
                    onMouseMove={handleMove}
                    onMouseLeave={() => setCursorPos(null)}
                    onClick={handlePick}
                />
                {cursorPos && (
                    <div
                        className="absolute w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
                        style={{ left: cursorPos.x - 6, top: cursorPos.y - 6 }}
                    />
                )}
            </div>
            <div className="mt-2 text-xs text-default-500">移动鼠标预览，点击选择</div>
        </div>
    );
};
