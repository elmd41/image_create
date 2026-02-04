/**
 * 主应用组件
 * ==========
 *
 * Picture AI 的主界面，提供:
 * - 图片搜索 (Search): 文本/图片 -> 相似图片
 * - 图片生成 (Generate): 文本/图片 -> AI 生成图片
 *
 * 采用聊天式界面设计，支持多轮对话
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Input,
  Button,
  Upload,
  message,
  List,
  Space,
  Typography,
  Tooltip,
  Image,
  Modal,
  Select,
  Popover,
} from 'antd';
import {
  PictureOutlined,
  LinkOutlined,
  ReloadOutlined,
  CopyOutlined,
  DownloadOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { search, generate } from './services/api';

// ==================== 常量 ====================

const API_URL = 'http://127.0.0.1:8000';

// 下拉选项配置
const STYLE_OPTIONS = [
  { value: '波斯风', label: '波斯风' },
  { value: '土耳其', label: '土耳其' },
  { value: '高加索', label: '高加索' },
  { value: '摩洛哥', label: '摩洛哥' },
  { value: '硬度手工风', label: '硬度手工风' },
  { value: '中式古典', label: '中式古典' },
  { value: '北欧极简', label: '北欧极简' },
];

const RATIO_OPTIONS = [
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '满铺', label: '满铺' },
];

const COLOR_OPTIONS = [
  { value: '红色', label: '红色' },
  { value: '蓝色', label: '蓝色' },
  { value: '绿色', label: '绿色' },
];

const DEFAULT_SCENE_VALUE = '平面设计图';

const SCENE_OPTIONS = [
  { value: DEFAULT_SCENE_VALUE, label: '平面设计图（默认值）' },
  { value: '场景透视', label: '场景透视（室内摆拍）' },
  { value: '阳光照射', label: '阳光照射（窗光投影）' },
  { value: '棚拍产品图', label: '棚拍产品图（白棚柔光）' },
  { value: '木地板场景', label: '木地板场景（温暖家居）' },
  { value: '家具虚化背景', label: '家具虚化背景（空间感）' },
  { value: '纹理细节', label: '纹理细节（局部特写）' },
  { value: '3D渲染', label: '3D渲染（效果图）' },
];

// ==================== 类型定义 ====================

interface Message {
  type: 'text' | 'image' | 'mixed';
  content: string;
  text?: string;
  prompt?: string;
  referenceImage?: string;
  source?: 'user' | 'search' | 'generate';
  params?: {
    style?: string;
    ratio?: string;
    color?: string;
    scene?: string;
  };
  isUser: boolean;
}

interface GenerateParams {
  style: string;
  ratio: string;
  color: string;
  scene: string;
}

type GenerateParamKey = keyof GenerateParams;

const PARAM_LABELS: Record<GenerateParamKey, string> = {
  style: '风格流派',
  ratio: '比例',
  color: '主体颜色',
  scene: '场景/图结构',
};

const PARAM_ORDER_DEFAULT: GenerateParamKey[] = ['style', 'ratio', 'color', 'scene'];

const isSceneActive = (scene: string) => !!(scene && scene !== DEFAULT_SCENE_VALUE);

const hsvToRgb = (h: number, s: number, v: number) => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h >= 0 && h < 60) {
    r1 = c;
    g1 = x;
  } else if (h >= 60 && h < 120) {
    r1 = x;
    g1 = c;
  } else if (h >= 120 && h < 180) {
    g1 = c;
    b1 = x;
  } else if (h >= 180 && h < 240) {
    g1 = x;
    b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

const RgbPalettePicker: React.FC<{
  value?: string;
  onChange: (hex: string) => void;
  onPick?: () => void;
}> = ({ value, onChange, onPick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverHex, setHoverHex] = useState<string>(value || '#FFFFFF');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const width = 240;
  const height = 160;

  const getHexAt = useCallback(
    (x: number, y: number) => {
      const h = (x / (width - 1)) * 360;
      const s = 1 - y / (height - 1);
      const { r, g, b } = hsvToRgb(h, Math.max(0, Math.min(1, s)), 1);
      return rgbToHex(r, g, b);
    },
    [width, height]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const h = (x / (width - 1)) * 360;
        const s = 1 - y / (height - 1);
        const { r, g, b } = hsvToRgb(h, Math.max(0, Math.min(1, s)), 1);
        const idx = (y * width + x) * 4;
        image.data[idx] = r;
        image.data[idx + 1] = g;
        image.data[idx + 2] = b;
        image.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [width, height]);

  useEffect(() => {
    if (value) setHoverHex(value);
  }, [value]);

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(width - 1, Math.round(e.clientX - rect.left)));
      const y = Math.max(0, Math.min(height - 1, Math.round(e.clientY - rect.top)));
      setCursorPos({ x, y });
      setHoverHex(getHexAt(x, y));
    },
    [getHexAt, width, height]
  );

  const handlePick = useCallback(
    () => {
      onChange(hoverHex);
      onPick?.();
    },
    [hoverHex, onChange, onPick]
  );

  return (
    <div style={styles.rgbPickerContainer}>
      <div style={styles.rgbPickerPreviewRow}>
        <div style={{ ...styles.rgbPickerSwatchLarge, background: hoverHex }} />
        <div style={styles.rgbPickerHexText}>{hoverHex}</div>
      </div>
      <div style={styles.rgbPickerCanvasWrap}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={styles.rgbPickerCanvas}
          onMouseMove={handleMove}
          onMouseLeave={() => setCursorPos(null)}
          onClick={handlePick}
        />
        {cursorPos && (
          <div
            style={{
              ...styles.rgbPickerCursor,
              left: cursorPos.x - 6,
              top: cursorPos.y - 6,
            }}
          />
        )}
      </div>
      <div style={styles.rgbPickerHint}>移动鼠标预览，点击选择</div>
    </div>
  );
};

// ==================== 主组件 ====================

const App: React.FC = () => {
  // 状态
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  // 生成参数状态
  const [generateParams, setGenerateParams] = useState<GenerateParams>({
    style: '',
    ratio: '',
    color: '',
    scene: DEFAULT_SCENE_VALUE,
  });
  const [paramOrder, setParamOrder] = useState<GenerateParamKey[]>([]);
  const [pendingDeleteParam, setPendingDeleteParam] = useState<GenerateParamKey | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [downloadDialog, setDownloadDialog] = useState<{
    open: boolean;
    src: string;
    filename?: string;
  }>({ open: false, src: '' });
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpg' | 'webp' | 'bmp' | 'tiff'>('png');
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    src: string;
    filename?: string;
  }>({ open: false, src: '' });
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatAreaRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasText = inputText.trim().length > 0;
  const hasImage = fileList.length > 0;
  const showSceneChip = isSceneActive(generateParams.scene);
  const hasParams = !!(generateParams.style || generateParams.ratio || generateParams.color || showSceneChip);
  const paramOrderForDisplay = [...paramOrder, ...PARAM_ORDER_DEFAULT.filter((k) => !paramOrder.includes(k))];
  const isInputLocked = loading;
  const isSearchDisabled = loading || (!hasText && !hasImage);
  const isGenerateDisabled = loading || (!hasText && !hasImage && !hasParams);

  const buildParamsPrompt = useCallback(
    (params?: GenerateParams | Partial<GenerateParams>, orderOverride?: GenerateParamKey[]) => {
      const resolved = params ?? generateParams;
      const order = orderOverride ?? paramOrder;
      const parts: string[] = [];
      const add = (key: GenerateParamKey) => {
        if (key === 'style' && resolved.style) parts.push(`${PARAM_LABELS.style}：${resolved.style}`);
        if (key === 'ratio' && resolved.ratio) parts.push(`${PARAM_LABELS.ratio}：${resolved.ratio}`);
        if (key === 'color' && resolved.color) parts.push(`${PARAM_LABELS.color}：${resolved.color}`);
        if (key === 'scene' && resolved.scene && resolved.scene !== DEFAULT_SCENE_VALUE) {
          parts.push(`${PARAM_LABELS.scene}：${resolved.scene}`);
        }
      };
      order.forEach(add);
      PARAM_ORDER_DEFAULT.forEach((k) => {
        if (!order.includes(k)) add(k);
      });
      return parts.join('，');
    },
    [generateParams, paramOrder]
  );

  const updateGenerateParam = useCallback((key: GenerateParamKey, value: string) => {
    setGenerateParams((prev) => ({ ...prev, [key]: value }));
    setParamOrder((prev) => {
      const normalizedValue = key === 'scene' ? (isSceneActive(value) ? value : '') : value;
      if (!normalizedValue) return prev.filter((k) => k !== key);
      if (prev.includes(key)) return prev;
      return [...prev.filter((k) => k !== key), key];
    });
    setPendingDeleteParam(null);
  }, []);

  const clearGenerateParam = useCallback((key: GenerateParamKey) => {
    setGenerateParams((prev) => ({ ...prev, [key]: key === 'scene' ? DEFAULT_SCENE_VALUE : '' }));
    setParamOrder((prev) => prev.filter((k) => k !== key));
    setPendingDeleteParam(null);
    if (key === 'color') setColorPickerOpen(false);
  }, []);

  const messages = chatHistory;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatAreaRef.current) {
        chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
      }
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  const openImagePreview = useCallback((src: string, filename?: string) => {
    if (!src) return;
    setImagePreview({ open: true, src, filename });
  }, []);

  const closeImagePreview = useCallback(() => {
    setImagePreview((prev) => ({ ...prev, open: false }));
  }, []);

  // ==================== 消息处理 ====================

  const addMessage = useCallback((msg: Message) => {
    setChatHistory((prev) => [...prev, msg]);
  }, []);

  // ==================== 图片处理 ====================

  const urlToFile = async (url: string, filename: string): Promise<File> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'image/png' });
  };

  const copyImageToClipboard = useCallback(async (src: string) => {
    if (!src) return;
    try {
      const response = await fetch(src);
      const blob = await response.blob();

      const clipboardAny = navigator.clipboard as any;
      const ClipboardItemAny = (window as any).ClipboardItem;

      if (clipboardAny?.write && ClipboardItemAny) {
        await clipboardAny.write([
          new ClipboardItemAny({
            [blob.type || 'image/png']: blob,
          }),
        ]);
        message.success('已复制图片到剪贴板');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(src);
        message.success('已复制图片链接');
      } else {
        message.error('当前浏览器不支持复制');
      }
    } catch (error) {
      console.error('复制图片失败:', error);
      message.error('复制失败');
    }
  }, []);

  const openDownloadDialog = useCallback((src: string, filename?: string) => {
    if (!src) return;
    setDownloadFormat('png');
    setDownloadDialog({ open: true, src, filename });
  }, []);

  const closeDownloadDialog = useCallback(() => {
    setDownloadDialog({ open: false, src: '' });
  }, []);

  const handleConfirmDownload = useCallback(async () => {
    if (!downloadDialog.src) return;

    const format = downloadFormat;
    const mimeMap: Record<typeof format, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      webp: 'image/webp',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
    };

    const baseName = (downloadDialog.filename || 'image').replace(/\.[a-z0-9]+$/i, '');

    const blobToBitmap = async (
      blob: Blob
    ): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }> => {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (ctx) => {
            ctx.drawImage(bitmap, 0, 0);
          },
        };
      }
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new window.Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('图片加载失败'));
          el.src = url;
        });
        return {
          width: img.naturalWidth,
          height: img.naturalHeight,
          draw: (ctx) => {
            ctx.drawImage(img, 0, 0);
          },
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    try {
      message.loading({ content: '准备下载...', key: 'download' });
      const src = downloadDialog.src;
      const isHttpUrl = /^https?:\/\//i.test(src);
      const fetchUrl = isHttpUrl ? `${API_URL}/api/proxy-image?url=${encodeURIComponent(src)}` : src;
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status}`);
      }
      const srcBlob = await response.blob();

      const canvas = document.createElement('canvas');
      const { width, height, draw } = await blobToBitmap(srcBlob);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 初始化失败');
      }
      draw(ctx);

      const outBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, mimeMap[format], format === 'jpg' ? 0.92 : undefined);
      });

      if (!outBlob) {
        throw new Error('浏览器不支持该格式导出');
      }

      const objectUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${baseName}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      closeDownloadDialog();
      message.success({ content: '已开始下载', key: 'download' });
    } catch (error) {
      console.error('下载失败:', error);
      const errorMsg = error instanceof Error ? error.message : '下载失败';
      message.error({ content: errorMsg, key: 'download' });
    }
  }, [closeDownloadDialog, downloadDialog.filename, downloadDialog.src, downloadFormat]);

  const handlePasteImage = (e: React.ClipboardEvent) => {
    if (loading) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;

        const uid = `${Date.now()}`;
        const uploadFile: UploadFile = {
          uid,
          name: file.name || `pasted_image_${uid}.png`,
          status: 'done',
          url: URL.createObjectURL(file),
          originFileObj: file as any,
        };

        setFileList([uploadFile]);
        message.success('已从剪贴板粘贴图片');
        e.preventDefault();
        break;
      }
    }
  };

  // ==================== 主操作 ====================

  const handleAction = async (
    currentMode: 'search' | 'generate',
    options?: {
      overrideText?: string;
      injectedUserText?: string;
      overrideImageUrl?: string;
      skipContext?: boolean;
      overrideParams?: Partial<GenerateParams>;
    }
  ) => {
    const paramsForRequest = options?.overrideParams
      ? {
          style: options.overrideParams.style ?? '',
          ratio: options.overrideParams.ratio ?? '',
          color: options.overrideParams.color ?? '',
          scene: options.overrideParams.scene ?? DEFAULT_SCENE_VALUE,
        }
      : generateParams;
    const showSceneChipForRequest = !!(paramsForRequest.scene && paramsForRequest.scene !== DEFAULT_SCENE_VALUE);
    const hasParamsForRequest = !!(
      paramsForRequest.style ||
      paramsForRequest.ratio ||
      paramsForRequest.color ||
      showSceneChipForRequest
    );
    const paramsSnapshot =
      currentMode === 'generate' && hasParamsForRequest
        ? {
            style: paramsForRequest.style || undefined,
            ratio: paramsForRequest.ratio || undefined,
            color: paramsForRequest.color || undefined,
            scene: showSceneChipForRequest ? paramsForRequest.scene : undefined,
          }
        : undefined;
    const displayText = options?.injectedUserText ?? (options?.overrideText ?? inputText);

    let effectiveText = options?.overrideText ?? inputText;
    if (currentMode === 'generate' && !effectiveText && hasParamsForRequest) {
      effectiveText = buildParamsPrompt(paramsForRequest);
    }
    if (!effectiveText && fileList.length === 0 && !(currentMode === 'generate' && hasParamsForRequest)) {
      message.error('请输入文字或上传图片');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    const formData = new FormData();

    // 获取文件
    const fileItem = fileList[0];
    const overrideImageUrl = options?.overrideImageUrl;
    const fileToUpload = fileItem?.originFileObj as File | undefined;
    const referenceImageUrl = overrideImageUrl
      ? overrideImageUrl
      : fileItem?.url;
    let referenceFile: File | undefined;
    if (referenceImageUrl && (referenceImageUrl.startsWith('blob:') || referenceImageUrl.startsWith('data:'))) {
      try {
        referenceFile = await urlToFile(referenceImageUrl, 'reference_image.png');
      } catch (error) {
        console.warn('参考图转换失败，跳过引用:', error);
      }
    }

    if (fileItem) {
      setFileList([]);
    }

    // 添加用户消息到聊天
    if (fileToUpload) {
      formData.append('file', fileToUpload);
      const reader = new FileReader();
      reader.onload = () => {
        const msgType = displayText || paramsSnapshot ? 'mixed' : 'image';
        addMessage({
          type: msgType,
          content: reader.result as string,
          text: displayText || undefined,
          params: paramsSnapshot,
          source: 'user',
          isUser: true,
        });
      };
      reader.readAsDataURL(fileToUpload);
    } else if (currentMode === 'generate' && referenceImageUrl && (overrideImageUrl || !!fileItem?.url)) {
      const msgType = displayText || paramsSnapshot ? 'mixed' : 'image';
      addMessage({
        type: msgType,
        content: referenceImageUrl,
        text: displayText || undefined,
        params: paramsSnapshot,
        referenceImage: referenceImageUrl,
        source: 'user',
        isUser: true,
      });
    } else if (displayText || paramsSnapshot) {
      addMessage({ type: 'text', content: displayText || '', params: paramsSnapshot, isUser: true });
    }

    // 添加表单字段
    if (effectiveText) {
      formData.append('text', effectiveText);
      if (currentMode === 'generate') {
        formData.append('prompt', effectiveText);
      }
    }

    // 添加生成参数
    if (currentMode === 'generate') {
      if (paramsForRequest.style) {
        formData.append('style', paramsForRequest.style);
      }
      if (paramsForRequest.ratio) {
        formData.append('ratio', paramsForRequest.ratio);
      }
      if (paramsForRequest.color) {
        formData.append('color', paramsForRequest.color);
      }
      if (paramsForRequest.scene && paramsForRequest.scene !== DEFAULT_SCENE_VALUE) {
        formData.append('scene', paramsForRequest.scene);
      }
    }

    if (!fileToUpload && referenceFile) {
      formData.append('file', referenceFile);
    } else if (referenceImageUrl && (overrideImageUrl || !!fileItem?.url)) {
      formData.append('reference_url', referenceImageUrl);
    }

    try {
      let response;

      if (currentMode === 'search') {
        formData.append('top_k', '1');
        response = await search(formData, controller.signal);
      } else {
        if (!formData.has('prompt') && inputText) {
          formData.append('prompt', inputText);
        }
        if (fileToUpload && !inputText && !formData.has('prompt')) {
          formData.append('prompt', 'optimize this image');
        }

        response = await generate(formData, controller.signal);
      }

      // 处理结果
      const results = response.data.results;
      if (results?.length > 0) {
        results.forEach((item: any) => {
          const imageUrl =
            currentMode === 'search'
              ? `${API_URL}${item.path}`
              : typeof item === 'string' && item.startsWith('/')
                ? `${API_URL}${item}`
                : item;
          addMessage({
            type: 'image',
            content: imageUrl,
            prompt: currentMode === 'generate' ? effectiveText : undefined,
            referenceImage: currentMode === 'generate' ? referenceImageUrl : undefined,
            params: currentMode === 'generate' ? paramsSnapshot : undefined,
            source: currentMode === 'search' ? 'search' : 'generate',
            isUser: false,
          });
        });
      } else {
        addMessage({
          type: 'text',
          content: '未找到结果',
          isUser: false,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('操作失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      message.error(`操作失败: ${errorMsg}`);
      addMessage({
        type: 'text',
        content: '抱歉，发生了错误',
        isUser: false,
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
      setInputText('');
      setFileList([]);
      if (currentMode === 'generate') {
        setGenerateParams({ style: '', ratio: '', color: '', scene: DEFAULT_SCENE_VALUE });
        setParamOrder([]);
        setPendingDeleteParam(null);
      }
    }
  };

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    message.info('已取消处理');
  }, []);

  const handleUseAsReference = useCallback(async (imageUrl: string) => {
    try {
      message.loading({ content: '加入参考图中...', key: 'reference' });
      let uploadFile: UploadFile;
      try {
        const file = await urlToFile(imageUrl, 'reference_image.png');
        uploadFile = {
          uid: `${Date.now()}`,
          name: 'reference_image.png',
          status: 'done',
          url: imageUrl,
          originFileObj: file as any,
        };
      } catch (innerError) {
        console.warn('引用图片下载失败，改用 URL 引用:', innerError);
        uploadFile = {
          uid: `${Date.now()}`,
          name: 'reference_image.png',
          status: 'done',
          url: imageUrl,
        };
      }
      setFileList([uploadFile]);
      message.success({ content: '已加入对话作为参考图', key: 'reference' });
    } catch (error) {
      console.error('加入参考图失败:', error);
      message.error({ content: '加入参考图失败', key: 'reference' });
    }
  }, []);

  const handleRegenerate = useCallback(
    async (messageItem: Message) => {
      let prompt = messageItem.prompt;
      if (!prompt) {
        const index = chatHistory.findIndex((msg) => msg === messageItem);
        if (index >= 0) {
          for (let i = index - 1; i >= 0; i -= 1) {
            const prev = chatHistory[i];
            if (!prev.isUser) continue;
            if (prev.type === 'text' && prev.content) {
              prompt = prev.content;
              break;
            }
            if (prev.text) {
              prompt = prev.text;
              break;
            }
          }
        }
      }

      if (!prompt) {
        message.warning('没有可重新生成的指令');
        return;
      }
      await handleAction('generate', {
        overrideText: prompt,
        injectedUserText: `重新生成：${prompt}`,
        overrideImageUrl: messageItem.referenceImage,
        overrideParams: messageItem.params,
        skipContext: true,
      });
    },
    [chatHistory, handleAction]
  );

  // ==================== 渲染 ====================

  return (
    <div style={styles.container}>
      {/* 顶部栏 */}
      <div style={styles.header}>
        <Typography.Title level={4} style={styles.title}>
          <span style={{ fontSize: '24px' }}>🎨</span> Picture AI
        </Typography.Title>
        <div />
      </div>

      {/* 聊天区域 */}
      <div style={styles.chatArea} ref={chatAreaRef}>
        <div style={styles.chatContent}>
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <MessageList
              messages={messages}
              onPreview={(src) => openImagePreview(src)}
              onUseAsReference={(url) => void handleUseAsReference(url)}
              onRegenerate={(msg) => void handleRegenerate(msg)}
              onDownload={openDownloadDialog}
              onImageLoad={scrollToBottom}
            />
          )}
          {loading && (
            <div style={styles.loadingContainer}>
              <Space direction="vertical">
                <div className="loading-dots">处理中...</div>
              </Space>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div style={styles.inputArea}>
        <div style={styles.inputContent}>
          {/* 已上传图片预览 */}
          {fileList.length > 0 && (
            <FilePreview
              fileList={fileList}
              setFileList={setFileList}
              onPreview={openImagePreview}
              disabled={isInputLocked}
            />
          )}

          {/* 选中参数标签显示 */}
          {hasParams && (
            <div style={{ ...styles.paramTagsRow, display: 'none' }}>
              {generateParams.style && (
                <span style={styles.paramTag}>
                  风格：
                  <Select
                    value={generateParams.style}
                    onChange={(val) => updateGenerateParam('style', val)}
                    size="small"
                    variant="borderless"
                    style={styles.inlineSelect}
                    options={STYLE_OPTIONS}
                    disabled={loading}
                  />
                  <span
                    style={styles.paramTagClose}
                    onClick={() => clearGenerateParam('style')}
                  >
                    ×
                  </span>
                </span>
              )}
              {generateParams.ratio && (
                <span style={styles.paramTag}>
                  比例：
                  <Select
                    value={generateParams.ratio}
                    onChange={(val) => updateGenerateParam('ratio', val)}
                    size="small"
                    variant="borderless"
                    style={styles.inlineSelect}
                    options={RATIO_OPTIONS}
                    disabled={loading}
                  />
                  <span
                    style={styles.paramTagClose}
                    onClick={() => clearGenerateParam('ratio')}
                  >
                    ×
                  </span>
                </span>
              )}
              {generateParams.color && (
                <span style={styles.paramTag}>
                  颜色：
                  <Select
                    value={generateParams.color}
                    onChange={(val) => updateGenerateParam('color', val)}
                    size="small"
                    variant="borderless"
                    style={styles.inlineSelect}
                    options={COLOR_OPTIONS}
                    disabled={loading}
                  />
                  <span
                    style={styles.paramTagClose}
                    onClick={() => clearGenerateParam('color')}
                  >
                    ×
                  </span>
                </span>
              )}
              {showSceneChip && (
                <span style={styles.paramTag}>
                  构图：
                  <Select
                    value={generateParams.scene}
                    onChange={(val) => updateGenerateParam('scene', val)}
                    size="small"
                    variant="borderless"
                    style={styles.inlineSelect}
                    options={SCENE_OPTIONS}
                    disabled={loading}
                  />
                  <span
                    style={styles.paramTagClose}
                    onClick={() => clearGenerateParam('scene')}
                  >
                    ×
                  </span>
                </span>
              )}
            </div>
          )}

          {/* 输入行 */}
          <div style={styles.inputRow}>
            <Upload
              disabled={loading || isInputLocked}
              beforeUpload={(file) => {
                if (!file.type.startsWith('image/')) {
                  message.error('只能上传图片文件');
                  return Upload.LIST_IGNORE;
                }
                if (file.size / 1024 / 1024 > 5) {
                  message.error('图片大小不能超过 5MB');
                  return Upload.LIST_IGNORE;
                }
                setFileList([
                  {
                    uid: file.uid,
                    name: file.name,
                    status: 'done',
                    url: URL.createObjectURL(file),
                    originFileObj: file,
                  },
                ]);
                return false;
              }}
              showUploadList={false}
              fileList={fileList}
            >
              <Tooltip title="上传参考图片">
                <Button
                  size="large"
                  disabled={loading || isInputLocked}
                  icon={<PictureOutlined style={{ fontSize: '32px', color: '#555' }} />}
                  style={{
                    ...styles.uploadButton,
                    background: fileList.length > 0 ? '#e6f7ff' : '#fff',
                    borderColor: fileList.length > 0 ? '#1677ff' : '#d9d9d9',
                  }}
                />
              </Tooltip>
            </Upload>

            <div style={styles.inputFieldWrap}>
              <div style={styles.inputBox}>
                <div
                  style={{
                    ...styles.inputComposite,
                    ...(loading ? { paddingRight: '46px' } : null),
                  }}
                >
                  {hasParams && (
                    <div style={styles.inputPrefixRow}>
                      {paramOrderForDisplay
                        .filter((k) => {
                          if (k === 'style') return !!generateParams.style;
                          if (k === 'ratio') return !!generateParams.ratio;
                          if (k === 'color') return !!generateParams.color;
                          if (k === 'scene') return isSceneActive(generateParams.scene);
                          return false;
                        })
                        .map((key) => {
                          const showPending = pendingDeleteParam === key;
                          if (key === 'style') {
                            return (
                              <span
                                key={key}
                                style={{
                                  ...styles.inputParamTag,
                                  ...(showPending ? styles.inputParamTagPendingDelete : null),
                                }}
                              >
                                风格：
                                <Select
                                  value={generateParams.style}
                                  onChange={(val) => updateGenerateParam('style', val)}
                                  size="small"
                                  variant="borderless"
                                  style={styles.inlineSelect}
                                  options={STYLE_OPTIONS}
                                  disabled={loading}
                                />
                                <span
                                  style={{
                                    ...styles.paramTagClose,
                                    ...(isInputLocked ? { pointerEvents: 'none', opacity: 0.5 } : null),
                                  }}
                                  onClick={isInputLocked ? undefined : () => clearGenerateParam('style')}
                                >
                                  ×
                                </span>
                              </span>
                            );
                          }
                          if (key === 'ratio') {
                            return (
                              <span
                                key={key}
                                style={{
                                  ...styles.inputParamTag,
                                  ...(showPending ? styles.inputParamTagPendingDelete : null),
                                }}
                              >
                                比例：
                                <Select
                                  value={generateParams.ratio}
                                  onChange={(val) => updateGenerateParam('ratio', val)}
                                  size="small"
                                  variant="borderless"
                                  style={styles.inlineSelect}
                                  options={RATIO_OPTIONS}
                                  disabled={loading}
                                />
                                <span
                                  style={{
                                    ...styles.paramTagClose,
                                    ...(isInputLocked ? { pointerEvents: 'none', opacity: 0.5 } : null),
                                  }}
                                  onClick={isInputLocked ? undefined : () => clearGenerateParam('ratio')}
                                >
                                  ×
                                </span>
                              </span>
                            );
                          }
                          if (key === 'color') {
                            return (
                              <span
                                key={key}
                                style={{
                                  ...styles.inputParamTag,
                                  ...(showPending ? styles.inputParamTagPendingDelete : null),
                                }}
                              >
                                颜色：
                                <span
                                  style={{
                                    ...styles.colorSwatch,
                                    background: generateParams.color,
                                  }}
                                />
                                <span
                                  style={{
                                    ...styles.paramTagClose,
                                    ...(isInputLocked ? { pointerEvents: 'none', opacity: 0.5 } : null),
                                  }}
                                  onClick={isInputLocked ? undefined : () => clearGenerateParam('color')}
                                >
                                  ×
                                </span>
                              </span>
                            );
                          }
                          return (
                            <span
                              key={key}
                              style={{
                                ...styles.inputParamTag,
                                ...(showPending ? styles.inputParamTagPendingDelete : null),
                              }}
                            >
                              场景/图结构：
                              <Select
                                value={generateParams.scene}
                                onChange={(val) => updateGenerateParam('scene', val)}
                                size="small"
                                variant="borderless"
                                style={styles.inlineSelect}
                                options={SCENE_OPTIONS}
                                disabled={loading}
                              />
                              <span
                                style={{
                                  ...styles.paramTagClose,
                                  ...(isInputLocked ? { pointerEvents: 'none', opacity: 0.5 } : null),
                                }}
                                onClick={isInputLocked ? undefined : () => clearGenerateParam('scene')}
                              >
                                ×
                              </span>
                            </span>
                          );
                        })}
                    </div>
                  )}
                  <div style={styles.inputTextFlex}>
                    <Input.TextArea
                      placeholder="输入文字（可选上传图片）"
                      size="large"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onPaste={handlePasteImage}
                      onKeyDown={(e) => {
                        if (loading) return;
                        if ((e.key === 'Backspace' || e.key === 'Delete') && !inputText) {
                          const activeKeys = paramOrderForDisplay.filter((k) => {
                            if (k === 'style') return !!generateParams.style;
                            if (k === 'ratio') return !!generateParams.ratio;
                            if (k === 'color') return !!generateParams.color;
                            if (k === 'scene') return isSceneActive(generateParams.scene);
                            return false;
                          });
                          const lastKey = activeKeys[activeKeys.length - 1];
                          if (lastKey) {
                            e.preventDefault();
                            if (pendingDeleteParam === lastKey) {
                              clearGenerateParam(lastKey);
                            } else {
                              setPendingDeleteParam(lastKey);
                            }
                            return;
                          }
                        }
                        setPendingDeleteParam(null);
                        if (e.key !== 'Enter') return;
                        if ((e as any).isComposing) return;
                        if (e.shiftKey) return;
                        e.preventDefault();
                        void handleAction('generate');
                      }}
                      disabled={loading || isInputLocked}
                      bordered={false}
                      autoSize={{ minRows: 1, maxRows: 6 }}
                      style={styles.inputTextArea}
                    />
                  </div>
                </div>
                {loading && (
                  <Button
                    type="text"
                    icon={<span style={styles.cancelIconInner} />}
                    shape="circle"
                    style={styles.cancelOverlayButton}
                    onClick={handleCancel}
                  />
                )}
              </div>
              <Button
                type="primary"
                size="large"
                style={{
                  ...styles.generateActionButton,
                  ...(isGenerateDisabled ? styles.actionDisabled : null),
                }}
                onClick={() => void handleAction('generate')}
                disabled={isGenerateDisabled}
              >
                生成
              </Button>
              <Button
                type="default"
                size="large"
                style={{
                  ...styles.searchActionButton,
                  ...(isSearchDisabled ? styles.actionDisabled : null),
                }}
                onClick={() => void handleAction('search')}
                disabled={isSearchDisabled}
              >
                搜索
              </Button>
            </div>
          </div>
          
          {/* 参数选择器行 */}
          <div style={styles.paramSelectRow}>
            <Select
              value={generateParams.style || undefined}
              onChange={(val) => updateGenerateParam('style', val)}
              placeholder="风格流派"
              allowClear
              onClear={() => clearGenerateParam('style')}
              style={styles.paramSelect}
              options={STYLE_OPTIONS}
              popupMatchSelectWidth={false}
              disabled={loading || isInputLocked}
            />
            <Select
              value={generateParams.ratio || undefined}
              onChange={(val) => updateGenerateParam('ratio', val)}
              placeholder="比例"
              allowClear
              onClear={() => clearGenerateParam('ratio')}
              style={styles.paramSelect}
              options={RATIO_OPTIONS}
              popupMatchSelectWidth={false}
              disabled={loading || isInputLocked}
            />
            <Popover
              trigger="click"
              placement="topLeft"
              open={colorPickerOpen}
              onOpenChange={(open) => {
                if (loading || isInputLocked) return;
                setColorPickerOpen(open);
              }}
              content={
                <RgbPalettePicker
                  value={generateParams.color}
                  onChange={(hex) => updateGenerateParam('color', hex)}
                  onPick={() => setColorPickerOpen(false)}
                />
              }
            >
              <div
                style={{
                  ...styles.colorPickerTrigger,
                  ...(loading || isInputLocked ? styles.colorPickerTriggerDisabled : null),
                }}
              >
                <span style={{ color: generateParams.color ? '#111827' : '#9ca3af' }}>主体颜色</span>
                <span
                  style={{
                    ...styles.colorPickerTriggerSwatch,
                    background: generateParams.color || 'transparent',
                    borderColor: generateParams.color ? '#d1d5db' : '#e5e7eb',
                  }}
                />
                {generateParams.color && (
                  <span
                    style={{
                      ...styles.colorPickerClear,
                      ...(loading || isInputLocked ? { pointerEvents: 'none', opacity: 0.5 } : null),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearGenerateParam('color');
                    }}
                  >
                    ×
                  </span>
                )}
              </div>
            </Popover>
            <Select
              value={generateParams.scene === DEFAULT_SCENE_VALUE ? undefined : generateParams.scene}
              onChange={(val) => updateGenerateParam('scene', val)}
              placeholder="场景/图结构"
              allowClear
              onClear={() => clearGenerateParam('scene')}
              style={styles.paramSelect}
              options={SCENE_OPTIONS}
              popupMatchSelectWidth={false}
              disabled={loading || isInputLocked}
            />
          </div>
        </div>
      </div>

      <Modal
        open={imagePreview.open}
        onCancel={closeImagePreview}
        footer={null}
        centered
        closable={false}
        maskClosable
        keyboard
        width="90vw"
        styles={{
          content: { padding: 0, background: 'transparent', boxShadow: 'none' },
          body: { padding: 0, background: 'transparent' },
        }}
      >
        <div style={styles.lightboxContainer}>
          <div style={styles.lightboxToolbar}>
            <Tooltip title="复制">
              <Button
                type="text"
                icon={<CopyOutlined />}
                style={styles.lightboxToolButton}
                onClick={() => copyImageToClipboard(imagePreview.src)}
              />
            </Tooltip>
            <Tooltip title="下载">
              <Button
                type="text"
                icon={<DownloadOutlined />}
                style={styles.lightboxToolButton}
                onClick={() => openDownloadDialog(imagePreview.src, imagePreview.filename)}
              />
            </Tooltip>
            <Tooltip title="关闭">
              <Button
                type="text"
                icon={<CloseOutlined />}
                style={styles.lightboxToolButton}
                onClick={closeImagePreview}
              />
            </Tooltip>
          </div>
          <img src={imagePreview.src} alt="preview" style={styles.lightboxImage} />
        </div>
      </Modal>

      <Modal
        open={downloadDialog.open}
        onCancel={closeDownloadDialog}
        title="下载图片"
        centered
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <Button onClick={closeDownloadDialog}>取消</Button>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <Select
                value={downloadFormat}
                onChange={(val) => setDownloadFormat(val)}
                style={{ width: 120 }}
                options={[
                  { value: 'png', label: 'png（默认）' },
                  { value: 'jpg', label: 'jpg' },
                  { value: 'webp', label: 'webp' },
                  { value: 'bmp', label: 'bmp' },
                  { value: 'tiff', label: 'tiff' },
                ]}
              />
              <Button type="primary" onClick={() => void handleConfirmDownload()}>
                下载
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ color: '#6b7280' }}>选择下载格式后点击下载。</div>
      </Modal>
    </div>
  );
};

// ==================== 子组件 ====================

/** 空状态提示 */
const EmptyState: React.FC = () => (
  <div style={styles.emptyState}>
    <div style={{ fontSize: '64px', opacity: 0.2 }}>
      <PictureOutlined />
    </div>
    <Typography.Text type="secondary" style={{ fontSize: '16px' }}>
      输入文字或上传图片后选择生成或搜索
    </Typography.Text>
  </div>
);

/** 消息列表 */
const MessageList: React.FC<{
  messages: Message[];
  onPreview: (src: string) => void;
  onUseAsReference: (url: string) => void;
  onRegenerate: (message: Message) => void;
  onDownload: (src: string) => void;
  onImageLoad: () => void;
}> = ({
  messages,
  onPreview,
  onUseAsReference,
  onRegenerate,
  onDownload,
  onImageLoad,
}) => (
  <List
    dataSource={messages}
    split={false}
    renderItem={(item) => (
      <List.Item
        style={{
          justifyContent: item.isUser ? 'flex-end' : 'flex-start',
          padding: '16px 0',
          border: 'none',
        }}
      >
        <MessageBubble
          message={item}
          onPreview={onPreview}
          onUseAsReference={onUseAsReference}
          onRegenerate={onRegenerate}
          onDownload={onDownload}
          onImageLoad={onImageLoad}
          selectedMaskDataUrl={undefined}
        />
      </List.Item>
    )}
  />
);

const MessageBubble: React.FC<{
  message: Message;
  onPreview: (src: string) => void;
  onUseAsReference: (url: string) => void;
  onRegenerate: (message: Message) => void;
  onDownload: (src: string) => void;
  onImageLoad: () => void;
  selectedMaskDataUrl?: string;
}> = ({ message, onPreview, onUseAsReference, onRegenerate, onDownload, onImageLoad }) => {
  const { type, content, text, isUser, source, params } = message;
  const [hovered, setHovered] = useState(false);
  const resolvedSource: 'user' | 'search' | 'generate' = source || (isUser ? 'user' : 'generate');
  const canRegenerate = !isUser && resolvedSource === 'generate';
  const hasBubbleParams = !!(params?.style || params?.ratio || params?.color || params?.scene);

  const bubbleStyle = {
    background: isUser ? '#1677ff' : '#fff',
    color: isUser ? '#fff' : '#333',
    padding: '16px 20px',
    borderRadius: '16px',
    fontSize: '16px',
    lineHeight: '1.6',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
    borderTopRightRadius: isUser ? '4px' : '16px',
    borderTopLeftRadius: isUser ? '16px' : '4px',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      {type === 'text' && (
        <div
          style={
            isUser
              ? {
                  ...bubbleStyle,
                  display: 'inline-block',
                  maxWidth: '50%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'normal',
                  overflowWrap: 'anywhere',
                }
              : {
                  ...bubbleStyle,
                  display: 'inline-block',
                  maxWidth: '520px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'normal',
                  overflowWrap: 'anywhere',
                }
          }
        >
          {isUser && hasBubbleParams && (
            <span style={styles.bubbleParamRow}>
              {params?.style && <span style={styles.bubbleParamChip}>风格流派：{params.style}</span>}
              {params?.ratio && <span style={styles.bubbleParamChip}>比例：{params.ratio}</span>}
              {params?.color && (
                <span style={styles.bubbleParamChip}>
                  主体颜色：
                  <span style={{ ...styles.bubbleColorSwatch, background: params.color }} />
                </span>
              )}
              {params?.scene && <span style={styles.bubbleParamChip}>场景/图结构：{params.scene}</span>}
              {content ? <span style={styles.bubbleParamColon}>：</span> : null}
            </span>
          )}
          {content}
        </div>
      )}

      {(type === 'image' || type === 'mixed') && (
        <div
          style={{
            ...styles.imageContainer,
            maxWidth: isUser ? 'min(50%, 420px)' : '420px',
            alignItems: isUser ? 'flex-end' : 'flex-start',
          }}
        >
          <div
            style={{
              ...styles.imageWrapper,
              alignSelf: isUser ? 'flex-end' : 'flex-start',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <Image
              src={content}
              alt="content"
              style={{ ...styles.image, cursor: 'pointer' }}
              wrapperStyle={styles.imageWrapperInner}
              preview={false}
              onLoad={onImageLoad}
              onClick={() => {
                onPreview(content);
              }}
            />
            <div
              style={{
                ...styles.imageActionBar,
                ...(hovered ? styles.imageActionBarVisible : null),
                ...(hovered ? null : { pointerEvents: 'none' }),
              }}
            >
              <Tooltip title="引用：加入对话">
                <Button
                  shape="circle"
                  icon={<LinkOutlined />}
                  style={styles.imageActionButton}
                  onClick={() => onUseAsReference(content)}
                />
              </Tooltip>
              {canRegenerate && (
                <Tooltip title="重新生成">
                  <Button
                    shape="circle"
                    icon={<ReloadOutlined />}
                    style={styles.imageActionButton}
                    onClick={() => onRegenerate(message)}
                  />
                </Tooltip>
              )}
              <Tooltip title="下载">
                <Button
                  shape="circle"
                  icon={<DownloadOutlined />}
                  style={styles.imageActionButton}
                  onClick={() => onDownload(content)}
                />
              </Tooltip>
            </div>
          </div>
          {type === 'mixed' && (text || (isUser && hasBubbleParams)) && (
            <div
              style={{
                ...bubbleStyle,
                padding: '12px 16px',
                display: 'inline-block',
                maxWidth: isUser ? '100%' : '520px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'normal',
                overflowWrap: 'anywhere',
              }}
            >
              {isUser && hasBubbleParams && (
                <span style={styles.bubbleParamRow}>
                  {params?.style && <span style={styles.bubbleParamChip}>风格流派：{params.style}</span>}
                  {params?.ratio && <span style={styles.bubbleParamChip}>比例：{params.ratio}</span>}
                  {params?.color && (
                    <span style={styles.bubbleParamChip}>
                      主体颜色：
                      <span style={{ ...styles.bubbleColorSwatch, background: params.color }} />
                    </span>
                  )}
                  {params?.scene && <span style={styles.bubbleParamChip}>场景/图结构：{params.scene}</span>}
                  {text ? <span style={styles.bubbleParamColon}>：</span> : null}
                </span>
              )}
              {text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** 文件预览 */
const FilePreview: React.FC<{
  fileList: UploadFile[];
  setFileList: (files: UploadFile[]) => void;
  onPreview: (src: string, filename?: string) => void;
  disabled?: boolean;
}> = ({ fileList, setFileList, onPreview, disabled }) => {
  return (
    <div style={styles.filePreview}>
      {fileList.map((file) => {
        const src =
          file.url ||
          (file.originFileObj ? URL.createObjectURL(file.originFileObj as any) : '');

        return (
          <div key={file.uid} style={styles.previewItem}>
            <img
              src={src}
              alt="preview"
              style={{ ...styles.previewImage, cursor: 'pointer' }}
              onClick={disabled ? undefined : () => onPreview(src, file.name)}
            />
            <div
              style={{
                ...styles.removeButton,
                ...(disabled ? { pointerEvents: 'none', opacity: 0.5 } : null),
              }}
              onClick={
                disabled ? undefined : () => setFileList(fileList.filter((f) => f.uid !== file.uid))
              }
            >
              ✕
            </div>
          </div>
        );
      })}
      <Typography.Text type="secondary" style={{ fontSize: '13px' }}>
        已上传参考图
      </Typography.Text>
    </div>
  );
};

// ==================== 样式 ====================

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f6f7f9',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
    zIndex: 10,
  },
  title: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 24px 16px',
    background: 'transparent',
    scrollBehavior: 'smooth',
  },
  chatContent: {
    maxWidth: '860px',
    margin: '0 auto',
    height: '100%',
    padding: '0 16px',
    boxSizing: 'border-box',
  },
  emptyState: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#ccc',
    gap: '16px',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '20px',
    color: '#999',
  },
  inputArea: {
    padding: '0 24px 22px',
    background: 'transparent',
    borderTop: 'none',
    boxShadow: 'none',
    position: 'relative',
    zIndex: 20,
  },
  inputContent: {
    maxWidth: '980px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: '#fff',
    borderRadius: '20px',
    padding: '20px 16px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  inputFieldWrap: {
    flex: 1,
    maxWidth: '940px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  inputBox: {
    flex: 1,
    position: 'relative',
  },
  generateActionButton: {
    minWidth: '72px',
    height: '40px',
    borderRadius: '10px',
    background: '#1f6fff',
    borderColor: '#1f6fff',
    fontWeight: 600,
  },
  actionDisabled: {
    background: '#e5e7eb',
    borderColor: '#e5e7eb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  searchActionButton: {
    minWidth: '72px',
    height: '40px',
    borderRadius: '10px',
    background: '#e6f4ff',
    borderColor: '#bcdcff',
    color: '#1f6fff',
    fontWeight: 600,
  },
  cancelSuffixButton: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: '1.5px solid #111827',
    color: '#111827',
    background: '#f2f2f2',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSuffixButtonHidden: {
    visibility: 'hidden',
    pointerEvents: 'none',
  },
  cancelOverlayButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: '1.5px solid #111827',
    background: '#f2f2f2',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIconInner: {
    width: '12px',
    height: '12px',
    borderRadius: '4px',
    border: '1.5px solid #111827',
    background: '#111827',
    display: 'block',
  },
  uploadButton: {
    width: '56px',
    height: '56px',
    borderRadius: '18px',
    border: '1px solid #d9d9d9',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '100%',
  },
  imageWrapper: {
    position: 'relative',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    display: 'inline-block',
    width: 'fit-content',
    maxWidth: '100%',
  },
  imageWrapperInner: {
    display: 'inline-block',
    width: 'fit-content',
    maxWidth: '100%',
    background: 'transparent',
  },
  imageActionBar: {
    position: 'absolute',
    bottom: '10px',
    right: '10px',
    display: 'flex',
    gap: '10px',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.2s ease',
  },
  imageActionBarVisible: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  imageActionButton: {
    width: '30px',
    height: '30px',
    border: 'none',
    background: '#fff',
    boxShadow: '0 3px 8px rgba(0,0,0,0.15)',
    color: '#1f2937',
  },
  image: {
    width: 'auto',
    height: 'auto',
    maxWidth: '100%',
    maxHeight: '240px',
    objectFit: 'contain',
    display: 'block',
    background: 'transparent',
  },
  filePreview: {
    display: 'flex',
    gap: '12px',
    padding: '10px',
    background: '#f5f5f5',
    borderRadius: '12px',
    alignItems: 'center',
  },
  previewItem: {
    position: 'relative',
    width: '56px',
    height: '56px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #d9d9d9',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  removeButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '12px',
    borderBottomLeftRadius: '4px',
  },
  lightboxContainer: {
    position: 'relative',
    background: 'rgba(0,0,0,0.88)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '240px',
  },
  lightboxToolbar: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    display: 'flex',
    gap: '8px',
    zIndex: 2,
  },
  lightboxToolButton: {
    color: '#fff',
    background: 'rgba(255,255,255,0.18)',
    borderRadius: '10px',
    padding: '6px 10px',
    height: '36px',
  },
  lightboxImage: {
    maxWidth: '86vw',
    maxHeight: '78vh',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    borderRadius: '10px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
  },
  // 参数选择器样式
  paramSelectRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    paddingTop: '8px',
    borderTop: '1px solid #f0f0f0',
    marginTop: '8px',
  },
  paramSelect: {
    minWidth: '100px',
  },
  // 选中参数标签样式
  paramTagsRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    padding: '8px 12px',
    background: '#f0f5ff',
    borderRadius: '10px',
    alignItems: 'center',
  },
  paramTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 8px',
    background: '#fff',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#333',
  },
  paramTagClose: {
    marginLeft: '4px',
    cursor: 'pointer',
    color: '#999',
    fontSize: '14px',
    lineHeight: 1,
    padding: '2px',
  },
  inlineSelect: {
    minWidth: '60px',
  },
  inputPrefixRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  inputParamTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '3px 8px',
    background: '#f0f5ff',
    border: '1px solid rgba(22,119,255,0.35)',
    borderRadius: '999px',
    fontSize: '13px',
    color: '#1f2937',
    lineHeight: 1.2,
  },
  inputParamTagPendingDelete: {
    background: '#fff1f2',
    border: '1px solid rgba(244,63,94,0.55)',
  },
  colorSwatch: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    border: '1px solid rgba(0,0,0,0.12)',
    display: 'inline-block',
  },
  colorPickerTrigger: {
    minWidth: '100px',
    height: '32px',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    padding: '0 10px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    background: '#fff',
  },
  colorPickerTriggerDisabled: {
    opacity: 0.6,
    pointerEvents: 'none',
  },
  colorPickerTriggerSwatch: {
    width: '14px',
    height: '14px',
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
    background: 'transparent',
  },
  colorPickerClear: {
    marginLeft: 'auto',
    color: '#9ca3af',
    fontSize: '14px',
    lineHeight: 1,
    padding: '0 2px',
  },
  rgbPickerContainer: {
    width: '260px',
  },
  rgbPickerPreviewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  rgbPickerSwatchLarge: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.15)',
  },
  rgbPickerHexText: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '12px',
    color: '#111827',
  },
  rgbPickerCanvasWrap: {
    position: 'relative',
    width: '240px',
    height: '160px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.12)',
  },
  rgbPickerCanvas: {
    display: 'block',
    width: '240px',
    height: '160px',
    cursor: 'crosshair',
  },
  rgbPickerCursor: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderRadius: '999px',
    border: '2px solid #fff',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
  },
  rgbPickerHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#6b7280',
  },
  inputComposite: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    width: '100%',
    minHeight: '44px',
    border: '1px solid #d9d9d9',
    borderRadius: '12px',
    padding: '6px 12px',
    background: '#fff',
    boxSizing: 'border-box',
  },
  inputTextFlex: {
    flex: '1 1 240px',
    minWidth: '220px',
  },
  inputTextArea: {
    padding: 0,
    margin: 0,
    background: 'transparent',
    lineHeight: 1.6,
    boxShadow: 'none',
    resize: 'none',
  },
  bubbleParamRow: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
    marginRight: '2px',
  },
  bubbleParamChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.32)',
    color: '#fff',
    fontSize: '13px',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  },
  bubbleColorSwatch: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    border: '1px solid rgba(255,255,255,0.55)',
    display: 'inline-block',
    marginLeft: '6px',
    marginRight: '6px',
  },
  bubbleParamColon: {
    display: 'inline-block',
    marginLeft: '2px',
    marginRight: '2px',
    opacity: 0.9,
  },
};

export default App;
