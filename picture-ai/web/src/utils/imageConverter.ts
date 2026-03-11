/**
 * 图片格式转换工具
 * 将不支持的图片格式（TIFF、BMP等）转换为支持的格式（PNG/JPEG）
 * 对于浏览器不支持的格式（如TIFF），使用后端API转换
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

const MAX_DIMENSION = 2048;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

// 浏览器原生不支持的格式，需要后端转换
const BACKEND_CONVERT_FORMATS = ['tiff', 'tif', 'heic', 'heif', 'psd', 'raw', 'cr2', 'nef', 'arw', 'dng'];

/**
 * 将 File 转换为可显示和处理的格式
 * @param file 原始文件
 * @returns 处理后的 File 和预览 URL
 */
export async function convertImageFile(file: File): Promise<{
  file: File;
  previewUrl: string;
  converted: boolean;
  message?: string;
}> {
  const fileExt = file.name.toLowerCase().split('.').pop() || '';
  
  // 检查是否需要后端转换
  if (BACKEND_CONVERT_FORMATS.includes(fileExt)) {
    return await convertWithBackend(file);
  }
  
  // 尝试浏览器端处理
  try {
    const previewUrl = URL.createObjectURL(file);
    await testImageLoad(previewUrl);
    
    // 如果文件太大，进行压缩
    if (file.size > MAX_FILE_SIZE) {
      URL.revokeObjectURL(previewUrl);
      return await compressInBrowser(file);
    }
    
    return { file, previewUrl, converted: false };
  } catch {
    // 浏览器加载失败，尝试后端转换
    return await convertWithBackend(file);
  }
}

/**
 * 使用后端 API 转换图片
 */
async function convertWithBackend(file: File): Promise<{
  file: File;
  previewUrl: string;
  converted: boolean;
  message: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE_URL}/api/convert/image`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: '转换失败' }));
    throw new Error(error.detail || '图片转换失败');
  }
  
  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') ? '.jpg' : '.png';
  const newFileName = file.name.replace(/\.[^/.]+$/, ext);
  
  const newFile = new File([blob], newFileName, { type: contentType });
  const previewUrl = URL.createObjectURL(newFile);
  
  return {
    file: newFile,
    previewUrl,
    converted: true,
    message: `已转换为 ${ext === '.jpg' ? 'JPEG' : 'PNG'} 格式`,
  };
}

/**
 * 测试图片是否能加载
 */
function testImageLoad(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

/**
 * 浏览器端压缩大图片
 */
async function compressInBrowser(file: File): Promise<{
  file: File;
  previewUrl: string;
  converted: boolean;
  message: string;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      let message = '';
      
      // 检查是否需要缩放
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        message = `图片已缩放至 ${width}×${height}`;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas 创建失败'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // 输出为 JPEG 以减小文件大小
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('压缩失败'));
          return;
        }
        
        const newFileName = file.name.replace(/\.[^/.]+$/, '.jpg');
        const newFile = new File([blob], newFileName, { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(newFile);
        
        message = message ? `${message}，已压缩` : '图片已压缩';
        resolve({ file: newFile, previewUrl, converted: true, message });
      }, 'image/jpeg', 0.85);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    
    img.src = url;
  });
}

/**
 * 清理预览 URL
 */
export function revokePreviewUrl(url: string | null) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
