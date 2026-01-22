
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

export const search = async (formData: FormData) => {
  const response = await fetch(`${API_BASE_URL}/api/search`, {
    method: 'POST',
    body: formData,
    // When using FormData with fetch, the browser automatically sets the
    // 'Content-Type' header with the correct 'boundary' parameter.
    // Manually setting it will cause errors.
  });

  if (!response.ok) {
    // If the response is not OK, try to parse the error message from the backend
    const errorBody = await response.json().catch(() => {
      // If the body is not JSON or empty, create a fallback error
      return { detail: `HTTP error! status: ${response.status}` };
    });
    // Throw an error that can be caught by the UI
    throw new Error(errorBody.detail || 'An unknown error occurred');
  }

  // The calling code in App.tsx expects a response object with a `data` property,
  // similar to how axios structures its responses. We'll mimic that structure.
  const responseData = await response.json();
  return { data: responseData };
};

export const generate = async (formData: FormData) => {
  const response = await fetch(`${API_BASE_URL}/api/generate`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => {
      return { detail: `HTTP error! status: ${response.status}` };
    });
    throw new Error(errorBody.detail || 'Generation failed');
  }

  const responseData = await response.json();
  return { data: responseData };
};
