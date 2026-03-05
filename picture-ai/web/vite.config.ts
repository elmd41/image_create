/**
 * Vite 构建配置文件
 * ----------------
 * 功能：
 * 1. 配置前端构建工具 Vite
 * 2. 加载 React 插件
 * 3. 可以配置代理服务器（proxy）解决开发环境跨域问题
 * 
 * 作业：
 * - 尝试配置 server.proxy，将 /api 请求转发到后端 8000 端口，这样前端代码中就可以写相对路径了
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000, // 提高警告阈值到 1000kb
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
        },
      },
    },
  },
})
