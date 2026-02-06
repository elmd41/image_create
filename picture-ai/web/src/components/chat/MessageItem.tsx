import React, { useState } from 'react';
import { Button, Tooltip } from "@heroui/react";
import { LinkOutlined, ReloadOutlined, DownloadOutlined, BgColorsOutlined, ScissorOutlined, FormatPainterOutlined } from '@ant-design/icons';
import { Message } from '../../types';

interface MessageItemProps {
    message: Message;
    onPreview: (src: string) => void;
    onUseAsReference: (url: string) => void;
    onRegenerate: (message: Message) => void;
    onDownload: (src: string) => void;
    onImageLoad: () => void;
    onEditLayer?: (imageUrl: string) => void;
    onColorEdit?: (imageUrl: string) => void;      // 换色
    onCropEdit?: (imageUrl: string) => void;       // 裁切
}

export const MessageItem: React.FC<MessageItemProps> = ({
    message,
    onPreview,
    onUseAsReference,
    onRegenerate,
    onDownload,
    onImageLoad,
    onEditLayer,
    onColorEdit,
    onCropEdit
}) => {
    const { type, content, text, isUser, source, params } = message;
    const [hovered, setHovered] = useState(false);
    const resolvedSource = source || (isUser ? 'user' : 'generate');
    const canRegenerate = !isUser && resolvedSource === 'generate';
    const hasBubbleParams = !!(params?.style || params?.ratio || params?.color || params?.scene);

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 group/msg animate-slide-up`}>
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>

                {/* Text Message */}
                {type === 'text' && (
                    <div className={`px-5 py-3 rounded-2xl border text-sm leading-relaxed shadow-sm backdrop-blur-sm ${isUser
                        ? 'bg-[#2a2b3d]/80 border-cyan-500/20 text-white rounded-tr-sm'
                        : 'bg-white/5 border-white/10 text-white/90 rounded-tl-sm'
                        }`}>
                        <div className="whitespace-pre-wrap">{content}</div>
                    </div>
                )}

                {/* Image / Mixed Message */}
                {(type === 'image' || type === 'mixed') && (
                    <div className="flex flex-col gap-3">
                        <div
                            className="relative group inline-block"
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                        >
                            {/* Art Frame Container */}
                            <div className="relative rounded-[20px] overflow-hidden shadow-2xl transition-transform duration-500 ease-[var(--ease-spring)] hover:scale-[1.01]">
                                {/* Inner Shadow Overlay (The "Inset" Feel) */}
                                <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_0_20px_rgba(0,0,0,0.5)] rounded-[20px]" />

                                <img
                                    src={content}
                                    alt="generated content"
                                    className="max-h-[500px] object-contain bg-[#0f1016]"
                                    loading="eager"
                                    onClick={() => onPreview(content)}
                                    onLoad={onImageLoad}
                                />
                            </div>

                            {/* Action Bar (Floating - Top Right) */}
                            <div className={`absolute top-3 right-3 flex gap-1.5 p-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 transition-all duration-300 ease-[var(--ease-spring)] z-20 ${hovered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
                                <Tooltip content="引用" delay={0} closeDelay={0}>
                                    <Button isIconOnly size="sm" variant="light" className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 rounded-lg" onPress={() => onUseAsReference(content)}>
                                        <LinkOutlined />
                                    </Button>
                                </Tooltip>

                                {canRegenerate && (
                                    <Tooltip content="重绘" delay={0} closeDelay={0}>
                                        <Button isIconOnly size="sm" variant="light" className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 rounded-lg" onPress={() => onRegenerate(message)}>
                                            <ReloadOutlined />
                                        </Button>
                                    </Tooltip>
                                )}

                                <Tooltip content="下载" delay={0} closeDelay={0}>
                                    <Button isIconOnly size="sm" variant="light" className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 rounded-lg" onPress={() => onDownload(content)}>
                                        <DownloadOutlined />
                                    </Button>
                                </Tooltip>

                                {/* 分隔符 */}
                                <div className="w-px h-6 bg-white/10 self-center mx-0.5" />

                                {/* 换色按钮 */}
                                {onColorEdit && !isUser && (
                                    <Tooltip content="换色" delay={0} closeDelay={0}>
                                        <Button isIconOnly size="sm" variant="light" className="w-8 h-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 rounded-lg" onPress={() => onColorEdit(content)}>
                                            <FormatPainterOutlined />
                                        </Button>
                                    </Tooltip>
                                )}

                                {/* 裁切按钮 */}
                                {onCropEdit && !isUser && (
                                    <Tooltip content="裁切" delay={0} closeDelay={0}>
                                        <Button isIconOnly size="sm" variant="light" className="w-8 h-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded-lg" onPress={() => onCropEdit(content)}>
                                            <ScissorOutlined />
                                        </Button>
                                    </Tooltip>
                                )}

                                {/* 分层编辑按钮 */}
                                {onEditLayer && !isUser && (
                                    <Tooltip content="分层编辑" delay={0} closeDelay={0}>
                                        <Button isIconOnly size="sm" variant="light" className="w-8 h-8 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20 rounded-lg" onPress={() => onEditLayer(content)}>
                                            <BgColorsOutlined />
                                        </Button>
                                    </Tooltip>
                                )}
                            </div>
                        </div>

                        {/* Mixed Text or Params */}
                        {isUser && hasBubbleParams && (
                            <div className="flex flex-wrap justify-end gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                                {params?.style && <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-white/60 font-mono tracking-wide">{params.style}</span>}
                                {params?.ratio && <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-white/60 font-mono tracking-wide">{params.ratio}</span>}
                                {params?.color && (
                                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-white/60 font-mono tracking-wide flex items-center gap-1">
                                        COLOR <span className="w-2 h-2 rounded-full" style={{ background: params.color }} />
                                    </span>
                                )}
                                {params?.scene && <span className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-white/60 font-mono tracking-wide">{params.scene}</span>}
                            </div>
                        )}

                        {type === 'mixed' && text && (
                            <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/80 text-sm">
                                {text}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

