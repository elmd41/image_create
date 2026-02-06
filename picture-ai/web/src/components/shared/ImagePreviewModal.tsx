import React from 'react';
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
                        <Tooltip content="复制">
                            <Button isIconOnly variant="flat" className="bg-white/10 text-white backdrop-blur-md" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
                                <CopyOutlined />
                            </Button>
                        </Tooltip>
                        <Tooltip content="下载">
                            <Button isIconOnly variant="flat" className="bg-white/10 text-white backdrop-blur-md" onClick={(e) => { e.stopPropagation(); onDownload(); }}>
                                <DownloadOutlined />
                            </Button>
                        </Tooltip>
                        <Tooltip content="关闭">
                            <Button isIconOnly variant="flat" className="bg-white/10 text-white backdrop-blur-md" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                                <CloseOutlined />
                            </Button>
                        </Tooltip>
                    </div>

                    {/* Image */}
                    <div className="relative bg-black/80 rounded-2xl p-4 shadow-2xl overflow-hidden max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        <img src={src} alt="preview" className="w-auto h-auto max-w-full max-h-[85vh] object-contain rounded-lg" />
                    </div>
                </div>
            </ModalContent>
        </Modal>
    );
};
