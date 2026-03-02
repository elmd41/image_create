import React, { useRef } from 'react';
import { Button, Textarea, Tooltip, Spinner, Chip, Popover, PopoverTrigger, PopoverContent, Slider } from "@heroui/react";
import { Upload } from "antd";

import {
    PictureOutlined,
    LinkOutlined,
    DownloadOutlined,
    UndoOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import { EditModeState } from '../../types';
import { interactiveSwitchMask } from '../../services/api';

interface EditModeProps {
    editMode: EditModeState;
    setEditMode: React.Dispatch<React.SetStateAction<EditModeState>>;
    editPrompt: string;
    setEditPrompt: (val: string) => void;
    onEnterEditMode: (file: File, options?: { alpha_val?: number; white_threshold?: number; layer_count?: number }) => Promise<void>;
    onCanvasClick: (e: React.MouseEvent<HTMLDivElement>, canvas: HTMLDivElement) => void;
    onApplyEdit: () => Promise<void>;
    onUndo: () => void;
    onAddToReference: () => void;
    onDownload: (src: string, name?: string) => void;
}

const LAYER_LABELS: Record<string, string> = {
    field: '地场 (Field)',
    border: '边框 (Border)',
    rug: '整毯 (Rug)',
    selected_region: '选中区域',
};

export const EditMode: React.FC<EditModeProps> = ({
    editMode,
    setEditMode,
    editPrompt,
    setEditPrompt,
    onEnterEditMode,
    onCanvasClick,
    onApplyEdit,
    onUndo,
    onAddToReference,
    onDownload
}) => {
    const editCanvasRef = useRef<HTMLDivElement | null>(null);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (editCanvasRef.current) {
            onCanvasClick(e, editCanvasRef.current);
        }
    };

    const [segmentOptions, setSegmentOptions] = React.useState({
        alpha_val: 0.22,
        white_threshold: 245,
        layer_count: 2
    });

    return (
        <div className="flex-1 flex gap-5 p-5 overflow-hidden h-full">
            {/* Canvas Area */}
            <div
                ref={editCanvasRef}
                className="flex-1 flex flex-col items-center justify-center bg-black/20 rounded-xl relative overflow-hidden select-none border border-white/5"
                onClick={editMode.currentImageDataUrl ? handleClick : undefined}
            >
                {editMode.currentImageDataUrl ? (
                    <>
                        <div className="relative max-w-full max-h-full flex items-center justify-center">
                            {/* Close Button */}
                            <div
                                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center cursor-pointer z-20 text-xs hover:bg-white/20 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditMode(prev => ({ ...prev, currentImageDataUrl: null, active: false }));
                                }}
                            >
                                ✕
                            </div>

                            <img
                                src={editMode.currentImageDataUrl}
                                alt="edit target"
                                className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg shadow-lg"
                                draggable={false}
                            />

                            {editMode.maskDataUrl && (
                                <img
                                    src={editMode.maskDataUrl}
                                    alt="mask"
                                    className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none opacity-50 mix-blend-multiply filter hue-rotate-180 saturate-[3]"
                                    draggable={false}
                                />
                            )}

                            {editMode.editLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg z-10">
                                    <Spinner label="处理中..." />
                                </div>
                            )}
                        </div>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 text-white rounded-full text-sm backdrop-blur-sm pointer-events-none">
                            点击图片选择要编辑的区域
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full relative">
                        <Upload.Dragger
                            accept="image/*"
                            showUploadList={false}
                            beforeUpload={(file) => {
                                onEnterEditMode(file, segmentOptions);
                                return false;
                            }}
                            className="w-full h-full !border-none !bg-transparent flex items-center justify-center"
                        >
                            <div className="flex flex-col items-center justify-center p-10 cursor-pointer">
                                <PictureOutlined style={{ fontSize: '48px', color: 'rgba(255,255,255,0.2)', marginBottom: '16px' }} />
                                <div className="text-lg text-white/60 mb-2">点击或拖拽上传图片</div>
                                <div className="text-sm text-white/30">支持 PNG, JPG, WEBP</div>
                            </div>
                        </Upload.Dragger>

                        {/* Advanced Settings */}
                        <div className="absolute top-4 right-4 z-10" onClick={e => e.stopPropagation()}>
                            <Popover placement="bottom-end" showArrow offset={10}>
                                <PopoverTrigger>
                                    <Button isIconOnly variant="flat" className="bg-white/5 text-white/50 hover:bg-white/10 hover:text-white">
                                        <SettingOutlined />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="bg-[#181920] border border-white/10 p-4 rounded-xl w-64">
                                    <div className="flex flex-col gap-4">
                                        <div className="text-sm font-bold text-white/80">高级分割设置</div>

                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between text-xs text-white/60">
                                                <span>分层数量</span>
                                                <span>{segmentOptions.layer_count} 层</span>
                                            </div>
                                            <Slider
                                                size="sm"
                                                step={1}
                                                minValue={1}
                                                maxValue={6}
                                                value={segmentOptions.layer_count}
                                                onChange={(v) => setSegmentOptions(p => ({ ...p, layer_count: v as number }))}
                                                className="max-w-md"
                                                color="secondary"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between text-xs text-white/60">
                                                <span>边框检测灵敏度</span>
                                                <span>{Math.round(segmentOptions.alpha_val * 100)}%</span>
                                            </div>
                                            <Slider
                                                size="sm"
                                                step={0.01}
                                                minValue={0.05}
                                                maxValue={0.5}
                                                value={segmentOptions.alpha_val}
                                                onChange={(v) => setSegmentOptions(p => ({ ...p, alpha_val: v as number }))}
                                                color="primary"
                                            />
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between text-xs text-white/60">
                                                <span>白底过滤阈值</span>
                                                <span>{segmentOptions.white_threshold}</span>
                                            </div>
                                            <Slider
                                                size="sm"
                                                step={1}
                                                minValue={200}
                                                maxValue={255}
                                                value={segmentOptions.white_threshold}
                                                onChange={(v) => setSegmentOptions(p => ({ ...p, white_threshold: v as number }))}
                                                color="warning"
                                            />
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                )
                }
            </div >

            {/* Sidebar */}
            < div className="w-[320px] flex flex-col gap-6 bg-[#181920]/90 backdrop-blur-xl p-5 rounded-xl shadow-2xl border border-white/10 overflow-y-auto text-white" >

                {/* Layer Info */}
                < div className="flex flex-col gap-2" >
                    <div className="text-xs font-bold text-default-500 uppercase tracking-wider">当前选中</div>
                    <div className="min-h-[40px] flex items-center bg-white/5 rounded-lg px-3 border border-white/10">
                        {editMode.selectedLayer ? (
                            <Chip
                                onClose={() => setEditMode(p => ({ ...p, selectedLayer: null, maskDataUrl: null }))}
                                variant="flat"
                                color="secondary"
                            >
                                {LAYER_LABELS[editMode.selectedLayer] || editMode.selectedLayer}
                            </Chip>
                        ) : (
                            <span className="text-white/40 text-sm">未选中，请点击图片</span>
                        )}
                    </div>
                    {/* SAM mask 粒度切换 */}
                    {editMode.selectedLayer === 'selected_region' && editMode.meta?.seg_mode === 'sam' && editMode.sessionId && (
                        <div className="flex gap-1 mt-1">
                            {['精细', '中等', '粗略'].map((label, idx) => (
                                <Button
                                    key={idx}
                                    size="sm"
                                    variant="flat"
                                    className="flex-1 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white text-xs border border-white/5"
                                    isDisabled={editMode.editLoading}
                                    onPress={async () => {
                                        try {
                                            setEditMode(p => ({ ...p, editLoading: true }));
                                            const result = await interactiveSwitchMask(editMode.sessionId!, idx);
                                            setEditMode(p => ({
                                                ...p,
                                                selectedLayer: result.layer,
                                                maskDataUrl: `data:image/png;base64,${result.mask_png_base64}`,
                                                editLoading: false,
                                            }));
                                        } catch {
                                            setEditMode(p => ({ ...p, editLoading: false }));
                                        }
                                    }}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    )}
                </div >

                {/* Prompt Input */}
                < div className="flex flex-col gap-2" >
                    <div className="text-xs font-bold text-default-500 uppercase tracking-wider">编辑指令</div>
                    <Textarea
                        placeholder="例如：改成深红色、变亮..."
                        value={editPrompt}
                        onValueChange={setEditPrompt}
                        minRows={3}
                        maxRows={5}
                        disabled={!editMode.selectedLayer || editMode.editLoading}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onApplyEdit();
                            }
                        }}
                        classNames={{
                            input: "text-white placeholder:text-white/30",
                            inputWrapper: "bg-white/5 data-[hover=true]:bg-white/10 group-data-[focus=true]:bg-white/10 border-white/10"
                        }}
                    />
                </div >

                <Button
                    color="primary"
                    size="lg"
                    className="w-full font-bold bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 border border-white/10 rounded-xl"
                    isDisabled={!editMode.selectedLayer || !editPrompt.trim() || editMode.editLoading}
                    isLoading={editMode.editLoading}
                    onPress={onApplyEdit}
                >
                    应用编辑
                </Button>

                {/* Quick Actions */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-default-500 uppercase tracking-wider">快捷指令</div>
                    <div className="flex flex-wrap gap-2">
                        {['深红色', '藏蓝色', '米白色', '变亮', '变暗', '提高对比度'].map(cmd => (
                            <Button
                                key={cmd}
                                size="sm"
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
                                isDisabled={!editMode.selectedLayer || editMode.editLoading}
                                onPress={() => setEditPrompt(`改成${cmd}`)}
                            >
                                {cmd}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="h-px bg-white/10 my-2" />

                {/* Tools */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-default-500 uppercase tracking-wider">工具</div>
                    <div className="grid grid-cols-2 gap-2">
                        <Tooltip content="撤回上一步" classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <Button
                                startContent={<UndoOutlined />}
                                isDisabled={editMode.history.length <= 1 || editMode.editLoading}
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onPress={onUndo}
                            >
                                撤回
                            </Button>
                        </Tooltip>
                        <Tooltip content="下载" classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <Button
                                startContent={<DownloadOutlined />}
                                isDisabled={!editMode.currentImageDataUrl}
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onPress={() => editMode.currentImageDataUrl && onDownload(editMode.currentImageDataUrl, 'edited_image.png')}
                            >
                                下载
                            </Button>
                        </Tooltip>
                        <Tooltip content="加入对话作为参考图" classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <Button
                                startContent={<LinkOutlined />}
                                isDisabled={!editMode.currentImageDataUrl}
                                variant="flat"
                                className="col-span-2 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onPress={onAddToReference}
                            >
                                引用：加入对话
                            </Button>
                        </Tooltip>
                    </div>
                </div>

                {/* Meta Info */}
                {
                    editMode.meta && (
                        <div className="mt-auto pt-4 text-xs text-white/30 flex flex-col gap-1">
                            <div>尺寸: {editMode.meta.w} × {editMode.meta.h}</div>
                            <div>分割模式: {editMode.meta.seg_mode}</div>
                            <div>历史步数: {editMode.history.length}</div>
                        </div>
                    )
                }
            </div >
        </div >
    );
};
