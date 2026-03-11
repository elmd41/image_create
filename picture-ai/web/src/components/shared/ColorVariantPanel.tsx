import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseOutlined, CheckOutlined } from '@ant-design/icons';

interface ColorVariantPanelProps {
    open: boolean;
    imageBase64: string;
    onClose: () => void;
    onConfirm: (config: { originalImageBase64: string; count: number; colorScheme: string[] | null }) => void;
}

// 预设色系选项
const COLOR_SCHEMES = [
    { value: '红色', label: '红色', color: '#ef4444' },
    { value: '橙色', label: '橙色', color: '#f97316' },
    { value: '黄色', label: '黄色', color: '#eab308' },
    { value: '绿色', label: '绿色', color: '#22c55e' },
    { value: '青色', label: '青色', color: '#06b6d4' },
    { value: '蓝色', label: '蓝色', color: '#3b82f6' },
    { value: '紫色', label: '紫色', color: '#8b5cf6' },
    { value: '粉色', label: '粉色', color: '#ec4899' },
    { value: '棕色', label: '棕色', color: '#a16207' },
    { value: '灰色', label: '灰色', color: '#6b7280' },
];

// 数量选项
const COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

export const ColorVariantPanel: React.FC<ColorVariantPanelProps> = ({
    open,
    imageBase64,
    onClose,
    onConfirm,
}) => {
    const [count, setCount] = useState<number>(2);
    const [selectedColors, setSelectedColors] = useState<string[]>([]);

    // 切换色系选择
    const toggleColorScheme = useCallback((color: string) => {
        setSelectedColors(prev => {
            if (prev.includes(color)) {
                return prev.filter(c => c !== color);
            }
            return [...prev, color];
        });
    }, []);

    // 应用套色
    const handleApply = useCallback(() => {
        if (!imageBase64) return;
        const config = {
            originalImageBase64: imageBase64,
            count,
            colorScheme: selectedColors.length > 0 ? selectedColors : null,
        };
        
        // 关闭窗口，通知父组件开始生成
        onClose();
        onConfirm(config);
    }, [imageBase64, count, selectedColors, onClose, onConfirm]);

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
                        <h3 className="text-xl font-bold text-white mb-1">🎨 套色</h3>
                        <p className="text-white/40 text-sm">选择套色数量</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <CloseOutlined />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* 数量选择 */}
                    <div>
                        <label className="block text-sm text-white/60 mb-3">生成数量</label>
                        <div className="flex flex-wrap gap-2">
                            {COUNT_OPTIONS.map(num => (
                                <button
                                    key={num}
                                    onClick={() => setCount(num)}
                                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                                        count === num
                                            ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                                            : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10'
                                    }`}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 色系选择 */}
                    <div>
                        <label className="block text-sm text-white/60 mb-3">
                            色系选择 <span className="text-white/30">（可多选，不选则全色系随机）</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {COLOR_SCHEMES.map(scheme => {
                                const isSelected = selectedColors.includes(scheme.value);
                                return (
                                    <button
                                        key={scheme.value}
                                        onClick={() => toggleColorScheme(scheme.value)}
                                        className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                                            isSelected
                                                ? 'bg-white/15 border-2 border-cyan-400/50 text-white'
                                                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        <span
                                            className="w-4 h-4 rounded-full border border-white/20"
                                            style={{ backgroundColor: scheme.color }}
                                        />
                                        <span>{scheme.label}</span>
                                        {isSelected && (
                                            <CheckOutlined className="text-cyan-400 text-xs" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 提示信息 */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <p className="text-xs text-white/50 leading-relaxed">
                            💡 套色功能会保持图片的内容、图案、构图完全一致，仅改变配色方案。
                            {selectedColors.length > 0 
                                ? `当前选择了 ${selectedColors.join('、')} 色系，将在这些色系内生成 ${count} 张变体。`
                                : `将随机生成 ${count} 张不同配色的变体图。`
                            }
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-6 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-cyan-500/20 hover:from-teal-400 hover:to-cyan-400 active:scale-95 transition-all flex items-center gap-2"
                    >
                        应用套色
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
