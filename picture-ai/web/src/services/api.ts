
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
    alpha_val: number;
    filename?: string;
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
  layer: string,
  prompt: string,
  signal?: AbortSignal
): Promise<InteractiveEditResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/interactive/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, layer, prompt }),
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
