import React, { useState } from 'react';
import {
    Button,
    Textarea,
    Popover,
    PopoverTrigger,
    PopoverContent,
    Tooltip
} from "@heroui/react";
import {
    PictureOutlined,
    CloseOutlined,
    BgColorsOutlined,
    AppstoreOutlined,
    ColumnWidthOutlined,
    EnvironmentOutlined,
    SearchOutlined,
    StopOutlined
} from '@ant-design/icons';
import { UploadFile } from 'antd/es/upload/interface';
import { RgbPalettePicker } from '../shared/RgbPalettePicker';
import { BorderBeam } from '../shared/BorderBeam';
import {
    STYLE_OPTIONS,
    RATIO_OPTIONS,
    SCENE_OPTIONS,
    DEFAULT_SCENE_VALUE,
    PARAM_LABELS
} from '../../constants';
import { GenerateParams } from '../../types';

interface InputAreaProps {
    inputText: string;
    setInputText: (text: string) => void;
    fileList: UploadFile[];
    setFileList: (files: UploadFile[]) => void;
    loading: boolean;
    isInputLocked: boolean;
    generateParams: GenerateParams;
    onUpdateGenerateParam: (key: keyof GenerateParams, value: string) => void;
    onClearGenerateParam: (key: keyof GenerateParams) => void;
    paramOrder: (keyof GenerateParams)[];
    pendingDeleteParam: keyof GenerateParams | null;
    setPendingDeleteParam: (key: keyof GenerateParams | null) => void;
    onAction: (mode: 'search' | 'generate') => Promise<void>;
    onCancel: () => void;
    onPasteImage: (e: React.ClipboardEvent) => void;
    onPreviewImage: (src: string, name?: string) => void;
    onColorEdit?: (src: string) => void;
    onCropEdit?: (src: string) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
    inputText,
    setInputText,
    fileList,
    setFileList,
    loading,
    isInputLocked,
    generateParams,
    onUpdateGenerateParam,
    onClearGenerateParam,
    onAction,
    onCancel,
    onPasteImage,
    onPreviewImage
}) => {
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [sceneOpen, setSceneOpen] = useState(false);
    const [styleOpen, setStyleOpen] = useState(false);
    const [ratioOpen, setRatioOpen] = useState(false);
    // Controlled popovers for inline param chip editing
    const [editingParam, setEditingParam] = useState<keyof GenerateParams | null>(null);

    const showSceneChip = !!(generateParams.scene && generateParams.scene !== DEFAULT_SCENE_VALUE);
    const hasParams = !!generateParams.style || !!generateParams.ratio || !!generateParams.color || showSceneChip;

    const hasText = inputText.trim().length > 0;
    const hasImage = fileList.length > 0;

    // 搜索按钮：有图片时搜索高亮；有图片或文字时可用
    const isSearchActive = !loading && hasImage;
    const isSearchEnabled = !loading && (hasImage || hasText);
    const isGenerateEnabled = !loading && (hasText || hasParams);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!file.type.startsWith('image/')) return;
            const uid = `${Date.now()}`;
            setFileList([{ uid, name: file.name, status: 'done', url: URL.createObjectURL(file), originFileObj: file as any }]);
        }
        // 重置input value，允许重复选择同一文件
        e.target.value = '';
    };

    const renderParamChips = () => {
        const chips: React.ReactNode[] = [];
        (['style', 'ratio', 'color', 'scene'] as const).forEach(key => {
            if (!generateParams[key] || (key === 'scene' && generateParams.scene === DEFAULT_SCENE_VALUE)) return;

            const getOptions = () => {
                if (key === 'style') return STYLE_OPTIONS;
                if (key === 'ratio') return RATIO_OPTIONS;
                if (key === 'scene') return SCENE_OPTIONS;
                return [];
            };
            const options = getOptions();

            chips.push(
                <div key={key} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/25 text-[11px] text-cyan-300 shrink-0">
                    <span className="opacity-50 text-[9px] uppercase mr-0.5">{PARAM_LABELS[key] || key}:</span>
                    {key === 'color' ? (
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ background: generateParams.color }} />
                        </span>
                    ) : options.length > 0 ? (
                        <Popover placement="top" isOpen={editingParam === key} onOpenChange={(open) => setEditingParam(open ? key : null)}>
                            <PopoverTrigger>
                                <span className="cursor-pointer hover:text-white transition-colors">{generateParams[key]}</span>
                            </PopoverTrigger>
                            <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                <div className={`grid gap-1 ${key === 'ratio' ? 'grid-cols-4' : key === 'style' ? 'grid-cols-2 w-56' : 'grid-cols-1 w-48'}`}>
                                    {options.map(opt => (
                                        <Button key={opt.value} size="sm" variant="light"
                                            className={`justify-start text-xs ${generateParams[key] === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                            onPress={() => { onUpdateGenerateParam(key, opt.value); setEditingParam(null); }}>
                                            {opt.label}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    ) : (
                        <span>{generateParams[key]}</span>
                    )}
                    <CloseOutlined className="text-[8px] ml-1 opacity-40 hover:opacity-100 cursor-pointer" onClick={(e) => { e.stopPropagation(); onClearGenerateParam(key); }} />
                </div>
            );
        });
        return chips;
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-50">
            <div className="relative group bg-[#12121a]/90 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] transition-all duration-300 focus-within:bg-[#12121a]/95">

                <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <BorderBeam size={300} duration={8} delay={9} colorFrom="#06b6d4" colorTo="#0891b2" />
                </div>

                <div className="flex flex-col px-3 py-2.5">
                    {/* 上传预览 */}
                    {fileList.length > 0 && (
                        <div className="flex gap-2 mb-2 ml-10">
                            {fileList.map((file) => {
                                const src = file.url || (file.originFileObj ? URL.createObjectURL(file.originFileObj as any) : '');
                                return (
                                    <div key={file.uid} className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 group/img cursor-pointer">
                                        <img src={src} alt="preview" className="w-full h-full object-cover" onClick={() => !isInputLocked && onPreviewImage(src, file.name)} />
                                        {/* 右上角删除按钮 - 始终显示 */}
                                        {!isInputLocked && (
                                            <div 
                                                className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 hover:bg-red-500 rounded-full flex items-center justify-center cursor-pointer transition-colors z-10 border border-white/20"
                                                onClick={(e) => { e.stopPropagation(); setFileList(fileList.filter(f => f.uid !== file.uid)); }}>
                                                <CloseOutlined className="text-white text-[10px]" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 主输入行：上传图标 | 输入框(含chips) | 停止/生成/搜索 */}
                    <div className="flex items-center gap-2">
                        {/* 上传按钮 - 左侧 */}
                        <Tooltip content="上传参考图" delay={400} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                            <div className="relative shrink-0">
                                <input type="file" accept="image/*"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                    onChange={handleFileChange} disabled={loading || isInputLocked} />
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${hasImage ? 'text-cyan-400' : 'text-white/40 hover:text-white/70'}`}>
                                    <PictureOutlined style={{ fontSize: 24 }} />
                                </div>
                            </div>
                        </Tooltip>

                        {/* 输入区域 - 含参数chips */}
                        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[40px]">
                            {renderParamChips()}
                            <div className="flex-1 min-w-[120px]">
                                <Textarea
                                    placeholder="描述你的创意..."
                                    minRows={1} maxRows={6}
                                    value={inputText}
                                    onValueChange={setInputText}
                                    onPaste={onPasteImage}
                                    onKeyDown={(e) => {
                                        if (loading) return;
                                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                            e.preventDefault();
                                            void onAction('generate');
                                        }
                                    }}
                                    disabled={loading || isInputLocked}
                                    classNames={{
                                        base: "w-full",
                                        input: "text-sm text-white placeholder:text-white/30 caret-cyan-400 py-1.5",
                                        inputWrapper: "!bg-transparent shadow-none border-none p-0 min-h-0 data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent items-center"
                                    }}
                                />
                            </div>
                        </div>

                        {/* 右侧按钮组 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            {loading ? (
                                <Tooltip content="停止生成" delay={0} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                    <Button isIconOnly size="sm" variant="light"
                                        className="w-8 h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                        onPress={onCancel}>
                                        <StopOutlined style={{ fontSize: 16 }} />
                                    </Button>
                                </Tooltip>
                            ) : (
                                <>
                                    <Button
                                        className={`h-10 px-5 text-sm font-semibold rounded-xl transition-all ${!isGenerateEnabled
                                            ? 'bg-white/5 text-white/20'
                                            : 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-400 hover:to-cyan-400 active:scale-95'
                                            }`}
                                        size="sm"
                                        isDisabled={!isGenerateEnabled}
                                        onPress={() => onAction('generate')}>
                                        生成
                                    </Button>
                                    <Tooltip content="搜索相似图" delay={300} closeDelay={0} classNames={{ content: 'text-xs px-2 py-1 bg-[#222] text-white rounded-lg' }}>
                                        <Button isIconOnly size="sm" variant="light"
                                            className={`w-10 h-10 rounded-xl transition-all ${isSearchActive
                                                ? 'text-cyan-400 hover:bg-cyan-500/10'
                                                : isSearchEnabled
                                                    ? 'text-white/50 hover:text-white hover:bg-white/5'
                                                    : 'text-white/15'
                                                }`}
                                            isDisabled={!isSearchEnabled}
                                            onPress={() => onAction('search')}>
                                            <SearchOutlined style={{ fontSize: 18 }} />
                                        </Button>
                                    </Tooltip>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 参数选择栏 - 输入框下方 */}
                    <div className="flex items-center gap-1.5 mt-1.5 ml-10 border-t border-white/5 pt-1.5">
                        <Popover placement="top" isOpen={sceneOpen} onOpenChange={setSceneOpen}>
                            <PopoverTrigger>
                                <Button size="sm" variant="light" className={`h-7 px-2 text-[11px] rounded-md transition-all ${showSceneChip ? 'text-cyan-400 bg-cyan-500/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                                    <EnvironmentOutlined className="mr-1" />场景/图结构
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                <div className="grid grid-cols-1 gap-1 w-48">
                                    {SCENE_OPTIONS.map(opt => (
                                        <Button key={opt.value} size="sm" variant="light"
                                            className={`justify-start text-xs ${generateParams.scene === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                            onPress={() => { onUpdateGenerateParam('scene', opt.value); setSceneOpen(false); }}>
                                            {opt.label}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Popover placement="top" isOpen={styleOpen} onOpenChange={setStyleOpen}>
                            <PopoverTrigger>
                                <Button size="sm" variant="light" className={`h-7 px-2 text-[11px] rounded-md transition-all ${generateParams.style ? 'text-cyan-400 bg-cyan-500/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                                    <AppstoreOutlined className="mr-1" />风格
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                <div className="grid grid-cols-2 gap-1 w-56">
                                    {STYLE_OPTIONS.map(opt => (
                                        <Button key={opt.value} size="sm" variant="light"
                                            className={`justify-start text-xs ${generateParams.style === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                            onPress={() => { onUpdateGenerateParam('style', opt.value); setStyleOpen(false); }}>
                                            {opt.label}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Popover placement="top" isOpen={ratioOpen} onOpenChange={setRatioOpen}>
                            <PopoverTrigger>
                                <Button size="sm" variant="light" className={`h-7 px-2 text-[11px] rounded-md transition-all ${generateParams.ratio ? 'text-cyan-400 bg-cyan-500/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                                    <ColumnWidthOutlined className="mr-1" />比例
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                <div className="grid grid-cols-4 gap-1">
                                    {RATIO_OPTIONS.map(opt => (
                                        <Button key={opt.value} size="sm" variant="light"
                                            className={`text-xs ${generateParams.ratio === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                            onPress={() => { onUpdateGenerateParam('ratio', opt.value); setRatioOpen(false); }}>
                                            {opt.label}
                                        </Button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        <Popover placement="top" isOpen={colorPickerOpen} onOpenChange={setColorPickerOpen}>
                            <PopoverTrigger>
                                <Button size="sm" variant="light" className={`h-7 px-2 text-[11px] rounded-md transition-all ${generateParams.color ? 'text-cyan-400 bg-cyan-500/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                                    {generateParams.color ? (
                                        <span className="w-3 h-3 rounded-full border border-white/20 mr-1" style={{ background: generateParams.color, display: 'inline-block' }} />
                                    ) : (
                                        <BgColorsOutlined className="mr-1" />
                                    )}
                                    主体颜色
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="bg-[#181920] border border-white/10 p-0 rounded-xl overflow-hidden">
                                <RgbPalettePicker
                                    value={generateParams.color}
                                    onChange={(hex) => onUpdateGenerateParam('color', hex)}
                                    onPick={() => setColorPickerOpen(false)}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>
        </div>
    );
};
