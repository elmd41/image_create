import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { message } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface CropDialogProps {
    open: boolean;
    imageBase64: string;
    borderMaskBase64?: string;  // 边框 mask（锁定边框模式需要）
    onClose: () => void;
    onConfirm: (resultBase64: string) => void;
}

const DPI_OPTIONS = [
    { value: 72, label: '72 DPI', desc: '屏幕显示' },
    { value: 150, label: '150 DPI', desc: '标准打印' },
    { value: 300, label: '300 DPI', desc: '高质量打印' },
];

const MODE_OPTIONS = [
    { value: 'fill', label: '满铺裁切', desc: '中心对齐，可能裁掉边缘', icon: '⬛' },
    { value: 'fit', label: '等比缩放', desc: '保持完整，可能留白', icon: '🔲' },
    { value: 'preserve_border', label: '🔒 锁定边框', desc: '边框保持完整，内芯拉伸', icon: '🖼️' },
];

export const CropDialog: React.FC<CropDialogProps> = ({
    open,
    imageBase64,
    borderMaskBase64,
    onClose,
    onConfirm,
}) => {
    const [widthCm, setWidthCm] = useState<number>(160);
    const [heightCm, setHeightCm] = useState<number>(230);
    const [dpi, setDpi] = useState<number>(150);
    const [mode, setMode] = useState<string>('fill');
    const [loading, setLoading] = useState(false);
    const [previewBase64, setPreviewBase64] = useState<string>('');
    const [resultInfo, setResultInfo] = useState<{ width: number; height: number; scale: number } | null>(null);

    // 计算目标像素尺寸
    const targetWidthPx = Math.round(widthCm * dpi / 2.54);
    const targetHeightPx = Math.round(heightCm * dpi / 2.54);

    // 预览裁切
    const handlePreview = useCallback(async () => {
        if (!imageBase64) return;
        setLoading(true);
        try {
            const body: any = {
                image_base64: imageBase64,
                target_width_cm: widthCm,
                target_height_cm: heightCm,
                dpi,
                mode,
            };

            if (mode === 'preserve_border' && borderMaskBase64) {
                body.border_mask_base64 = borderMaskBase64;
            }

            const apiUrl = import.meta.env.PROD ? '' : 'http://127.0.0.1:8000';
            const res = await fetch(`${apiUrl}/api/crop/to-size`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '裁切失败');
            }

            const data = await res.json();
            setPreviewBase64(data.result_base64);
            setResultInfo({
                width: data.actual_width_px,
                height: data.actual_height_px,
                scale: data.scale_ratio,
            });
        } catch (e: any) {
            message.error(e.message || '裁切预览失败');
        } finally {
            setLoading(false);
        }
    }, [imageBase64, borderMaskBase64, widthCm, heightCm, dpi, mode]);

    // 确认
    const handleConfirm = () => {
        if (previewBase64) {
            onConfirm(previewBase64);
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

            {/* Dialog */}
            <div className="relative w-full max-w-md bg-[#181920] border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-1">📐 生产稿裁切</h3>
                    <p className="text-white/40 text-sm">根据目标尺寸智能裁切</p>
                </div>

                {/* 尺寸输入 */}
                <div className="space-y-4 mb-6">
                    <div className="flex items-center gap-3">
                        <label className="text-white/60 text-sm w-20">目标尺寸</label>
                        <div className="flex items-center gap-2 flex-1">
                            <input
                                type="number"
                                value={widthCm}
                                onChange={(e) => setWidthCm(Number(e.target.value))}
                                className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50"
                            />
                            <span className="text-white/40">×</span>
                            <input
                                type="number"
                                value={heightCm}
                                onChange={(e) => setHeightCm(Number(e.target.value))}
                                className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50"
                            />
                            <span className="text-white/40 text-sm">cm</span>
                        </div>
                    </div>

                    {/* DPI 选择 */}
                    <div className="flex items-center gap-3">
                        <label className="text-white/60 text-sm w-20">输出 DPI</label>
                        <div className="flex gap-2 flex-1">
                            {DPI_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setDpi(opt.value)}
                                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${dpi === opt.value
                                        ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                                        : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 模式选择 */}
                    <div className="space-y-2">
                        <label className="text-white/60 text-sm">裁切模式</label>
                        <div className="flex flex-col gap-2">
                            {MODE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setMode(opt.value)}
                                    disabled={opt.value === 'preserve_border' && !borderMaskBase64}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${mode === opt.value
                                        ? 'bg-cyan-500/10 border-cyan-500/50'
                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                        } ${opt.value === 'preserve_border' && !borderMaskBase64 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span className="text-lg">{opt.icon}</span>
                                    <div className="flex-1 text-left">
                                        <div className={`text-sm font-medium ${mode === opt.value ? 'text-cyan-400' : 'text-white/80'}`}>
                                            {opt.label}
                                        </div>
                                        <div className="text-[10px] text-white/40">{opt.desc}</div>
                                    </div>
                                    {opt.value === 'preserve_border' && !borderMaskBase64 && (
                                        <span className="text-[10px] text-amber-400">需要先分割</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 输出信息 */}
                    <div className="p-3 bg-white/5 rounded-xl text-xs text-white/40">
                        输出尺寸：{targetWidthPx} × {targetHeightPx} px
                        {resultInfo && (
                            <span className="ml-2 text-cyan-400">
                                (缩放 {Math.round(resultInfo.scale * 100)}%)
                            </span>
                        )}
                    </div>
                </div>

                {/* 预览按钮 */}
                <button
                    onClick={handlePreview}
                    disabled={loading}
                    className="w-full py-3 mb-4 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                    {loading && <LoadingOutlined />}
                    预览裁切效果
                </button>

                {/* 预览图 */}
                {previewBase64 && (
                    <div className="mb-4 relative">
                        <img
                            src={`data:image/png;base64,${previewBase64}`}
                            alt="Preview"
                            className="w-full max-h-48 object-contain rounded-xl border border-white/10"
                        />
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
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
                        确认裁切
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
