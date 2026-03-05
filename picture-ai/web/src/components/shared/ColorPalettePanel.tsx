import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Spin, message } from 'antd';
import { LoadingOutlined, ReloadOutlined, CheckOutlined } from '@ant-design/icons';

interface ColorInfo {
    rgb: number[];
    hex: string;
    ratio: number;
}

interface ColorPalettePanelProps {
    open: boolean;
    imageBase64: string;
    onClose: () => void;
    onApply: (resultBase64: string) => void;
}

export const ColorPalettePanel: React.FC<ColorPalettePanelProps> = ({
    open,
    imageBase64,
    onClose,
    onApply,
}) => {
    const [palette, setPalette] = useState<ColorInfo[]>([]);
    const [targetColors, setTargetColors] = useState<{ [key: number]: string }>({});
    const [loading, setLoading] = useState(false);
    const [previewBase64, setPreviewBase64] = useState<string>('');
    const [applying, setApplying] = useState(false);

    // 提取主色调
    const extractPalette = useCallback(async () => {
        if (!imageBase64) return;
        setLoading(true);
        try {
            // 将 base64 转为 Blob
            const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
            const byteString = atob(base64Data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: 'image/png' });

            const formData = new FormData();
            formData.append('file', blob, 'image.png');
            formData.append('n_colors', '5');

            const res = await fetch('/api/color/extract-palette', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('提取失败');

            const data = await res.json();
            setPalette(data.palette);
            setTargetColors({});
            setPreviewBase64('');
        } catch (e: any) {
            message.error(e.message || '主色提取失败');
        } finally {
            setLoading(false);
        }
    }, [imageBase64]);

    // 组件打开时自动提取
    React.useEffect(() => {
        if (open && imageBase64 && palette.length === 0) {
            extractPalette();
        }
    }, [open, imageBase64, palette.length, extractPalette]);

    // 预览换色效果
    const previewColorMapping = useCallback(async () => {
        if (Object.keys(targetColors).length === 0) return;
        setApplying(true);
        try {
            const sourceColors = palette
                .filter((_, i) => targetColors[i])
                .map(c => c.rgb);
            const targets = palette
                .filter((_, i) => targetColors[i])
                .map((_, i) => {
                    const hex = targetColors[i];
                    return [
                        parseInt(hex.slice(1, 3), 16),
                        parseInt(hex.slice(3, 5), 16),
                        parseInt(hex.slice(5, 7), 16),
                    ];
                });

            if (sourceColors.length === 0) return;

            const res = await fetch('/api/color/apply-mapping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: imageBase64,
                    source_colors: sourceColors,
                    target_colors: targets,
                    tolerance: 40,
                    preserve_luminance: true,
                }),
            });

            if (!res.ok) throw new Error('换色失败');

            const data = await res.json();
            setPreviewBase64(data.result_base64);
        } catch (e: any) {
            message.error(e.message || '换色预览失败');
        } finally {
            setApplying(false);
        }
    }, [imageBase64, palette, targetColors]);

    // 确认应用
    const handleConfirm = () => {
        if (previewBase64) {
            onApply(previewBase64);
            onClose();
        }
    };

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-lg bg-[#181920] border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">🎨 实时换色</h3>
                        <p className="text-white/40 text-sm">点击颜色块选择新颜色</p>
                    </div>
                    <button
                        onClick={extractPalette}
                        disabled={loading}
                        className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <ReloadOutlined spin={loading} />
                    </button>
                </div>

                {/* Color Palette */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* 颜色列表 */}
                        <div className="grid grid-cols-5 gap-3">
                            {palette.map((color, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-2">
                                    {/* 源颜色 */}
                                    <div
                                        className="w-12 h-12 rounded-xl border-2 border-white/20 shadow-lg"
                                        style={{ backgroundColor: color.hex }}
                                        title={`${color.hex} (${Math.round(color.ratio * 100)}%)`}
                                    />
                                    <span className="text-[10px] text-white/40">
                                        {Math.round(color.ratio * 100)}%
                                    </span>
                                    {/* 目标颜色选择器 */}
                                    <div className="relative">
                                        <input
                                            type="color"
                                            value={targetColors[idx] || color.hex}
                                            onChange={(e) => setTargetColors(prev => ({
                                                ...prev,
                                                [idx]: e.target.value
                                            }))}
                                            className="w-10 h-10 rounded-lg cursor-pointer border-2 border-dashed border-white/20 hover:border-cyan-400/50 transition-colors"
                                            style={{ backgroundColor: targetColors[idx] || 'transparent' }}
                                        />
                                        {targetColors[idx] && targetColors[idx] !== color.hex && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center">
                                                <CheckOutlined className="text-[8px] text-white" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 预览按钮 */}
                        <button
                            onClick={previewColorMapping}
                            disabled={applying || Object.keys(targetColors).length === 0}
                            className="w-full py-3 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                            {applying && <LoadingOutlined />}
                            预览效果
                        </button>

                        {/* 预览图 */}
                        {previewBase64 && (
                            <div className="relative">
                                <img
                                    src={`data:image/png;base64,${previewBase64}`}
                                    alt="Preview"
                                    className="w-full rounded-xl border border-white/10"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!previewBase64}
                        className="px-6 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-cyan-500/20 hover:from-teal-400 hover:to-cyan-400 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        应用换色
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
