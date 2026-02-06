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
            <div className="max-w-[860px] mx-auto h-full px-4 box-border relative">
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

                {loading && (
                    <div className="w-full flex justify-center py-12">
                        <div className="relative group">
                            {/* Glow Effect */}
                            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse" />

                            {/* Main Container */}
                            <div className="relative flex flex-col items-center gap-4 p-8 rounded-3xl bg-[#181920]/80 backdrop-blur-xl border border-white/10 shadow-2xl">
                                {/* Animated Rings */}
                                <div className="relative w-16 h-16">
                                    {/* Outer Ring */}
                                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-cyan-500/50 animate-[spin_1.5s_linear_infinite]" />
                                    {/* Inner Ring */}
                                    <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-teal-400 border-l-teal-400/50 animate-[spin_2s_linear_infinite_reverse]" />
                                    {/* Center Dot */}
                                    <div className="absolute inset-6 bg-gradient-to-tr from-cyan-400 to-teal-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                                </div>

                                {/* Text with Typing Effect */}
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-cyan-400 font-medium tracking-widest text-xs uppercase">AI Processing</span>
                                    <span className="text-white/40 text-[10px] animate-pulse">正在绘制您的创意...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={endRef} />
            </div>
        </div>
    );
};
