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
    onCropEdit?: (imageUrl: string) => void;
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
    onCropEdit
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, loading]);

    const handleImageLoad = () => {
        onImageLoad?.();
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="flex-1 overflow-y-auto w-full p-6 scroll-smooth">
            {/* pb-40 确保内容不会被底部输入框遮挡 */}
            <div className="max-w-[860px] mx-auto h-full px-4 box-border relative pb-44">
                {messages.length === 0 ? (
                    <EmptyState />
                ) : (
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
                                onCropEdit={onCropEdit}
                            />
                        ))}
                    </div>
                )}

                {/* 处理中提示 - 在输入框边界上方显示小字 */}
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
