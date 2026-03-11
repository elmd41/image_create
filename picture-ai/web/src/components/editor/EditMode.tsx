import React, { useMemo, useState } from 'react';
import { Button, Textarea, Tooltip, Spinner, Chip } from "@heroui/react";
import { message } from 'antd';
import { Upload } from "antd";

import {
    PictureOutlined,
    LinkOutlined,
    DownloadOutlined,
    UndoOutlined,
    RedoOutlined,
    SyncOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    DeleteOutlined,
} from '@ant-design/icons';

import { EditModeState } from '../../types';
import { EditSidebar } from './EditSidebar';
import { convertImageFile, revokePreviewUrl } from '../../utils/imageConverter';


interface EditModeProps {
    editMode: EditModeState;
    setEditMode: React.Dispatch<React.SetStateAction<EditModeState>>;
    editPrompt: string;
    setEditPrompt: (val: string) => void;
    onEnterEditMode: (file: File, options?: { layer_count?: number }) => Promise<void>;
    onApplyEdit: () => Promise<void>;
    onUndo: () => void;
    onRestore: () => void;
    onReset: () => void;
    onAddToReference: () => void;
    onDownload: (src: string, name?: string) => void;
    onToggleLayerSelected: (layerId: string) => void;
    onToggleLayerVisible: (layerId: string) => void;
    onDeleteLayer: (layerId: string) => void;
    segmenting: boolean;
    segmentProgress: number;
    // Edit session management
    onNewEditSession: () => void;
    // Pending file state (lifted to parent to persist across tab switches)
    pendingFile: File | null;
    setPendingFile: (file: File | null) => void;
    pendingFilePreview: string | null;
    setPendingFilePreview: (url: string | null) => void;
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
    onApplyEdit,
    onUndo,
    onRestore,
    onReset,
    onAddToReference,
    onDownload,
    onToggleLayerSelected,
    onToggleLayerVisible,
    onDeleteLayer,
    segmenting,
    segmentProgress,
    onNewEditSession,
    pendingFile,
    setPendingFile,
    pendingFilePreview,
    setPendingFilePreview,
}) => {

    const selectedLayers = useMemo(
        () => editMode.layers.filter(l => l.selected && !l.deleted),
        [editMode.layers]
    );

    const [segmentOptions, setSegmentOptions] = useState({
        layer_count: 4
    });
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [converting, setConverting] = useState(false);

    // 处理图片选择 - 使用图片格式转换工具
    const handleFileSelect = async (file: File) => {
        setPreviewError(null);
        setConverting(true);
        
        try {
            const result = await convertImageFile(file);
            setPendingFile(result.file);
            setPendingFilePreview(result.previewUrl);
            
            if (result.converted && result.message) {
                message.info(result.message);
            }
        } catch (error) {
            setPreviewError(error instanceof Error ? error.message : '图片处理失败');
            setPendingFile(file);
            setPendingFilePreview(null);
        } finally {
            setConverting(false);
        }
    };

    // 清理预览
    const clearPendingFile = () => {
        revokePreviewUrl(pendingFilePreview);
        setPendingFile(null);
        setPendingFilePreview(null);
        setPreviewError(null);
    };


    return (
        <div className="flex-1 overflow-hidden h-full flex gap-4 p-4">
            {/* Left: Simple Edit Sidebar - 固定宽度 */}
            <EditSidebar onNewSession={onNewEditSession} />

            {/* Canvas Area */}
            <div className="flex-1 flex flex-col items-center justify-center bg-black/20 rounded-2xl relative overflow-hidden select-none border border-white/5">
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
                                className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-xl shadow-lg"
                                draggable={false}
                            />

                            {editMode.editLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl z-10">
                                    <Spinner label="处理中..." color="primary" />
                                </div>
                            )}
                        </div>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/60 text-white rounded-full text-sm backdrop-blur-sm pointer-events-none">
                            右侧选择图层后应用编辑
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full relative flex flex-col items-center justify-center">
                        {/* 预览区域 - 上传后显示图片 */}
                        {pendingFile ? (
                            <div className="relative max-w-full max-h-[calc(100%-100px)] flex flex-col items-center">
                                {/* 关闭按钮 */}
                                <div
                                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center cursor-pointer z-20 text-sm hover:bg-red-500/80 transition-colors"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        clearPendingFile();
                                    }}
                                >
                                    ✕
                                </div>
                                
                                {pendingFilePreview ? (
                                    <img
                                        src={pendingFilePreview}
                                        alt="preview"
                                        className="max-w-full max-h-[calc(100vh-280px)] object-contain rounded-xl shadow-lg border border-white/10"
                                        draggable={false}
                                        onError={() => setPreviewError('图片加载失败')}
                                    />
                                ) : (
                                    <div className="w-64 h-64 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center">
                                        <PictureOutlined style={{ fontSize: '48px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }} />
                                        <div className="text-white/50 text-sm text-center px-4">
                                            {previewError || '预览不可用'}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-3 text-sm text-white/60">
                                    {pendingFile.name} <span className="text-white/40">({(pendingFile.size / 1024).toFixed(1)} KB)</span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="light"
                                    className="mt-2 text-white/50 hover:text-white"
                                    onPress={clearPendingFile}
                                >
                                    重新选择
                                </Button>
                            </div>
                        ) : (
                            <Upload.Dragger
                                accept="image/*"
                                showUploadList={false}
                                beforeUpload={(file) => {
                                    handleFileSelect(file);
                                    return false;
                                }}
                                className="w-full h-full !border-none !bg-transparent flex items-center justify-center"
                            >
                                <div className="flex flex-col items-center justify-center p-10 cursor-pointer">
                                    <PictureOutlined style={{ fontSize: '48px', color: 'rgba(255,255,255,0.2)', marginBottom: '16px' }} />
                                    <div className="text-lg text-white/60 mb-2">点击或拖拽上传图片</div>
                                    <div className="text-sm text-white/30">支持 PNG, JPG, WEBP, TIFF 等格式</div>
                                    </div>
                            </Upload.Dragger>
                        )}

                        {/* 底部控制栏 - 始终显示 */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-[#2a2d34] rounded-xl p-3 border border-white/10" onClick={e => e.stopPropagation()}>
                            <select
                                className="h-10 w-28 bg-[#1f2229] text-white text-sm rounded-md px-3 outline-none border border-white/10"
                                value={segmentOptions.layer_count}
                                onChange={(e) => setSegmentOptions({ layer_count: Number(e.target.value) })}
                                disabled={segmenting}
                            >
                                {[2, 3, 4, 5, 6, 7, 8].map(v => (
                                    <option key={v} value={v}>{v} 层</option>
                                ))}
                            </select>

                            <Button
                                color="primary"
                                className="h-10 px-6 font-semibold bg-gradient-to-r from-teal-500 to-cyan-500"
                                isDisabled={!pendingFile || segmenting}
                                onPress={() => pendingFile && onEnterEditMode(pendingFile, segmentOptions)}
                            >
                                开始分层
                            </Button>

                            {segmenting && (
                                <div className="flex items-center gap-2 text-white/80 text-sm min-w-[86px]">
                                    <Spinner size="sm" />
                                    <span>{Math.min(99, Math.max(1, Math.round(segmentProgress)))}%</span>
                                </div>
                            )}
                        </div>

                    </div>
                )
                }
            </div >

            {/* Sidebar - Dark Theme */}
            <div className="w-[280px] flex flex-col gap-4 bg-[#181920]/95 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/10 overflow-y-auto shrink-0">

                {/* Layer Panel */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider">图层</div>
                    <div className="flex flex-col gap-2">
                        {editMode.layers.length === 0 ? (
                            <div className="text-xs text-white/40 bg-white/5 border border-white/10 rounded-xl px-3 py-2">暂无图层</div>
                        ) : (
                            editMode.layers.map(layer => (
                                <div key={layer.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border ${layer.deleted ? 'opacity-40 border-white/10 bg-white/5' : 'bg-white/5 border-white/10 hover:border-cyan-400/50'}`}>
                                    <input
                                        type="checkbox"
                                        className="accent-cyan-400 w-4 h-4"
                                        checked={layer.selected && !layer.deleted}
                                        disabled={layer.deleted}
                                        onChange={() => onToggleLayerSelected(layer.id)}
                                    />
                                    {layer.thumbnail ? (
                                        <img src={layer.thumbnail} alt={layer.name} className="w-8 h-8 rounded-lg object-cover border border-white/10" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white truncate font-medium">{LAYER_LABELS[layer.name] || layer.name}</div>
                                        {layer.deleted && <div className="text-[10px] text-white/40">已删除（可撤回）</div>}
                                    </div>
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        className="text-white/70 hover:text-white min-w-6 w-6 h-6"
                                        isDisabled={layer.deleted}
                                        onPress={() => onToggleLayerVisible(layer.id)}
                                    >
                                        {layer.visible ? <EyeOutlined className="text-xs" /> : <EyeInvisibleOutlined className="text-xs" />}
                                    </Button>
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        className="text-red-400/60 hover:text-red-400 min-w-6 w-6 h-6"
                                        isDisabled={layer.deleted}
                                        onPress={() => onDeleteLayer(layer.id)}
                                    >
                                        <DeleteOutlined className="text-xs" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Selected Layers */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider">当前选中</div>
                    <div className="min-h-[40px] flex flex-wrap items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                        {selectedLayers.length > 0 ? (
                            selectedLayers.map(layer => (
                                <Chip
                                    key={layer.id}
                                    onClose={() => onToggleLayerSelected(layer.id)}
                                    variant="flat"
                                    color="primary"
                                    size="sm"
                                >
                                    {LAYER_LABELS[layer.name] || layer.name}
                                </Chip>
                            ))
                        ) : (
                            <span className="text-white/40 text-sm">未选中，请在上方勾选图层</span>
                        )}
                    </div>
                </div>

                {/* Prompt Input */}
                < div className="flex flex-col gap-2" >
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider">编辑指令</div>
                    <Textarea
                        placeholder="例如：改成深红色、变亮..."
                        value={editPrompt}
                        onValueChange={setEditPrompt}
                        minRows={3}
                        maxRows={5}
                        disabled={selectedLayers.length === 0 || editMode.editLoading}
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
                    className="w-full font-bold bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl"
                    isDisabled={selectedLayers.length === 0 || !editPrompt.trim() || editMode.editLoading}
                    isLoading={editMode.editLoading}
                    onPress={onApplyEdit}
                >
                    应用编辑
                </Button>

                {/* Quick Actions */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider">快捷指令</div>
                    <div className="flex flex-wrap gap-2">
                        {['深红色', '藏蓝色', '米白色', '变亮', '变暗', '提高对比度'].map(cmd => (
                            <Button
                                key={cmd}
                                size="sm"
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5"
                                isDisabled={selectedLayers.length === 0 || editMode.editLoading}
                                onPress={() => setEditPrompt(editPrompt ? `${editPrompt}，改成${cmd}` : `改成${cmd}`)}
                            >
                                {cmd}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="h-px bg-white/10 my-2" />

                {/* Tools */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider">工具</div>
                    <div className="grid grid-cols-2 gap-2">
                        <Tooltip content="撤回上一步">
                            <Button
                                startContent={<UndoOutlined />}
                                isDisabled={editMode.historyStack.length <= 1 || editMode.editLoading}
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onPress={onUndo}
                            >
                                撤回
                            </Button>
                        </Tooltip>
                        <Tooltip content="恢复上一步">
                            <Button
                                startContent={<RedoOutlined />}
                                isDisabled={editMode.futureStack.length === 0 || editMode.editLoading}
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onPress={onRestore}
                            >
                                恢复
                            </Button>
                        </Tooltip>
                        <Tooltip content="整图恢复到初始">
                            <Button
                                startContent={<SyncOutlined />}
                                isDisabled={!editMode.initialSnapshot || editMode.editLoading}
                                variant="flat"
                                className="bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                                onPress={onReset}
                            >
                                重做
                            </Button>
                        </Tooltip>
                        <Tooltip content="下载">
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
                        <Tooltip content="加入对话作为参考图">
                            <Button
                                startContent={<LinkOutlined />}
                                isDisabled={!editMode.currentImageDataUrl}
                                variant="flat"
                                className="col-span-2 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                                onPress={onAddToReference}
                            >
                                引用：加入对话
                            </Button>
                        </Tooltip>
                    </div>
                </div>

                <div className="h-px bg-white/10 my-2" />

                {/* Meta Info */}
                {
                    editMode.meta && (
                        <div className="mt-auto pt-2 text-[10px] text-white/30 flex flex-col gap-0.5">
                            <div>尺寸: {editMode.meta.w} × {editMode.meta.h}</div>
                            <div>分割模式: {editMode.meta.seg_mode}</div>
                            <div>历史步数: {editMode.historyStack.length}</div>
                        </div>
                    )
                }
            </div>
        </div>
    );
};
