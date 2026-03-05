import React, { useState } from 'react';
import { Button, Tooltip } from "@heroui/react";
import { LinkOutlined, ReloadOutlined, DownloadOutlined, BgColorsOutlined, ScissorOutlined, FormatPainterOutlined, CopyOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { Message } from '../../types';
import { PARAM_LABELS, DEFAULT_SCENE_VALUE } from '../../constants';

interface MessageItemProps {
    message: Message;
    onPreview: (src: string) => void;
    onUseAsReference: (url: string) => void;
    onRegenerate: (message: Message) => void;
    onDownload: (src: string) => void;
    onImageLoad: () => void;
    onEditLayer?: (imageUrl: string) => void;
    onColorEdit?: (imageUrl: string) => void;
    onCropEdit?: (imageUrl: string) => void;
}

const copyImageToClipboard = async (src: string) => {
    try {
        const res = await fetch(src);
        const blob = await res.blob();
        const pngBlob = blob.type === 'image/png' ? blob : await new Promise<Blob>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d')!.drawImage(img, 0, 0);
                canvas.toBlob((b) => resolve(b!), 'image/png');
            };
            img.src = URL.createObjectURL(blob);
        });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        message.success('已复制图片');
    } catch {
        message.error('复制失败');
    }
};

export const MessageItem: React.FC<MessageItemProps> = ({
    message: msg,
    onPreview,
    onUseAsReference,
    onRegenerate,
    onDownload,
    onImageLoad,
    onEditLayer,
    onColorEdit,
    onCropEdit
}) => {
    const { type, content, text, isUser, source, params } = msg;
    const [hovered, setHovered] = useState(false);
    const resolvedSource = source || (isUser ? 'user' : 'generate');
    const canRegenerate = !isUser && resolvedSource === 'generate';

    // 过滤出有值的参数（排除场景默认值）
    const activeParams = params
        ? Object.entries(params).filter(([k, v]) => v && !(k === 'scene' && v === DEFAULT_SCENE_VALUE))
        : [];

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4 group/msg animate-slide-up`}>
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`} style={{ maxWidth: '55%' }}>

                {/* Text Message */}
                {type === 'text' && (
                    <div className={`px-4 py-2.5 rounded-2xl border text-sm leading-relaxed shadow-sm ${isUser
                        ? 'bg-[#2a2b3d]/80 border-cyan-500/20 text-white rounded-tr-sm'
                        : 'bg-white/5 border-white/10 text-white/90 rounded-tl-sm'
                        }`}>
                        <div className="whitespace-pre-wrap">{content}</div>
                        {isUser && activeParams.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/10">
                                {activeParams.map(([k, v]) => (
                                    <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/60">
                                        <span className="text-white/40">{PARAM_LABELS[k] || k}</span>
                                        <span className="text-cyan-300/80">{v}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Image / Mixed Message */}
                {(type === 'image' || type === 'mixed') && (
                    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
                        <div
                            className="relative group inline-block"
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                        >
                            <div className="relative rounded-xl overflow-hidden shadow-lg">
                                <img
                                    src={content}
                                    alt="content"
                                    className="max-h-[220px] max-w-[240px] object-contain bg-[#0f1016] cursor-pointer"
                                    loading="eager"
                                    onClick={() => onPreview(content)}
                                    onLoad={onImageLoad}
                                />
                            </div>

                            {/* Action Bar - 右下角，不超出图片 */}
                            <div className={`absolute bottom-2 right-2 flex gap-0.5 px-1 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 transition-all duration-200 z-20 ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                {isUser ? (
                                    <>
                                        <Tooltip content="引用到对话" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                            <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-white/70 hover:text-white rounded" onPress={() => onUseAsReference(content)}>
                                                <LinkOutlined style={{ fontSize: 12 }} />
                                            </Button>
                                        </Tooltip>
                                        <Tooltip content="复制图片" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                            <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-white/70 hover:text-white rounded" onPress={() => copyImageToClipboard(content)}>
                                                <CopyOutlined style={{ fontSize: 12 }} />
                                            </Button>
                                        </Tooltip>
                                        <Tooltip content="下载" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                            <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-white/70 hover:text-white rounded" onPress={() => onDownload(content)}>
                                                <DownloadOutlined style={{ fontSize: 12 }} />
                                            </Button>
                                        </Tooltip>
                                    </>
                                ) : (
                                    <>
                                        <Tooltip content="引用到对话" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                            <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-white/70 hover:text-white rounded" onPress={() => onUseAsReference(content)}>
                                                <LinkOutlined style={{ fontSize: 12 }} />
                                            </Button>
                                        </Tooltip>
                                        {canRegenerate && (
                                            <Tooltip content="重新生成" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                                <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-white/70 hover:text-white rounded" onPress={() => onRegenerate(msg)}>
                                                    <ReloadOutlined style={{ fontSize: 12 }} />
                                                </Button>
                                            </Tooltip>
                                        )}
                                        <Tooltip content="下载" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                            <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-white/70 hover:text-white rounded" onPress={() => onDownload(content)}>
                                                <DownloadOutlined style={{ fontSize: 12 }} />
                                            </Button>
                                        </Tooltip>
                                        {onColorEdit && (
                                            <Tooltip content="换色" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                                <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-amber-400 hover:text-amber-300 rounded" onPress={() => onColorEdit(content)}>
                                                    <FormatPainterOutlined style={{ fontSize: 12 }} />
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {onCropEdit && (
                                            <Tooltip content="裁切" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                                <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-emerald-400 hover:text-emerald-300 rounded" onPress={() => onCropEdit(content)}>
                                                    <ScissorOutlined style={{ fontSize: 12 }} />
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {onEditLayer && (
                                            <Tooltip content="分层编辑" placement="top" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                                <Button isIconOnly size="sm" variant="light" className="w-6 h-6 min-w-6 text-cyan-400 hover:text-cyan-300 rounded" onPress={() => onEditLayer(content)}>
                                                    <BgColorsOutlined style={{ fontSize: 12 }} />
                                                </Button>
                                            </Tooltip>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {type === 'mixed' && text && (
                            <div className={`px-4 py-2 rounded-xl text-sm max-w-full ${isUser
                                ? 'bg-[#2a2b3d]/80 border border-cyan-500/20 text-white rounded-tr-sm'
                                : 'bg-white/5 border border-white/10 text-white/80'
                                }`}>
                                {text}
                                {isUser && activeParams.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/10">
                                        {activeParams.map(([k, v]) => (
                                            <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/60">
                                                <span className="text-white/40">{PARAM_LABELS[k] || k}</span>
                                                <span className="text-cyan-300/80">{v}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* 纯图片消息（无文字）也显示参数 */}
                        {type === 'image' && isUser && activeParams.length > 0 && (
                            <div className="px-3 py-1.5 rounded-xl bg-[#2a2b3d]/80 border border-cyan-500/20">
                                <div className="flex flex-wrap gap-1.5">
                                    {activeParams.map(([k, v]) => (
                                        <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 text-[11px] text-white/60">
                                            <span className="text-white/40">{PARAM_LABELS[k] || k}</span>
                                            <span className="text-cyan-300/80">{v}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

