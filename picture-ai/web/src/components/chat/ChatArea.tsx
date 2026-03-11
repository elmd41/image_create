import React, { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import { EmptyState } from './EmptyState';
import { Message } from '../../types';

interface ChatAreaProps {
    messages: Message[];
    loading: boolean;
    onPreview: (src: string) => void;
    onUseAsReference: (url: string) => void;
    onRegenerate: (message: Message) => void;
    onDownload: (src: string) => void;
    onImageLoad?: () => void;
    onEditLayer?: (imageUrl: string) => void;
    onColorEdit?: (imageUrl: string) => void;
    onRegenerateColorVariant?: (config: NonNullable<Message['colorVariantConfig']>) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
    messages,
    loading,
    onPreview,
    onUseAsReference,
    onRegenerate,
    onDownload,
    onImageLoad,
    onEditLayer,
    onColorEdit,
    onRegenerateColorVariant
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, loading]);

    const handleImageLoad = () => {
        onImageLoad?.();
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 空状态：绝对定位居中
    if (messages.length === 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center">
                <EmptyState />
            </div>
        );
    }

    // 有消息：正常滚动列表
    return (
        <div className="absolute inset-0 overflow-y-auto scroll-smooth">
            <div className="max-w-[860px] mx-auto px-4 pt-6 pb-32 box-border">
                <div className="flex flex-col pb-4">
                    {messages.map((msg, index) => (
                        <MessageItem
                            key={index}
                            message={msg}
                            onPreview={onPreview}
                            onUseAsReference={onUseAsReference}
                            onRegenerate={onRegenerate}
                            onDownload={onDownload}
                            onImageLoad={handleImageLoad}
                            onEditLayer={onEditLayer}
                            onColorEdit={onColorEdit}
                            onRegenerateColorVariant={onRegenerateColorVariant}
                        />
                    ))}
                </div>

                {/* 处理中提示 */}
                {loading && (
                    <div className="w-full flex justify-center py-2">
                        <span className="text-gray-400 text-xs tracking-wider animate-pulse">处理中......</span>
                    </div>
                )}

                <div ref={endRef} />
            </div>
        </div>
    );
};
