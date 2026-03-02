import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, Button, Tooltip } from "@heroui/react";
import { CopyOutlined, DownloadOutlined, CloseOutlined } from '@ant-design/icons';

interface ImagePreviewModalProps {
    open: boolean;
    src: string;
    filename?: string;
    onClose: () => void;
    onCopy: () => void;
    onDownload: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
    open,
    src,
    onClose,
    onCopy,
    onDownload
}) => {
    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        if (!src || !open) {
            setNaturalSize(null);
            return;
        }
        const img = new Image();
        img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = src;
    }, [src, open]);

    // 计算显示尺寸：不超过原图大小，同时不超过视口 90%
    const getDisplayStyle = () => {
        if (!naturalSize) return {};
        const maxW = Math.min(naturalSize.w, window.innerWidth * 0.9);
        const maxH = Math.min(naturalSize.h, window.innerHeight * 0.85);
        return { maxWidth: maxW, maxHeight: maxH };
    };

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            size="full"
            backdrop="blur"
            classNames={{
                base: "bg-transparent shadow-none",
                closeButton: "hidden" // Custom close button used
            }}
        >
            <ModalContent>
                <div className="relative w-full h-full flex items-center justify-center p-4" onClick={onClose}>
                    {/* Toolbar */}
                    <div className="absolute top-4 right-4 flex gap-2 z-50">
                        <Tooltip content="复制" classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <Button isIconOnly variant="flat" className="bg-black/60 text-white hover:bg-black/80 backdrop-blur-md border border-white/20" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
                                <CopyOutlined style={{ fontSize: 16 }} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="下载" classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <Button isIconOnly variant="flat" className="bg-black/60 text-white hover:bg-black/80 backdrop-blur-md border border-white/20" onClick={(e) => { e.stopPropagation(); onDownload(); }}>
                                <DownloadOutlined style={{ fontSize: 16 }} />
                            </Button>
                        </Tooltip>
                        <Tooltip content="关闭" classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <Button isIconOnly variant="flat" className="bg-black/60 text-white hover:bg-red-600/80 backdrop-blur-md border border-white/20" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                                <CloseOutlined style={{ fontSize: 16 }} />
                            </Button>
                        </Tooltip>
                    </div>

                    {/* Image - 自适应原图尺寸，不超过原图大小 */}
                    <div className="relative bg-black/80 rounded-2xl p-4 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <img 
                            src={src} 
                            alt="preview" 
                            className="w-auto h-auto object-contain rounded-lg"
                            style={getDisplayStyle()}
                        />
                    </div>
                </div>
            </ModalContent>
        </Modal>
    );
};
