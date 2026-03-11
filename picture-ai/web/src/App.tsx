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
  interactiveEdit,
  interactiveLayers,
  proxyImageUrl,
  listChatSessions,
  createChatSession,
  updateChatSession,
  deleteChatSession as apiDeleteChatSession,
  getChatMessages,
  addChatMessage,
  listEditSessions,
  createEditSession,
  updateEditSession,
  deleteEditSession as apiDeleteEditSession,
  getEditSnapshots,
  addEditSnapshot,
} from './services/api';

import { Header } from './components/layout/Header';
import { ChatArea } from './components/chat/ChatArea';
import { InputArea } from './components/chat/InputArea';
import { ChatHistoryPanel, ChatSession } from './components/chat/ChatHistoryPanel';
import { EditMode } from './components/editor/EditMode';
import { EditSession } from './components/editor/EditHistoryPanel';
import { DownloadDialog } from './components/shared/DownloadDialog';
import { ImagePreviewModal } from './components/shared/ImagePreviewModal';
import { ColorVariantPanel } from './components/shared/ColorVariantPanel';

import { Message, GenerateParams, EditModeState, LayerItem, EditSnapshot } from './types';
import { DEFAULT_SCENE_VALUE } from './constants';

const API_URL = 'http://127.0.0.1:8000';

const initialEditModeState: EditModeState = {
  active: false,
  sessionId: null,
  currentImageDataUrl: null,
  meta: null,
  editLoading: false,
  layers: [],
  historyStack: [],
  futureStack: [],
  initialSnapshot: null,
};

// 辅助函数：将图片URL转换为小缩略图data URL
const createThumbnailDataUrl = async (imageUrl: string, maxSize = 100): Promise<string | null> => {
  try {
    // 如果已经是 data URL 且很小，直接返回
    if (imageUrl.startsWith('data:') && imageUrl.length < 50000) {
      return imageUrl;
    }
    
    // 使用 fetch 获取图片，避免 CORS tainted canvas 问题
    const fetchUrl = imageUrl.startsWith('data:') ? imageUrl : proxyImageUrl(imageUrl);
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      console.error('Failed to fetch image for thumbnail:', response.status);
      return null;
    }
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataUrl);
          } catch (e) {
            console.error('Canvas toDataURL failed:', e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(blobUrl);
        console.error('Image load error:', e);
        resolve(null);
      };
      img.src = blobUrl;
    });
  } catch (e) {
    console.error('createThumbnailDataUrl error:', e);
    return null;
  }
};

const buildColorVariantRequestText = (count: number, colorScheme: string[] | null) => {
  if (colorScheme && colorScheme.length > 0) {
    return `生成${count}个${colorScheme.join('、')}套色图片。`;
  }
  return `生成${count}个套色图片。`;
};

const buildColorVariantResultText = (count: number, colorScheme: string[] | null) => {
  if (colorScheme && colorScheme.length > 0) {
    return `已生成${count}张${colorScheme.join('、')}套色图片`;
  }
  return `已生成${count}张套色图片`;
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

  // --- Per-Session Input State Cache ---
  // 每个会话独立的输入框状态缓存
  const sessionInputCacheRef = useRef<Map<string, { inputText: string; fileList: UploadFile[] }>>(new Map());

  // --- Chat Session Management ---
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null);

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
  const [segmentProgress, setSegmentProgress] = useState(0);
  
  // Pending file for edit mode (lifted to preserve across tab switches)
  const [editPendingFile, setEditPendingFile] = useState<File | null>(null);
  const [editPendingFilePreview, setEditPendingFilePreview] = useState<string | null>(null);

  // --- Edit Session Management ---
  const [editSessions, setEditSessions] = useState<EditSession[]>([]);
  const [currentEditSessionId, setCurrentEditSessionId] = useState<string | null>(null);


  // --- Helper State ---
  const [downloadDialog, setDownloadDialog] = useState<{ open: boolean; src: string; filename?: string }>({ open: false, src: '' });
  const [downloadFormat, setDownloadFormat] = useState('png');

  // --- Color Dialog State ---
  const [colorDialog, setColorDialog] = useState<{ open: boolean; imageBase64: string }>({ open: false, imageBase64: '' });
  const pendingColorVariantSessionRef = useRef<string | null>(null);

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

  const addMessage = useCallback((msg: Message, overrideSessionId?: string) => {
    setChatHistory((prev) => [...prev, msg]);
    // Update session metadata & persist to database
    const sessionId = overrideSessionId || currentChatSessionId;
    if (sessionId) {
      // Update local state - 先立即更新基本信息
      setChatSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        const userText = msg.isUser ? (msg.type === 'text' ? msg.content : msg.text) : undefined;
        
        // 计算首次指令: 只在第一条用户文本消息时设置
        let newFirstPrompt = s.firstPrompt;
        if (!newFirstPrompt && userText) {
          if (userText) {
            newFirstPrompt = userText.slice(0, 50);
          }
        }
        
        return { 
          ...s, 
          messageCount: s.messageCount + 1, 
          updatedAt: new Date(),
          title: s.title || (userText ? userText.slice(0, 20) : s.title),
          firstPrompt: newFirstPrompt,
        };
      }));
      
      // 如果是AI返回的图片，异步创建缩略图并更新
      if (!msg.isUser && (msg.type === 'image' || msg.type === 'mixed')) {
        const currentSession = chatSessions.find(s => s.id === sessionId);
        if (!currentSession?.thumbnail) {
          createThumbnailDataUrl(msg.content).then(thumbnailDataUrl => {
            if (thumbnailDataUrl) {
              setChatSessions(prev => prev.map(s => 
                s.id === sessionId && !s.thumbnail 
                  ? { ...s, thumbnail: thumbnailDataUrl } 
                  : s
              ));
              // 保存到数据库
              updateChatSession(sessionId, { thumbnail: thumbnailDataUrl })
                .catch(err => console.error('Failed to save thumbnail:', err));
            }
          });
        }
      }
      
      // Persist message to database (async, don't await)
      addChatMessage(sessionId, {
        type: msg.type,
        content: msg.content,
        text: msg.text,
        prompt: msg.prompt,
        referenceImage: msg.referenceImage,
        source: msg.source,
        params: msg.params,
        images: msg.images,
        colorVariantConfig: msg.colorVariantConfig,
        isUser: msg.isUser,
      }).catch(err => console.error('Failed to save message:', err));
      // Update session title and firstPrompt if needed - 只在用户首次发送文本消息时更新
      const session = chatSessions.find(s => s.id === sessionId);
      if (session && msg.isUser) {
        const userText = msg.type === 'text' ? msg.content : msg.text;
        const updates: { title?: string; firstPrompt?: string } = {};
        if (!session.title && userText) {
          updates.title = userText.slice(0, 20);
        }
        if (!session.firstPrompt && userText) {
          updates.firstPrompt = userText.slice(0, 50);
        }
        if (Object.keys(updates).length > 0) {
          updateChatSession(sessionId, updates)
            .catch(err => console.error('Failed to update session:', err));
        }
      }
    }
  }, [currentChatSessionId, chatSessions]);

  // --- Load Sessions on Mount ---
  useEffect(() => {
    // Load chat sessions
    listChatSessions().then(sessions => {
      setChatSessions(sessions.map(s => ({
        id: s.id,
        title: s.title,
        thumbnail: s.thumbnail || undefined,
        firstPrompt: s.firstPrompt || undefined,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        messageCount: s.messageCount,
      })));
    }).catch(err => console.error('Failed to load chat sessions:', err));

    // Load edit sessions
    listEditSessions().then(sessions => {
      setEditSessions(sessions.map(s => ({
        id: s.id,
        title: s.title,
        thumbnail: s.thumbnail || s.originalImage || undefined,
        layerCount: s.layerCount,
        stepCount: s.stepCount,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        meta: s.meta,
      })));
    }).catch(err => console.error('Failed to load edit sessions:', err));
  }, []);

  // --- Chat Session Handlers ---
  const handleCreateNewChatSession = useCallback(async () => {
    try {
      // 保存当前会话的输入状态
      if (currentChatSessionId) {
        sessionInputCacheRef.current.set(currentChatSessionId, { inputText, fileList });
      }
      
      const session = await createChatSession({ title: '' });
      const newSession: ChatSession = {
        id: session.id,
        title: session.title,
        thumbnail: session.thumbnail || undefined,
        firstPrompt: session.firstPrompt || undefined,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        messageCount: session.messageCount,
      };
      setChatSessions(prev => [newSession, ...prev]);
      setCurrentChatSessionId(newSession.id);
      setChatHistory([]);
      // 新会话输入框清空
      setInputText('');
      setFileList([]);
    } catch (err) {
      console.error('Failed to create chat session:', err);
      message.error('创建会话失败');
    }
  }, [currentChatSessionId, inputText, fileList]);

  const handleSelectChatSession = useCallback(async (sessionId: string) => {
    // 如果选择的是当前会话，不做任何操作
    if (sessionId === currentChatSessionId) return;
    
    // 保存当前会话的输入状态
    if (currentChatSessionId) {
      sessionInputCacheRef.current.set(currentChatSessionId, { inputText, fileList });
    }
    
    setCurrentChatSessionId(sessionId);
    
    // 恢复目标会话的输入状态
    const cachedInput = sessionInputCacheRef.current.get(sessionId);
    if (cachedInput) {
      setInputText(cachedInput.inputText);
      setFileList(cachedInput.fileList);
    } else {
      // 如果没有缓存，清空输入框
      setInputText('');
      setFileList([]);
    }
    
    // Load messages from database
    try {
      const messages = await getChatMessages(sessionId);
      const loadedHistory: Message[] = messages.map(m => ({
        type: (m.type as Message['type']) || 'text',
        content: m.content,
        images: m.images || undefined,
        text: m.text || undefined,
        prompt: m.prompt || undefined,
        referenceImage: m.referenceImage || undefined,
        source: (m.source as Message['source']) || (m.isUser ? 'user' : 'generate'),
        params: m.params as Message['params'],
        colorVariantConfig: m.colorVariantConfig || undefined,
        isUser: m.isUser,
      }));
      setChatHistory(loadedHistory);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
      setChatHistory([]);
    }
  }, [currentChatSessionId, inputText, fileList]);

  const handleDeleteChatSession = useCallback(async (sessionId: string) => {
    try {
      await apiDeleteChatSession(sessionId);
      // 清理该会话的输入状态缓存
      sessionInputCacheRef.current.delete(sessionId);
      setChatSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentChatSessionId === sessionId) {
        setCurrentChatSessionId(null);
        setChatHistory([]);
        setInputText('');
        setFileList([]);
      }
    } catch (err) {
      console.error('Failed to delete chat session:', err);
      message.error('删除会话失败');
    }
  }, [currentChatSessionId]);

  // --- Edit Session Handlers ---
  const handleCreateNewEditSession = useCallback(() => {
    setEditMode(initialEditModeState);
    setEditPrompt('');
    setCurrentEditSessionId(null);
  }, []);

  const handleSelectEditSession = useCallback(async (sessionId: string) => {
    setCurrentEditSessionId(sessionId);
    // Load edit session snapshots and restore state
    try {
      const snapshots = await getEditSnapshots(sessionId);
      if (snapshots.length > 0) {
        // Restore to the latest snapshot
        const latestSnapshot = snapshots[snapshots.length - 1];
        const layers = latestSnapshot.layers as unknown as LayerItem[];
        const historySnapshots = snapshots.map(s => ({
          imageDataUrl: s.imageDataUrl,
          layers: s.layers as unknown as LayerItem[],
        }));
        const session = editSessions.find(s => s.id === sessionId);
        setEditMode({
          active: true,
          sessionId: sessionId,
          currentImageDataUrl: latestSnapshot.imageDataUrl,
          meta: session?.meta as EditModeState['meta'] || null,
          editLoading: false,
          layers,
          historyStack: historySnapshots,
          futureStack: [],
          initialSnapshot: historySnapshots[0],
        });
        setActiveTab('edit');
      }
    } catch (err) {
      console.error('Failed to load edit session:', err);
      message.error('加载编辑会话失败');
    }
  }, [editSessions]);

  const handleDeleteEditSession = useCallback(async (sessionId: string) => {
    try {
      await apiDeleteEditSession(sessionId);
      setEditSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentEditSessionId === sessionId) {
        setCurrentEditSessionId(null);
        setEditMode(initialEditModeState);
      }
    } catch (err) {
      console.error('Failed to delete edit session:', err);
      message.error('删除编辑会话失败');
    }
  }, [currentEditSessionId]);

  const cloneLayers = (layers: LayerItem[]) => layers.map(l => ({ ...l }));
  const buildSnapshot = (imageDataUrl: string, layers: LayerItem[]): EditSnapshot => ({
    imageDataUrl,
    layers: cloneLayers(layers),
  });

  const urlToFile = async (url: string, filename: string): Promise<File> => {
    // 如果是后端URL，使用代理避免CORS问题
    const fetchUrl = url.startsWith('data:') ? url : proxyImageUrl(url);
    const response = await fetch(fetchUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  };

  // --- 确保有活跃的会话 ---
  const ensureChatSession = async (): Promise<string> => {
    if (currentChatSessionId) {
      return currentChatSessionId;
    }
    // 自动创建新会话
    try {
      const session = await createChatSession({ title: '' });
      const newSession: ChatSession = {
        id: session.id,
        title: session.title,
        thumbnail: session.thumbnail || undefined,
        firstPrompt: session.firstPrompt || undefined,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
        messageCount: session.messageCount,
      };
      setChatSessions(prev => [newSession, ...prev]);
      setCurrentChatSessionId(newSession.id);
      return newSession.id;
    } catch (err) {
      console.error('Failed to create chat session:', err);
      throw err;
    }
  };

  // --- Action Handlers ---
  const handleAction = async (currentMode: 'search' | 'generate', options?: any) => {
    // 确保有活跃会话
    const sessionId = await ensureChatSession();
    
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
          addMessage({ type: effectiveText ? 'mixed' : 'image', content: reader.result as string, text: effectiveText, isUser: true, source: 'user', params: currentMode === 'generate' ? paramsForRequest : undefined }, sessionId);
        };
        reader.readAsDataURL(fileToUpload);
      }
    } else if (!skipUserMessage) {
      addMessage({ type: 'text', content: effectiveText, isUser: true, source: 'user', params: currentMode === 'generate' ? paramsForRequest : undefined }, sessionId);
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
        if (currentMode === 'generate' && results.length > 1) {
          // 多张图使用网格布局
          const urls = results.map((item: any) => 
            item.startsWith('/') ? `${API_URL}${item}` : item
          );
          addMessage({ 
            type: 'image_grid', 
            content: `生成了 ${results.length} 张图片`,
            images: urls,
            isUser: false, 
            source: 'generate',
            prompt: effectiveText, 
            params: paramsForRequest,
            referenceImage: referenceImageDataUrl || refImageUrl,
          }, sessionId);
        } else {
          // 单张图或搜索结果
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
            }, sessionId);
          });
        }
      } else {
        addMessage({ type: 'text', content: '未找到结果', isUser: false }, sessionId);
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
  const enterEditMode = async (file: File, options?: { layer_count?: number }) => {
    setEditModeLoading(true);
    setSegmentProgress(5);
    const timer = window.setInterval(() => {
      setSegmentProgress((p) => (p >= 92 ? p : p + Math.max(1, Math.floor((95 - p) / 6))));
    }, 600);

    try {
      const result = await interactiveUpload(file, options);
      const layerResult = await interactiveLayers(result.session_id);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const layers: LayerItem[] = layerResult.layers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          visible: true,
          deleted: false,
          selected: false,
          thumbnail: `data:image/png;base64,${layer.thumbnail_png_base64}`,
          maskDataUrl: `data:image/png;base64,${layer.mask_png_base64}`,
        }));
        const imageDataUrl = reader.result as string;
        const initialSnapshot = buildSnapshot(imageDataUrl, layers);
        setSegmentProgress(100);

        // Create edit session in database
        try {
          const editSession = await createEditSession({
            title: file.name.replace(/\.[^/.]+$/, ''),
            thumbnail: imageDataUrl.length < 100000 ? imageDataUrl : undefined, // Only store small thumbnails
            originalImage: imageDataUrl,
            layerCount: layers.length,
            meta: result.meta,
          });
          
          // Save initial snapshot
          await addEditSnapshot(editSession.id, {
            stepIndex: 0,
            imageDataUrl,
            layers: layers as unknown as Record<string, unknown>[],
          });

          // Update local state
          setEditSessions(prev => [{
            id: editSession.id,
            title: editSession.title,
            thumbnail: editSession.thumbnail || editSession.originalImage || undefined,
            layerCount: editSession.layerCount,
            stepCount: 1,
            createdAt: new Date(editSession.createdAt),
            updatedAt: new Date(editSession.updatedAt),
          }, ...prev]);
          setCurrentEditSessionId(editSession.id);
        } catch (err) {
          console.error('Failed to save edit session:', err);
        }

        setEditMode({
          active: true,
          sessionId: result.session_id,
          currentImageDataUrl: imageDataUrl,
          meta: result.meta,
          editLoading: false,
          layers,
          historyStack: [initialSnapshot],
          futureStack: [],
          initialSnapshot,
        });
        setActiveTab('edit');
      };
    } catch (e: any) {
      console.error('Enter edit mode failed:', e);
      // 提供更详细的错误信息
      const errorMsg = e?.message || '未知错误';
      if (errorMsg.includes('500')) {
        message.error('分层服务暂时不可用，请稍后重试');
      } else if (errorMsg.includes('format') || errorMsg.includes('unsupported')) {
        message.error('不支持的图片格式，请使用 PNG、JPG 或 WEBP');
      } else {
        message.error(`进入编辑模式失败: ${errorMsg}`);
      }
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => {
        setEditModeLoading(false);
        setSegmentProgress(0);
      }, 250);
    }
  };


  const handleUndo = () => {
    setEditMode(prev => {
      if (prev.historyStack.length <= 1) return prev;
      const newHistory = prev.historyStack.slice(0, -1);
      const lastSnapshot = newHistory[newHistory.length - 1];
      return {
        ...prev,
        currentImageDataUrl: lastSnapshot.imageDataUrl,
        layers: cloneLayers(lastSnapshot.layers),
        historyStack: newHistory,
        futureStack: [prev.historyStack[prev.historyStack.length - 1], ...prev.futureStack],
      };
    });
  };

  const handleRestore = () => {
    setEditMode(prev => {
      if (prev.futureStack.length === 0) return prev;
      const [nextSnapshot, ...restFuture] = prev.futureStack;
      return {
        ...prev,
        currentImageDataUrl: nextSnapshot.imageDataUrl,
        layers: cloneLayers(nextSnapshot.layers),
        historyStack: [...prev.historyStack, nextSnapshot],
        futureStack: restFuture,
      };
    });
  };

  const handleReset = () => {
    setEditMode(prev => {
      if (!prev.initialSnapshot) return prev;
      return {
        ...prev,
        currentImageDataUrl: prev.initialSnapshot.imageDataUrl,
        layers: cloneLayers(prev.initialSnapshot.layers),
        historyStack: [prev.initialSnapshot],
        futureStack: [],
      };
    });
  };

  const toggleLayerSelected = (layerId: string) => {
    pushLayerSnapshot((layers) => layers.map(l => {
      if (l.id !== layerId) return l;
      if (l.deleted) return l;
      if (!l.visible) return { ...l, selected: false };
      return { ...l, selected: !l.selected };
    }));
  };

  const toggleLayerVisible = (layerId: string) => {
    pushLayerSnapshot((layers) => layers.map(l =>
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ));
  };

  const deleteLayer = (layerId: string) => {
    pushLayerSnapshot((layers) => layers.map(l =>
      l.id === layerId ? { ...l, deleted: true, selected: false } : l
    ));
  };

  const handleApplyEdit = async () => {
    if (!editMode.sessionId || !editPrompt) return;
    const selectedLayers = editMode.layers.filter(l => l.selected && !l.deleted).map(l => l.id);
    if (selectedLayers.length === 0) {
      message.warning('请先选择图层');
      return;
    }
    try {
      setEditMode(p => ({ ...p, editLoading: true }));
      const result = await interactiveEdit(editMode.sessionId, selectedLayers, editPrompt);
      const newUrl = `data:image/png;base64,${result.result_png_base64}`;
      
      setEditMode(p => {
        const nextLayers = p.layers.map(l => ({ ...l, selected: false }));
        const nextSnapshot = buildSnapshot(newUrl, nextLayers);
        const newHistoryStack = [...p.historyStack, nextSnapshot];
        
        // Save snapshot to database
        if (currentEditSessionId) {
          addEditSnapshot(currentEditSessionId, {
            stepIndex: newHistoryStack.length - 1,
            imageDataUrl: newUrl,
            layers: nextLayers as unknown as Record<string, unknown>[],
            prompt: editPrompt,
          }).then(() => {
            // Update session step count in local state
            setEditSessions(prev => prev.map(s => 
              s.id === currentEditSessionId 
                ? { ...s, stepCount: newHistoryStack.length, updatedAt: new Date() } 
                : s
            ));
            // Also update in database
            updateEditSession(currentEditSessionId, { stepCount: newHistoryStack.length })
              .catch(err => console.error('Failed to update edit session:', err));
          }).catch(err => console.error('Failed to save edit snapshot:', err));
        }
        
        return {
          ...p,
          currentImageDataUrl: newUrl,
          editLoading: false,
          layers: nextLayers,
          historyStack: newHistoryStack,
          futureStack: [],
        };
      });
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

  const pushLayerSnapshot = (updater: (layers: LayerItem[]) => LayerItem[]) => {
    setEditMode(prev => {
      if (!prev.currentImageDataUrl) return prev;
      const nextLayers = updater(prev.layers.map(l => ({ ...l })));
      const nextSnapshot = buildSnapshot(prev.currentImageDataUrl, nextLayers);
      return {
        ...prev,
        layers: nextLayers,
        historyStack: [...prev.historyStack, nextSnapshot],
        futureStack: [],
      };
    });
  };

  // 打开套色对话框
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

  // 套色确认回调 - 处理完整的请求流程
  const handleColorVariantConfirm = useCallback(async (config: NonNullable<Message['colorVariantConfig']>) => {
    const sessionId = await ensureChatSession();
    pendingColorVariantSessionRef.current = sessionId;

    const originalImage = config.originalImageBase64.includes(',')
      ? config.originalImageBase64
      : `data:image/png;base64,${config.originalImageBase64}`;

    // 先添加用户消息
    addMessage({
      type: 'mixed',
      content: originalImage,
      text: buildColorVariantRequestText(config.count, config.colorScheme),
      isUser: true,
      source: 'user',
    }, sessionId);

    // 支持取消
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setLoading(true);
    
    try {
      const res = await fetch(`${API_URL}/api/color-variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: originalImage,
          count: config.count,
          color_scheme: config.colorScheme,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '套色生成失败');
      }

      const data = await res.json();
      if (data.success && data.urls && data.urls.length > 0) {
        message.success(`成功生成 ${data.urls.length} 张套色图`);
        // 添加结果消息
        addMessage({ 
          type: 'image_grid', 
          content: buildColorVariantResultText(data.urls.length, config.colorScheme),
          images: data.urls,
          isUser: false, 
          source: 'color_variant',
          referenceImage: originalImage,
          colorVariantConfig: config,
        }, sessionId);
      } else {
        throw new Error('未能生成套色图');
      }
    } catch (e: any) {
      pendingColorVariantSessionRef.current = null;
      setLoading(false);
      if (e instanceof DOMException && e.name === 'AbortError') {
        message.info('已取消套色生成');
        return;
      }
      message.error(e.message || '套色生成失败');
    }
  }, [addMessage, ensureChatSession]);

  // 重新生成套色
  const handleRegenerateColorVariant = async (config: NonNullable<Message['colorVariantConfig']>) => {
    // 确保有活跃会话
    const sessionId = await ensureChatSession();
    pendingColorVariantSessionRef.current = sessionId;
    
    // 先添加用户消息（原图+命令）
    const originalImage = config.originalImageBase64.includes(',')
      ? config.originalImageBase64
      : `data:image/png;base64,${config.originalImageBase64}`;
    
    addMessage({
      type: 'mixed',
      content: originalImage,
      text: `重新${buildColorVariantRequestText(config.count, config.colorScheme)}`,
      isUser: true,
      source: 'user',
    }, sessionId);

    // 支持取消
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/color-variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: originalImage,
          count: config.count,
          color_scheme: config.colorScheme,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '套色生成失败');
      }

      const data = await res.json();
      if (data.success && data.urls && data.urls.length > 0) {
        message.success(`成功生成 ${data.urls.length} 张套色图`);
        // 添加结果消息
        addMessage({ 
          type: 'image_grid', 
          content: buildColorVariantResultText(data.urls.length, config.colorScheme),
          images: data.urls,
          isUser: false, 
          source: 'color_variant',
          referenceImage: originalImage,
          colorVariantConfig: config,
        }, sessionId);
      } else {
        throw new Error('未能生成套色图');
      }
    } catch (e: any) {
      pendingColorVariantSessionRef.current = null;
      setLoading(false);
      if (e instanceof DOMException && e.name === 'AbortError') {
        message.info('已取消套色生成');
        return;
      }
      message.error(e.message || '重新生成套色失败');
    }
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
    <div className="relative flex flex-col h-screen overflow-hidden bg-[#fcfcff]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(950px_520px_at_50%_36%,rgba(214,196,255,0.35),rgba(255,255,255,0)_68%),linear-gradient(180deg,#ffffff_0%,#fcfbff_42%,#ffffff_100%)]" />
      {editModeLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm text-white flex-col">
          <div className="text-xl font-bold">正在分层...</div>
          <div className="text-sm text-white/80 mt-2">{Math.round(segmentProgress)}%</div>
        </div>
      )}


      <Header
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        editModeActive={editMode.active}
        onExitEditMode={() => setEditMode(initialEditModeState)}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'chat' ? (
          <>
            {/* Chat 页面布局：左侧边栏 + 中间内容 */}
            <div className="flex-1 flex gap-4 p-4 overflow-hidden">
              {/* 左侧历史边栏 - flex布局，动态宽度 */}
              <ChatHistoryPanel
                sessions={chatSessions}
                currentSessionId={currentChatSessionId}
                onSelectSession={handleSelectChatSession}
                onNewSession={handleCreateNewChatSession}
                onDeleteSession={handleDeleteChatSession}
              />
              
              {/* 中间内容区域 - 对称布局，relative用于InputArea定位 */}
              <div className="flex-1 min-w-0 overflow-hidden relative">
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
                // 跳转到分层编辑页面并显示图片预览，由用户选择是否开始分层
                urlToFile(url, 'edit.png').then(file => {
                  setEditPendingFile(file);
                  setEditPendingFilePreview(url);
                  setActiveTab('edit');
                });
              }}
              onColorEdit={handleOpenColorEdit}
              onRegenerateColorVariant={handleRegenerateColorVariant}
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
              </div>
            </div>
          </>
        ) : (
          <EditMode
            editMode={editMode}
            setEditMode={setEditMode}
            editPrompt={editPrompt}
            setEditPrompt={setEditPrompt}
            onNewEditSession={handleCreateNewEditSession}
            onEnterEditMode={enterEditMode}
            onApplyEdit={handleApplyEdit}
            onUndo={handleUndo}
            onRestore={handleRestore}
            onReset={handleReset}
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
            onToggleLayerSelected={toggleLayerSelected}
            onToggleLayerVisible={toggleLayerVisible}
            onDeleteLayer={deleteLayer}
            segmenting={editModeLoading}
            segmentProgress={segmentProgress}
            pendingFile={editPendingFile}
            setPendingFile={setEditPendingFile}
            pendingFilePreview={editPendingFilePreview}
            setPendingFilePreview={setEditPendingFilePreview}
          />

        )}
      </main>

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

      {/* 套色对话框 */}
      <ColorVariantPanel
        open={colorDialog.open}
        imageBase64={colorDialog.imageBase64}
        onClose={() => setColorDialog({ open: false, imageBase64: '' })}
        onConfirm={handleColorVariantConfirm}
      />

    </div>
  );
};

export default App;
