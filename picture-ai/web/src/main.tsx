/**
 * 前端应用入口文件
 * ---------------
 * 功能：
 * 1. 挂载 React 应用到 DOM 节点
 * 2. 配置全局样式或上下文（如有）
 * 
 * 作业：
 * - 检查 React.StrictMode 在开发模式下的影响
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
