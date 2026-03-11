
/**
 * API 请求服务封装
 * ---------------
 * 功能：
 * 1. 封装与后端 API 的网络交互逻辑
 * 2. 使用 fetch API 发送 FormData 数据
 * 3. 统一处理网络错误和响应格式
 * 
 * 作业：
 * - 考虑添加请求超时控制
 * - 统一的错误拦截器
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

const parseError = async (response: Response) => {
  const errorBody = await response.json().catch(() => {
    return { detail: `HTTP error! status: ${response.status}` };
  });
  throw new Error(errorBody.detail || 'An unknown error occurred');
};

export const search = async (formData: FormData, signal?: AbortSignal) => {
  const response = await fetch(`${API_BASE_URL}/api/search`, {
    method: 'POST',
    body: formData,
    signal,
    // When using FormData with fetch, the browser automatically sets the
    // 'Content-Type' header with the correct 'boundary' parameter.
    // Manually setting it will cause errors.
  });

  if (!response.ok) {
    await parseError(response);
  }

  // The calling code in App.tsx expects a response object with a `data` property,
  // similar to how axios structures its responses. We'll mimic that structure.
  const responseData = await response.json();
  return { data: responseData };
};

export const proxyImageUrl = (url: string) => {
  return `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(url)}`;
};

export const generate = async (formData: FormData, signal?: AbortSignal) => {
  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  const responseData = await response.json();
  return { data: responseData };
};

// ==================== 分层编辑 API ====================

export interface InteractiveUploadResponse {
  session_id: string;
  meta: {
    w: number;
    h: number;
    seg_mode: string;
    filename?: string;
    layer_count?: number;
    layer_names?: string[];
    qwen_status?: string;
  };
}

export interface InteractivePickResponse {
  layer: string;
  mask_png_base64: string;
}

export interface InteractiveEditResponse {
  result_png_base64: string;
  layer_mask_png_base64: string;
  applied_params: Record<string, unknown>;
}

export interface InteractiveLayerItem {
  id: string;
  name: string;
  mask_png_base64: string;
  thumbnail_png_base64: string;
}

export interface InteractiveLayersResponse {
  layers: InteractiveLayerItem[];
}

/**
 * 上传图片并创建编辑 session
 * POST /api/interactive/upload
 */
export const interactiveUpload = async (
  file: File,
  options?: {
    alpha_val?: number;
    white_threshold?: number;
    layer_count?: number;
  },
  signal?: AbortSignal
): Promise<InteractiveUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const queryParams = new URLSearchParams();
  if (options?.alpha_val !== undefined) queryParams.append('alpha_val', options.alpha_val.toString());
  if (options?.white_threshold !== undefined) queryParams.append('white_threshold', options.white_threshold.toString());
  if (options?.layer_count !== undefined) queryParams.append('layer_count', options.layer_count.toString());

  const response = await fetch(`${API_BASE_URL}/api/interactive/upload?${queryParams.toString()}`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

/**
 * 点击拾取层
 * POST /api/interactive/pick
 */
export const interactivePick = async (
  sessionId: string,
  x: number,
  y: number,
  signal?: AbortSignal
): Promise<InteractivePickResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/interactive/pick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, x, y }),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

/**
 * 应用编辑到选中层
 * POST /api/interactive/edit
 */
export const interactiveEdit = async (
  sessionId: string,
  layers: string[],
  prompt: string,
  signal?: AbortSignal
): Promise<InteractiveEditResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/interactive/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, layers, prompt }),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

/**
 * 获取图层列表
 * POST /api/interactive/layers
 */
export const interactiveLayers = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<InteractiveLayersResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/interactive/layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

/**
 * 切换 SAM 候选 mask
 * POST /api/interactive/switch-mask
 */
export const interactiveSwitchMask = async (
  sessionId: string,
  maskIndex: number,
  signal?: AbortSignal
): Promise<InteractivePickResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/interactive/switch-mask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, mask_index: maskIndex }),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

/**
 * 代理下载外部图片（绕过 CORS 限制）
 * POST /api/interactive/proxy-image
 */
export interface ProxyImageResponse {
  image_base64: string;
  content_type: string;
}

export const proxyImage = async (
  url: string,
  signal?: AbortSignal
): Promise<ProxyImageResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/interactive/proxy-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

// ==================== 会话管理 API ====================

export interface ChatSession {
  id: string;
  title: string;
  thumbnail: string | null;
  firstPrompt: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  sessionId: string;
  type: string;
  content: string;
  text: string | null;
  prompt: string | null;
  referenceImage: string | null;
  source: string | null;
  params: Record<string, unknown> | null;
  images: string[] | null;
  colorVariantConfig: {
    originalImageBase64: string;
    count: number;
    colorScheme: string[] | null;
  } | null;
  isUser: boolean;
  createdAt: string;
}

export interface EditSession {
  id: string;
  title: string;
  thumbnail: string | null;
  originalImage: string | null;
  layerCount: number;
  stepCount: number;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditSnapshotData {
  id: number;
  sessionId: string;
  stepIndex: number;
  imageDataUrl: string;
  layers: Record<string, unknown>[];
  prompt: string | null;
  createdAt: string;
}

// === 聊天会话 ===

export const listChatSessions = async (signal?: AbortSignal): Promise<ChatSession[]> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const createChatSession = async (
  data: { title?: string; thumbnail?: string; firstPrompt?: string },
  signal?: AbortSignal
): Promise<ChatSession> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const getChatSession = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<ChatSession> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat/${sessionId}`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const updateChatSession = async (
  sessionId: string,
  data: { title?: string; thumbnail?: string; firstPrompt?: string },
  signal?: AbortSignal
): Promise<ChatSession> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const deleteChatSession = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat/${sessionId}`, {
    method: 'DELETE',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }
};

export const getChatMessages = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<ChatMessage[]> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat/${sessionId}/messages`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const addChatMessage = async (
  sessionId: string,
  data: {
    type?: string;
    content: string;
    text?: string;
    prompt?: string;
    referenceImage?: string;
    source?: string;
    params?: Record<string, unknown>;
    images?: string[];
    colorVariantConfig?: { originalImageBase64: string; count: number; colorScheme: string[] | null };
    isUser: boolean;
  },
  signal?: AbortSignal
): Promise<{ id: number; success: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/chat/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

// === 编辑会话 ===

export const listEditSessions = async (signal?: AbortSignal): Promise<EditSession[]> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const createEditSession = async (
  data: { title?: string; thumbnail?: string; originalImage?: string; layerCount?: number; meta?: Record<string, unknown> },
  signal?: AbortSignal
): Promise<EditSession> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const getEditSession = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<EditSession> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit/${sessionId}`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const updateEditSession = async (
  sessionId: string,
  data: { title?: string; thumbnail?: string; layerCount?: number; stepCount?: number },
  signal?: AbortSignal
): Promise<EditSession> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const deleteEditSession = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit/${sessionId}`, {
    method: 'DELETE',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }
};

export const getEditSnapshots = async (
  sessionId: string,
  signal?: AbortSignal
): Promise<EditSnapshotData[]> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit/${sessionId}/snapshots`, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};

export const addEditSnapshot = async (
  sessionId: string,
  data: { stepIndex: number; imageDataUrl: string; layers: Record<string, unknown>[]; prompt?: string },
  signal?: AbortSignal
): Promise<{ id: number; success: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/edit/${sessionId}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    await parseError(response);
  }

  return response.json();
};
