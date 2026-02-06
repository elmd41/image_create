import React from 'react';
import { createPortal } from 'react-dom';

interface DownloadDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    format: string;
    setFormat: (format: any) => void;
}

const FORMAT_OPTIONS = [
    { value: 'png', label: 'PNG', desc: '无损压缩，支持透明' },
    { value: 'jpg', label: 'JPG', desc: '文件较小，不仅支持透明' },
    { value: 'webp', label: 'WEBP', desc: '现代格式，高压缩率' },
    { value: 'bmp', label: 'BMP', desc: '无压缩位图，文件较大' },
    { value: 'tiff', label: 'TIFF', desc: '高质量打印，支持分层' },
];

export const DownloadDialog: React.FC<DownloadDialogProps> = ({
    open,
    onClose,
    onConfirm,
    format,
    setFormat
}) => {
    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Dialog Content */}
            <div className="relative w-full max-w-sm bg-[#181920] border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-1">下载图片</h3>
                    <p className="text-white/40 text-sm">选择保存的文件格式</p>
                </div>

                {/* Body - Format Selection */}
                <div className="flex flex-col gap-2 mb-8">
                    {FORMAT_OPTIONS.map((opt) => (
                        <div
                            key={opt.value}
                            onClick={() => setFormat(opt.value)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-200 ${format === opt.value
                                ? 'bg-cyan-500/10 border-cyan-500/50'
                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                }`}
                        >
                            <div className="flex flex-col">
                                <span className={`text-sm font-semibold ${format === opt.value ? 'text-cyan-400' : 'text-white/80'}`}>
                                    {opt.label}
                                </span>
                                <span className="text-[10px] text-white/30">{opt.desc}</span>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${format === opt.value ? 'border-cyan-500' : 'border-white/20'
                                }`}>
                                {format === opt.value && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-cyan-500/20 hover:from-teal-400 hover:to-cyan-400 active:scale-95 transition-all"
                    >
                        确认下载
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
