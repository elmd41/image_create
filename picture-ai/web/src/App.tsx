/**
 * Picture AI Main Application
 * Refactored with HeroUI + Tailwind CSS
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  search,
  generate,
  interactiveUpload,
  interactivePick,
  interactiveEdit,
  proxyImageUrl,
} from './services/api';

import { Header } from './components/layout/Header';
import { ChatArea } from './components/chat/ChatArea';
import { InputArea } from './components/chat/InputArea';
import { EditMode } from './components/editor/EditMode';
import { DownloadDialog } from './components/shared/DownloadDialog';
import { ImagePreviewModal } from './components/shared/ImagePreviewModal';
import { ColorPalettePanel } from './components/shared/ColorPalettePanel';
import { CropDialog } from './components/shared/CropDialog';

import { Message, GenerateParams, EditModeState } from './types';
import { DEFAULT_SCENE_VALUE } from './constants';

const API_URL = 'http://127.0.0.1:8000';

const initialEditModeState: EditModeState = {
  active: false,
  sessionId: null,
  currentImageDataUrl: null,
  maskDataUrl: null,
  selectedLayer: null,
  meta: null,
  editLoading: false,
  history: [],
};

const App: React.FC = () => {
  // --- Global State ---
  const [activeTab, setActiveTab] = useState<'chat' | 'edit'>('chat');
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 全局粘贴图片监听器 - 支持在页面任意位置Ctrl+V粘贴图片
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // 如果正在加载或不在chat tab，忽略
      if (loading || activeTab !== 'chat') return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setFileList([{ 
              uid: Date.now().toString(), 
              name: file.name || 'pasted-image.png', 
              status: 'done', 
              url: URL.createObjectURL(file), 
              originFileObj: file as any 
            }]);
            message.success('已粘贴图片');
            e.preventDefault();
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [loading, activeTab]);

  // --- Chat State ---
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [imagePreview, setImagePreview] = useState<{ open: boolean; src: string; filename?: string }>({ open: false, src: '' });

  // --- Generate Params ---
  const [generateParams, setGenerateParams] = useState<GenerateParams>({
    style: '',
    ratio: '',
    color: '',
    scene: DEFAULT_SCENE_VALUE,
  });
  const [paramOrder, setParamOrder] = useState<(keyof GenerateParams)[]>([]);
  const [pendingDeleteParam, setPendingDeleteParam] = useState<keyof GenerateParams | null>(null);

  // --- Edit Mode State ---
  const [editMode, setEditMode] = useState<EditModeState>(initialEditModeState);
  const [editPrompt, setEditPrompt] = useState('');
  const [editModeLoading, setEditModeLoading] = useState(false);

  // --- Helper State ---
  const [downloadDialog, setDownloadDialog] = useState<{ open: boolean; src: string; filename?: string }>({ open: false, src: '' });
  const [downloadFormat, setDownloadFormat] = useState('png');

  // --- Color/Crop Dialog State ---
  const [colorDialog, setColorDialog] = useState<{ open: boolean; imageBase64: string }>({ open: false, imageBase64: '' });
  const [cropDialog, setCropDialog] = useState<{ open: boolean; imageBase64: string }>({ open: false, imageBase64: '' });

  // --- Derived State ---


  // --- Helpers ---
  const buildParamsPrompt = useCallback((params: GenerateParams) => {
    const parts: string[] = [];
    if (params.style) parts.push(`风格：${params.style}`);
    if (params.ratio) parts.push(`比例：${params.ratio}`);
    if (params.color) parts.push(`颜色：${params.color}`);
    if (params.scene && params.scene !== DEFAULT_SCENE_VALUE) parts.push(`场景：${params.scene}`);
    return parts.join('，');
  }, []);

  const updateGenerateParam = useCallback((key: keyof GenerateParams, value: string) => {
    setGenerateParams((prev) => ({ ...prev, [key]: value }));
    setParamOrder((prev) => {
      const normalizedValue = key === 'scene' ? (value !== DEFAULT_SCENE_VALUE ? value : '') : value;
      if (!normalizedValue) return prev.filter((k) => k !== key);
      if (prev.includes(key)) return prev;
      return [...prev.filter((k) => k !== key), key];
    });
    setPendingDeleteParam(null);
  }, []);

  const clearGenerateParam = useCallback((key: keyof GenerateParams) => {
    setGenerateParams((prev) => ({ ...prev, [key]: key === 'scene' ? DEFAULT_SCENE_VALUE : '' }));
    setParamOrder((prev) => prev.filter((k) => k !== key));
    setPendingDeleteParam(null);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setChatHistory((prev) => [...prev, msg]);
  }, []);

  const urlToFile = async (url: string, filename: string): Promise<File> => {
    // 如果是后端URL，使用代理避免CORS问题
    const fetchUrl = url.startsWith('data:') ? url : proxyImageUrl(url);
    const response = await fetch(fetchUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  };

  // --- Action Handlers ---
  const handleAction = async (currentMode: 'search' | 'generate', options?: any) => {
    const paramsForRequest = options?.overrideParams || generateParams;
    let effectiveText = options?.overrideText || inputText;
    const skipUserMessage = options?.skipUserMessage || false;
    const overrideFile = options?.overrideFile as File | undefined;
    const overrideRefImageUrl = options?.overrideRefImageUrl as string | undefined;

    // Auto build prompt if only params exist
    const showSceneChip = !!(paramsForRequest.scene && paramsForRequest.scene !== DEFAULT_SCENE_VALUE);
    const hasParams = !!(paramsForRequest.style || paramsForRequest.ratio || paramsForRequest.color || showSceneChip);

    if (currentMode === 'generate' && !effectiveText && hasParams) {
      effectiveText = buildParamsPrompt(paramsForRequest);
    }

    const actualFile = overrideFile || (fileList[0]?.originFileObj as File | undefined);
    if (!effectiveText && !actualFile && fileList.length === 0 && !(currentMode === 'generate' && hasParams)) {
      message.error('请输入文字或上传图片');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);

    const formData = new FormData();
    const fileToUpload = actualFile;

    // User Message
    let referenceImageDataUrl: string | undefined = overrideRefImageUrl;
    if (fileToUpload) {
      formData.append('file', fileToUpload);
      if (!skipUserMessage) {
        const reader = new FileReader();
        reader.onload = () => {
          referenceImageDataUrl = referenceImageDataUrl || (reader.result as string);
          addMessage({ type: effectiveText ? 'mixed' : 'image', content: reader.result as string, text: effectiveText, isUser: true, source: 'user', params: currentMode === 'generate' ? paramsForRequest : undefined });
        };
        reader.readAsDataURL(fileToUpload);
      }
    } else if (!skipUserMessage) {
      addMessage({ type: 'text', content: effectiveText, isUser: true, source: 'user', params: currentMode === 'generate' ? paramsForRequest : undefined });
    }
    const refImageUrl = fileList[0]?.url;
    setFileList([]);

    if (effectiveText) {
      formData.append('text', effectiveText);
      if (currentMode === 'generate') formData.append('prompt', effectiveText);
    }

    if (currentMode === 'generate') {
      if (paramsForRequest.style) formData.append('style', paramsForRequest.style);
      if (paramsForRequest.ratio) formData.append('ratio', paramsForRequest.ratio);
      if (paramsForRequest.color) formData.append('color', paramsForRequest.color);
      if (paramsForRequest.scene && paramsForRequest.scene !== DEFAULT_SCENE_VALUE) formData.append('scene', paramsForRequest.scene);
    }

    try {
      let response;
      if (currentMode === 'search') {
        formData.append('top_k', '6');
        response = await search(formData, controller.signal);
      } else {
        response = await generate(formData, controller.signal);
      }

      const results = response.data.results;
      if (results?.length > 0) {
        results.forEach((item: any) => {
          const url = currentMode === 'search' ? `${API_URL}${item.path}` : (item.startsWith('/') ? `${API_URL}${item}` : item);
          // 保存参考图信息，以便重新生成时使用
          addMessage({ 
            type: 'image', 
            content: url, 
            isUser: false, 
            source: currentMode, 
            prompt: effectiveText, 
            params: paramsForRequest,
            referenceImage: referenceImageDataUrl || refImageUrl,
          });
        });
      } else {
        addMessage({ type: 'text', content: '未找到结果', isUser: false });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error(error);
      message.error('操作失败');
    } finally {
      setLoading(false);
      setInputText('');
      if (currentMode === 'generate') {
        setGenerateParams({ style: '', ratio: '', color: '', scene: DEFAULT_SCENE_VALUE });
        setParamOrder([]);
      }
    }
  };

  // --- Edit Mode Handlers ---
  const enterEditMode = async (file: File, options?: { alpha_val?: number; white_threshold?: number; layer_count?: number }) => {
    setEditModeLoading(true);
    try {
      const result = await interactiveUpload(file, options);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setEditMode({
          active: true,
          sessionId: result.session_id,
          currentImageDataUrl: reader.result as string,
          maskDataUrl: null,
          selectedLayer: null,
          meta: result.meta,
          editLoading: false,
          history: [reader.result as string],
        });
        setActiveTab('edit');
      }
    } catch (e) {
      message.error('进入编辑模式失败');
    } finally {
      setEditModeLoading(false);
    }
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLDivElement>, canvas: HTMLDivElement) => {
    if (!editMode.sessionId || !editMode.meta || editMode.editLoading) return;
    const img = canvas.querySelector('img');
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    if (clickX < 0 || clickY < 0 || clickX > rect.width || clickY > rect.height) return;

    const scaleX = editMode.meta.w / rect.width;
    const scaleY = editMode.meta.h / rect.height;
    const x = Math.round(clickX * scaleX);
    const y = Math.round(clickY * scaleY);

    try {
      setEditMode(p => ({ ...p, editLoading: true }));
      const result = await interactivePick(editMode.sessionId, x, y);
      if (result.layer === 'none') {
        message.info('未选中区域');
        setEditMode(p => ({ ...p, selectedLayer: null, maskDataUrl: null, editLoading: false }));
      } else {
        setEditMode(p => ({ ...p, selectedLayer: result.layer, maskDataUrl: `data:image/png;base64,${result.mask_png_base64}`, editLoading: false }));
      }
    } catch (e) {
      message.error('拾取失败');
      setEditMode(p => ({ ...p, editLoading: false }));
    }
  };

  const handleApplyEdit = async () => {
    if (!editMode.sessionId || !editMode.selectedLayer || !editPrompt) return;
    try {
      setEditMode(p => ({ ...p, editLoading: true }));
      const result = await interactiveEdit(editMode.sessionId, editMode.selectedLayer!, editPrompt);
      const newUrl = `data:image/png;base64,${result.result_png_base64}`;
      setEditMode(p => ({
        ...p,
        currentImageDataUrl: newUrl,
        maskDataUrl: null,
        selectedLayer: null,
        editLoading: false,
        history: [...p.history, newUrl]
      }));
      setEditPrompt('');
      message.success('编辑应用成功');
    } catch (e) {
      message.error('编辑失败');
      setEditMode(p => ({ ...p, editLoading: false }));
    }
  };

  const openDownloadDialog = (src: string, filename?: string) => {
    setDownloadDialog({ open: true, src, filename });
  };

  // 打开换色对话框
  const handleOpenColorEdit = async (imageUrl: string) => {
    try {
      // 如果是后端URL，使用代理避免CORS问题
      const fetchUrl = imageUrl.startsWith('data:') ? imageUrl : proxyImageUrl(imageUrl);
      const res = await fetch(fetchUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setColorDialog({ open: true, imageBase64: base64 });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      message.error('图片加载失败');
    }
  };

  // 打开裁切对话框
  const handleOpenCropEdit = async (imageUrl: string) => {
    try {
      // 如果是后端URL，使用代理避免CORS问题
      const fetchUrl = imageUrl.startsWith('data:') ? imageUrl : proxyImageUrl(imageUrl);
      const res = await fetch(fetchUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setCropDialog({ open: true, imageBase64: base64 });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      message.error('图片加载失败');
    }
  };

  // 换色结果处理
  const handleColorApply = (resultBase64: string) => {
    const newUrl = `data:image/png;base64,${resultBase64}`;
    addMessage({ type: 'image', content: newUrl, isUser: false, source: 'color_edit' });
    message.success('换色完成');
  };

  // 裁切结果处理
  const handleCropConfirm = (resultBase64: string) => {
    const newUrl = `data:image/png;base64,${resultBase64}`;
    addMessage({ type: 'image', content: newUrl, isUser: false, source: 'crop_edit' });
    message.success('裁切完成');
  };

  const handleDownload = async () => {
    // 使用后端下载接口
    const encodedUrl = encodeURIComponent(downloadDialog.src);
    const downloadUrl = `${API_URL}/api/download?url=${encodedUrl}&format=${downloadFormat}`;

    // 创建隐藏的 a 标签触发下载
    const link = document.createElement('a');
    link.href = downloadUrl;
    // 设置文件名虽然在跨域时可能无效，但对于同源或后端设置 Content-Disposition 的情况有帮助
    // 后端已经设置了 attachment 和 filename，所以这里其实不用太操心 download 属性
    link.setAttribute('download', `${downloadDialog.filename || 'image'}.${downloadFormat}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadDialog({ ...downloadDialog, open: false });
  };

  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-[#f6f7f9] overflow-hidden">
      {editModeLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm text-white flex-col">
          <div className="text-xl font-bold">正在分析图片...</div>
        </div>
      )}

      <Header
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        editModeActive={editMode.active}
        onExitEditMode={() => setEditMode(initialEditModeState)}
      />

      <div className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'chat' ? (
          <>
            <ChatArea
              messages={chatHistory}
              loading={loading}
              onPreview={(src) => setImagePreview({ open: true, src })}
              onUseAsReference={(url) => {
                // 优化：对于data: URL直接使用，跳过代理加速
                if (url.startsWith('data:')) {
                  fetch(url).then(r => r.blob()).then(blob => {
                    const file = new File([blob], 'ref.png', { type: blob.type || 'image/png' });
                    setFileList([{ uid: Date.now().toString(), name: 'ref.png', status: 'done', url, originFileObj: file as any }]);
                    message.success('已添加为参考图');
                  }).catch(() => message.error('引用图片失败'));
                } else {
                  urlToFile(url, 'ref.png')
                    .then(file => {
                      setFileList([{ uid: Date.now().toString(), name: 'ref.png', status: 'done', url, originFileObj: file as any }]);
                      message.success('已添加为参考图');
                    })
                    .catch(() => message.error('引用图片失败，请重试'));
                }
              }}
              onRegenerate={async (msg) => {
                if (msg.referenceImage) {
                  // 图生图重新生成：显示参考图+指令，直接传file给handleAction
                  addMessage({ 
                    type: msg.prompt ? 'mixed' : 'image', 
                    content: msg.referenceImage, 
                    text: msg.prompt ? `重新生成：${msg.prompt}` : '重新生成', 
                    isUser: true, source: 'user', params: msg.params 
                  });
                  try {
                    const file = await urlToFile(msg.referenceImage, 'ref.png');
                    handleAction('generate', { 
                      overrideText: msg.prompt, 
                      overrideParams: msg.params, 
                      skipUserMessage: true,
                      overrideFile: file,
                      overrideRefImageUrl: msg.referenceImage,
                    });
                  } catch (err) {
                    console.error('重新生成失败:', err);
                    message.error('重新生成失败');
                  }
                } else {
                  // 文生图重新生成
                  addMessage({ 
                    type: 'text', 
                    content: `重新生成：${msg.prompt || ''}`, 
                    isUser: true, source: 'user', params: msg.params 
                  });
                  handleAction('generate', { overrideText: msg.prompt, overrideParams: msg.params, skipUserMessage: true });
                }
              }}
              onDownload={(src) => openDownloadDialog(src)}
              onEditLayer={(url) => {
                urlToFile(url, 'edit.png').then(file => enterEditMode(file));
              }}
              onColorEdit={handleOpenColorEdit}
              onCropEdit={handleOpenCropEdit}
            />
            <InputArea
              inputText={inputText}
              setInputText={setInputText}
              fileList={fileList}
              setFileList={setFileList}
              loading={loading}
              isInputLocked={loading}
              generateParams={generateParams}
              onUpdateGenerateParam={updateGenerateParam}
              onClearGenerateParam={clearGenerateParam}
              paramOrder={paramOrder}
              pendingDeleteParam={pendingDeleteParam}
              setPendingDeleteParam={setPendingDeleteParam}
              onAction={handleAction}
              onCancel={() => abortControllerRef.current?.abort()}
              onPasteImage={(e) => {
                const items = e.clipboardData.items;
                for (const item of items) {
                  if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) setFileList([{ uid: Date.now().toString(), name: file.name, status: 'done', url: URL.createObjectURL(file), originFileObj: file as any }]);
                  }
                }
              }}
              onPreviewImage={(src, name) => setImagePreview({ open: true, src, filename: name })}
            />
          </>
        ) : (
          <EditMode
            editMode={editMode}
            setEditMode={setEditMode}
            editPrompt={editPrompt}
            setEditPrompt={setEditPrompt}
            onEnterEditMode={enterEditMode}
            onCanvasClick={handleCanvasClick}
            onApplyEdit={handleApplyEdit}
            onUndo={() => {
              if (editMode.history.length > 1) {
                const newHistory = editMode.history.slice(0, -1);
                setEditMode(p => ({ ...p, currentImageDataUrl: newHistory[newHistory.length - 1], history: newHistory }));
              }
            }}
            onAddToReference={() => {
              if (editMode.currentImageDataUrl) {
                // 将 Data URL 转换为 File 对象
                fetch(editMode.currentImageDataUrl)
                  .then(res => res.blob())
                  .then(blob => {
                    const file = new File([blob], 'edited.png', { type: 'image/png' });
                    setFileList([{
                      uid: Date.now().toString(),
                      name: 'edited.png',
                      status: 'done',
                      url: editMode.currentImageDataUrl ?? undefined,
                      originFileObj: file as any,
                    }]);
                    setActiveTab('chat');
                    message.success('已加入对话');
                  });
              }
            }}
            onDownload={openDownloadDialog}
          />
        )}
      </div>

      <ImagePreviewModal
        open={imagePreview.open}
        src={imagePreview.src}
        onClose={() => setImagePreview({ ...imagePreview, open: false })}
        onCopy={() => navigator.clipboard.writeText(imagePreview.src)} // Simplification
        onDownload={() => openDownloadDialog(imagePreview.src)}
      />

      <DownloadDialog
        open={downloadDialog.open}
        onClose={() => setDownloadDialog({ ...downloadDialog, open: false })}
        onConfirm={handleDownload}
        format={downloadFormat}
        setFormat={setDownloadFormat}
      />

      {/* 换色对话框 */}
      <ColorPalettePanel
        open={colorDialog.open}
        imageBase64={colorDialog.imageBase64}
        onClose={() => setColorDialog({ open: false, imageBase64: '' })}
        onApply={handleColorApply}
      />

      {/* 裁切对话框 */}
      <CropDialog
        open={cropDialog.open}
        imageBase64={cropDialog.imageBase64}
        onClose={() => setCropDialog({ open: false, imageBase64: '' })}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
};

export default App;
