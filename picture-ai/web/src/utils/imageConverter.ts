/**
 * 图片格式转换工具
 * 将不支持的图片格式（TIFF、BMP等）转换为支持的格式（PNG/JPEG）
 * 对于浏览器不支持的格式（如TIFF），使用后端API转换
 */

const API_BASE_URL = import.meta.env.PROD ? '' : 'http://127.0.0.1:8000';

const MAX_DIMENSION = 4096;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - 增大限制以支持更大的地毯图

// 浏览器原生不支持的格式，需要后端转换
const BACKEND_CONVERT_FORMATS = ['tiff', 'tif', 'bmp', 'heic', 'heif', 'psd', 'raw', 'cr2', 'nef', 'arw', 'dng'];

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
  
  try {
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
  } catch (error) {
    // 如果后端不可用，尝试使用 FileReader 读取文件
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.warn('后端转换服务不可用，尝试本地处理');
      return await convertLocallyWithFileReader(file);
    }
    throw error;
  }
}

/**
 * 使用 FileReader 本地转换图片（后备方案）
 */
async function convertLocallyWithFileReader(file: File): Promise<{
  file: File;
  previewUrl: string;
  converted: boolean;
  message: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string;
        // 尝试加载图片
        const img = new Image();
        img.onload = () => {
          // 创建 canvas 转换为 PNG
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.png'), { type: 'image/png' });
                const previewUrl = URL.createObjectURL(newFile);
                resolve({
                  file: newFile,
                  previewUrl,
                  converted: true,
                  message: '已本地转换为 PNG 格式',
                });
              } else {
                reject(new Error('图片转换失败'));
              }
            }, 'image/png');
          } else {
            reject(new Error('Canvas 创建失败'));
          }
        };
        img.onerror = () => {
          // 如果图片无法加载（如 TIFF），返回原文件但提示错误
          reject(new Error('此图片格式需要后端服务支持，请确保后端服务已启动'));
        };
        img.src = dataUrl;
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
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
  const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('压缩失败'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    });
  };

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = async () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      let statusText = '';
      
      // 检查是否需要缩放
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        statusText = `图片已缩放至 ${width}×${height}`;
      }

      let quality = 0.9;
      let scaleFactor = 1;
      let compressedBlob: Blob | null = null;
      let finalWidth = width;
      let finalHeight = height;

      try {
        for (let i = 0; i < 8; i++) {
          const attemptWidth = Math.max(1, Math.round(width * scaleFactor));
          const attemptHeight = Math.max(1, Math.round(height * scaleFactor));

          const canvas = document.createElement('canvas');
          canvas.width = attemptWidth;
          canvas.height = attemptHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 创建失败'));
            return;
          }

          ctx.drawImage(img, 0, 0, attemptWidth, attemptHeight);
          const blob = await canvasToJpegBlob(canvas, quality);

          compressedBlob = blob;
          finalWidth = attemptWidth;
          finalHeight = attemptHeight;

          if (blob.size <= MAX_FILE_SIZE) {
            break;
          }

          if (quality > 0.55) {
            quality = Math.max(0.55, quality - 0.1);
          } else {
            scaleFactor = Math.max(0.5, scaleFactor * 0.85);
          }
        }
      } catch (e) {
        reject(e instanceof Error ? e : new Error('压缩失败'));
        return;
      }

      if (!compressedBlob) {
        reject(new Error('压缩失败'));
        return;
      }

      const newFileName = file.name.replace(/\.[^/.]+$/, '.jpg');
      const newFile = new File([compressedBlob], newFileName, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(newFile);

      const sizeText = `${(newFile.size / 1024 / 1024).toFixed(2)}MB`;
      const dimensionChanged = finalWidth !== img.width || finalHeight !== img.height;
      const dimText = dimensionChanged ? `，尺寸 ${finalWidth}×${finalHeight}` : '';
      const message = `${statusText || '图片已压缩'}${dimText}，体积 ${sizeText}`;

      resolve({ file: newFile, previewUrl, converted: true, message });
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
