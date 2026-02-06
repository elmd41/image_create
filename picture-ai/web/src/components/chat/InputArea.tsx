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
    EnvironmentOutlined
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
    paramOrder,
    pendingDeleteParam,
    setPendingDeleteParam,
    onAction,
    onCancel,
    onPasteImage,
    onPreviewImage
}) => {
    const [colorPickerOpen, setColorPickerOpen] = useState(false);

    // Helper to determine active params for display
    const showSceneChip = !!(generateParams.scene && generateParams.scene !== DEFAULT_SCENE_VALUE);
    const hasParams = !!generateParams.style || !!generateParams.ratio || !!generateParams.color || showSceneChip;

    const hasText = inputText.trim().length > 0;
    const hasImage = fileList.length > 0;
    const isSearchDisabled = loading || (!hasText && !hasImage);
    const isGenerateDisabled = loading || (!hasText && !hasImage && !hasParams);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!file.type.startsWith('image/')) return;
            const uid = `${Date.now()}`;
            setFileList([{
                uid,
                name: file.name,
                status: 'done',
                url: URL.createObjectURL(file),
                originFileObj: file as any
            }]);
        }
    };

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50">
            <div className="relative group bg-[#12121a]/80 backdrop-blur-2xl backdrop-saturate-150 rounded-[28px] border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,1)] transition-all duration-300 focus-within:bg-[#12121a]/95">

                {/* Border Beam Effect on Focus */}
                <div className="absolute inset-0 rounded-[28px] overflow-hidden opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <BorderBeam size={300} duration={8} delay={9} colorFrom="#06b6d4" colorTo="#0891b2" />
                </div>

                <div className="flex flex-col p-4">
                    {/* User Upload Preview */}
                    {fileList.length > 0 && (
                        <div className="flex gap-3 mb-3 p-2 bg-white/5 rounded-2xl w-fit">
                            {fileList.map((file) => {
                                const src = file.url || (file.originFileObj ? URL.createObjectURL(file.originFileObj as any) : '');
                                return (
                                    <div key={file.uid} className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 group/img cursor-pointer">
                                        <img
                                            src={src}
                                            alt="preview"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                                            onClick={() => !isInputLocked && onPreviewImage(src, file.name)}
                                        />
                                        {!isInputLocked && (
                                            <div
                                                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                onClick={(e) => { e.stopPropagation(); setFileList(fileList.filter(f => f.uid !== file.uid)) }}
                                            >
                                                <CloseOutlined className="text-white text-lg" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}


                    {/* Selected Params Display */}
                    {hasParams && (
                        <div className="flex flex-wrap gap-2 mb-2 px-1">
                            {(['style', 'ratio', 'color', 'scene'] as const).map(key => {
                                if (!generateParams[key] || (key === 'scene' && generateParams.scene === DEFAULT_SCENE_VALUE)) return null;
                                return (
                                    <div key={key} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[10px] text-cyan-200 font-mono cursor-pointer hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-colors" onClick={() => onClearGenerateParam(key)}>
                                        <span className="opacity-50 uppercase">{key}:</span>
                                        <span>{generateParams[key]}</span>
                                        <CloseOutlined className="text-[8px] ml-1 opacity-50" />
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Input & Actions Row */}
                    <div className="flex items-center gap-3">
                        {/* Action Bar (Upload + Params) */}
                        <div className="flex gap-2">
                            {/* Upload Button */}
                            <Tooltip content="上传参考图片" delay={500} closeDelay={0}>
                                <div className="relative group/upload">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                        onChange={handleFileChange}
                                        disabled={loading || isInputLocked}
                                    />
                                    <Button
                                        isIconOnly
                                        variant="flat"
                                        className={`w-10 h-10 rounded-full transition-all ${fileList.length > 0
                                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                            : 'bg-white/5 text-white/50 border border-transparent hover:bg-white/10 hover:text-white'
                                            }`}
                                    >
                                        <PictureOutlined style={{ fontSize: '18px' }} />
                                    </Button>
                                </div>
                            </Tooltip>

                            {/* Scene Selector */}
                            <Popover placement="top" showArrow>
                                <PopoverTrigger>
                                    <Button isIconOnly variant="flat" className={`w-10 h-10 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all ${(generateParams.scene && generateParams.scene !== DEFAULT_SCENE_VALUE) ? 'text-cyan-400 bg-cyan-500/10' : ''}`}>
                                        <EnvironmentOutlined />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                    <div className="grid grid-cols-1 gap-1 w-48">
                                        {SCENE_OPTIONS.map(opt => (
                                            <Button
                                                key={opt.value}
                                                size="sm"
                                                variant="light"
                                                className={`justify-start ${generateParams.scene === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                                onPress={() => onUpdateGenerateParam('scene', opt.value)}
                                            >
                                                {opt.label}
                                            </Button>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Parameter Pills */}
                            <Popover placement="top" showArrow>
                                <PopoverTrigger>
                                    <Button isIconOnly variant="flat" className={`w-10 h-10 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all ${generateParams.style ? 'text-cyan-400 bg-cyan-500/10' : ''}`}>
                                        <AppstoreOutlined />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                    <div className="grid grid-cols-2 gap-1 w-64">
                                        {STYLE_OPTIONS.map(opt => (
                                            <Button
                                                key={opt.value}
                                                size="sm"
                                                variant="light"
                                                className={`justify-start ${generateParams.style === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                                onPress={() => onUpdateGenerateParam('style', opt.value)}
                                            >
                                                {opt.label}
                                            </Button>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>

                            <Popover placement="top" showArrow>
                                <PopoverTrigger>
                                    <Button isIconOnly variant="flat" className={`w-10 h-10 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all ${generateParams.ratio ? 'text-cyan-400 bg-cyan-500/10' : ''}`}>
                                        <ColumnWidthOutlined />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="bg-[#181920] border border-white/10 p-2 rounded-xl">
                                    <div className="grid grid-cols-4 gap-1">
                                        {RATIO_OPTIONS.map(opt => (
                                            <Button
                                                key={opt.value}
                                                size="sm"
                                                variant="light"
                                                className={`${generateParams.ratio === opt.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/70'}`}
                                                onPress={() => onUpdateGenerateParam('ratio', opt.value)}
                                            >
                                                {opt.label}
                                            </Button>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>

                            <Popover placement="top" showArrow isOpen={colorPickerOpen} onOpenChange={setColorPickerOpen}>
                                <PopoverTrigger>
                                    <Button isIconOnly variant="flat" className={`w-10 h-10 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all`}>
                                        {generateParams.color ? (
                                            <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: generateParams.color }} />
                                        ) : (
                                            <BgColorsOutlined />
                                        )}
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

                        {/* Text Input */}
                        <div className="flex-1 flex items-center">
                            <Textarea
                                placeholder="描述你的创意..."
                                minRows={1}
                                maxRows={6}
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
                                    input: "text-base text-white placeholder:text-white/40 caret-cyan-400 py-2",
                                    inputWrapper: "!bg-transparent shadow-none border-none p-0 min-h-0 data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent items-center"
                                }}
                            />
                        </div>

                        {/* Generate Button */}
                        <Button
                            className={`h-10 px-6 font-semibold rounded-xl transition-all duration-200 ${isGenerateDisabled
                                ? 'bg-white/5 text-white/20'
                                : 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white hover:from-teal-400 hover:to-cyan-400 active:scale-95'
                                }`}
                            size="md"
                            radius="none"
                            isDisabled={isGenerateDisabled}
                            isLoading={loading}
                            onPress={() => onAction('generate')}
                        >
                            生成
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
