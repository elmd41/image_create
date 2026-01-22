/**
 * 前端主页面组件 (App.tsx)
 * -----------------------
 * 功能：
 * 1. 构建类似聊天的用户交互界面
 * 2. 处理用户输入的文本和图片
 * 3. 调用后端搜索 API 并展示结果
 * 4. 管理消息列表的状态
 * 
 * 作业：
 * - 优化用户体验，添加加载状态提示
 * - 完善移动端适配
  */
 import React, { useState } from 'react';
import { Input, Button, Upload, message, List, Space, Radio, Typography, Tooltip, Image } from 'antd';
import { UploadOutlined, PictureOutlined, SearchOutlined, RetweetOutlined } from '@ant-design/icons';
import { search, generate } from './services/api';
 import type { UploadFile } from 'antd/es/upload/interface';
 
 const API_URL = 'http://127.0.0.1:8000';
 
 interface Message {
  type: 'text' | 'image' | 'mixed';
  content: string; // Image URL or Text content
  text?: string;   // Optional text description for mixed/image messages
  isUser: boolean;
}

const App: React.FC = () => {
  const [mode, setMode] = useState<'search' | 'generate'>('search');
  const [chatHistory, setChatHistory] = useState<{search: Message[], generate: Message[]}>({ search: [], generate: [] });
  const [inputText, setInputText] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  const messages = chatHistory[mode];

  const addMessage = (targetMode: 'search' | 'generate', msg: Message) => {
      setChatHistory(prev => ({
          ...prev,
          [targetMode]: [...prev[targetMode], msg]
      }));
  };

  // Helper: Convert URL to File object for "Use as Reference"
  const urlToFile = async (url: string, filename: string): Promise<File> => {
      const response = await fetch(url);
      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type });
  };

  const handleUseAsReference = async (imageUrl: string) => {
      try {
          message.loading({ content: 'Downloading image...', key: 'download' });
          const filename = 'reference_image.png'; // Default name
          const file = await urlToFile(imageUrl, filename);
          
          // Create UploadFile object for Antd Upload
          const uploadFile: UploadFile = {
              uid: '-1',
              name: filename,
              status: 'done',
              url: imageUrl,
              originFileObj: file as any, // Cast to any to avoid RcFile type mismatch (missing uid)
          };
          
          setFileList([uploadFile]);
          setMode('generate'); // Switch to generate mode automatically
          message.success({ content: 'Image set as reference! Now enter a prompt.', key: 'download' });
      } catch (error) {
          console.error('Failed to set reference image:', error);
          message.error({ content: 'Failed to use image.', key: 'download' });
      }
  };

  const handleAction = async () => {
    if (!inputText && fileList.length === 0) {
      message.error('Please enter text or upload an image.');
      return;
    }

    setLoading(true);
    // Capture the mode at the start of the action to ensure consistency
    const currentMode = mode;

    const formData = new FormData();
    
    // Correctly extract the file object. 
    const fileItem = fileList.length > 0 ? fileList[0] : null;
    // @ts-ignore
    const fileToUpload = (fileItem?.originFileObj || fileItem) as File;
    
    // Show user input in chat (Mixed or Single)
    if (fileToUpload && fileList.length > 0) {
        formData.append('file', fileToUpload);
        const reader = new FileReader();
        reader.onload = () => {
           // If there is also text input, show as mixed message
           if (inputText) {
               addMessage(currentMode, { 
                   type: 'mixed', 
                   content: reader.result as string, 
                   text: inputText,
                   isUser: true 
               });
           } else {
               addMessage(currentMode, { 
                   type: 'image', 
                   content: reader.result as string, 
                   isUser: true 
               });
           }
        };
        reader.readAsDataURL(fileToUpload);
    } else if (inputText) {
        // Only text input
        addMessage(currentMode, { type: 'text', content: inputText, isUser: true });
    }
    
    if (inputText) {
        formData.append('text', inputText);
        // If generation mode and prompt is provided, append it as prompt
        if (currentMode === 'generate') {
            formData.append('prompt', inputText);
        }
    }

    try {
      let response;
      
      if (currentMode === 'search') {
          // --- Search Mode ---
          let topK = '5';
          if (!fileToUpload && inputText) {
              topK = '5'; // Text search
          }
          formData.append('top_k', topK);
          response = await search(formData);
      } else {
          // --- Generate Mode ---
          // If image is provided, it's Image-to-Image (Style Repaint)
          // If only text, it's Text-to-Image
          // Ensure prompt is set (reuse inputText)
          if (!formData.has('prompt') && inputText) {
              formData.append('prompt', inputText);
          }
          // If image-to-image but no prompt, use a default one or error
          if (fileToUpload && !inputText) {
              message.warning('For Image-to-Image generation, a prompt description is recommended.');
              formData.append('prompt', 'optimize this image'); // Default prompt
          }
          
          response = await generate(formData);
      }
      
      const results = response.data.results;
      if (results && results.length > 0) {
        results.forEach((item: any) => {
            // Search returns objects with 'path', Generate returns URL strings directly
            const imageUrl = currentMode === 'search' ? `${API_URL}${item.path}` : item;
            addMessage(currentMode, { type: 'image', content: imageUrl, isUser: false });
        });
      } else {
        addMessage(currentMode, { type: 'text', content: 'No results found.', isUser: false });
      }
    } catch (error) {
      console.error('Operation failed:', error);
      message.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
       addMessage(currentMode, { type: 'text', content: 'Sorry, an error occurred.', isUser: false });
    } finally {
        setLoading(false);
        setInputText('');
        setFileList([]);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      background: '#fff',
      overflow: 'hidden' // Prevent global scrollbar
    }}>
      {/* Header Area */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid #f0f0f0', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        zIndex: 10
      }}>
        <Typography.Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
           <span style={{ fontSize: '24px' }}>🎨</span> 找图生图智能代理
        </Typography.Title>
        <Radio.Group 
            value={mode} 
            onChange={(e) => setMode(e.target.value)} 
            buttonStyle="solid"
            size="large"
        >
            <Radio.Button value="search" style={{ padding: '0 24px' }}><SearchOutlined /> Search (检索)</Radio.Button>
            <Radio.Button value="generate" style={{ padding: '0 24px' }}><PictureOutlined /> Generate (生成)</Radio.Button>
        </Radio.Group>
      </div>

      {/* Chat Area - Takes all available space */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '24px', 
        background: '#f8f9fa',
        scrollBehavior: 'smooth'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', height: '100%' }}>
          {messages.length === 0 ? (
             <div style={{ 
                 height: '100%', 
                 display: 'flex', 
                 flexDirection: 'column', 
                 justifyContent: 'center', 
                 alignItems: 'center', 
                 color: '#ccc',
                 gap: '16px'
             }}>
                 <div style={{ fontSize: '64px', opacity: 0.2 }}>
                     {mode === 'search' ? <SearchOutlined /> : <PictureOutlined />}
                 </div>
                 <Typography.Text type="secondary" style={{ fontSize: '16px' }}>
                     {mode === 'search' ? 'Enter text or upload an image to start searching' : 'Describe what you want to create'}
                 </Typography.Text>
             </div>
          ) : (
            <List
              dataSource={messages}
              split={false}
              renderItem={item => (
                <List.Item style={{ justifyContent: item.isUser ? 'flex-end' : 'flex-start', padding: '16px 0', border: 'none' }}>
                  <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: item.isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '85%' // Increased width for bigger dialogs
                  }}>
                      {/* User Avatar / Bot Avatar Placeholder could go here */}
                      
                      {item.type === 'text' && (
                        <div style={{ 
                            background: item.isUser ? '#1677ff' : '#fff', 
                            color: item.isUser ? '#fff' : '#333', 
                            padding: '16px 20px', 
                            borderRadius: '16px',
                            fontSize: '16px',
                            lineHeight: '1.6',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                            borderTopRightRadius: item.isUser ? '4px' : '16px',
                            borderTopLeftRadius: item.isUser ? '16px' : '4px'
                        }}>
                          {item.content}
                        </div>
                      )}
                      {(item.type === 'image' || item.type === 'mixed') && (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '8px',
                        alignItems: item.isUser ? 'flex-end' : 'flex-start',
                        minWidth: '200px', // Reduced min-width
                        maxWidth: '400px'  // Added max-width constraint
                    }}>
                        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                            <Image 
                                src={item.content} 
                                alt="content" 
                                style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', display: 'block' }} // Limit height and use cover
                                preview={{
                                    maskClassName: 'customize-mask',
                                    mask: <Space><SearchOutlined /> Preview</Space>
                                }}
                            />
                            {!item.isUser && (
                                <Tooltip title="Use this image as reference for next generation">
                                    <Button 
                                        type="primary" 
                                        shape="circle" 
                                        icon={<RetweetOutlined />} 
                                        size="large"
                                        style={{ position: 'absolute', bottom: '12px', right: '12px', opacity: 0.9, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                                        onClick={() => handleUseAsReference(item.content)}
                                    />
                                </Tooltip>
                            )}
                        </div>
                        {item.type === 'mixed' && item.text && (
                            <div style={{ 
                                background: item.isUser ? '#1677ff' : '#fff', 
                                color: item.isUser ? '#fff' : '#333', 
                                padding: '12px 16px', 
                                borderRadius: '16px',
                                fontSize: '16px', 
                                lineHeight: '1.6',
                                wordBreak: 'break-word', 
                                whiteSpace: 'pre-wrap',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                                borderTopRightRadius: item.isUser ? '4px' : '16px',
                                borderTopLeftRadius: item.isUser ? '16px' : '4px'
                            }}>
                                {item.text}
                            </div>
                        )}
                    </div>
                  )}
                  </div>
                </List.Item>
              )}
            />
          )}
           {loading && (
               <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                   <Space direction="vertical">
                       <div className="loading-dots">Processing...</div>
                   </Space>
               </div>
           )}
        </div>
      </div>

      {/* Input Area - Fixed at Bottom */}
      <div style={{ 
          background: '#fff', 
          borderTop: '1px solid #eee', 
          padding: '24px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.02)'
      }}>
         <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
           <Space.Compact style={{ width: '100%', height: '56px', display: 'flex', alignItems: 'stretch' }}>
             <Upload
               fileList={fileList}
               beforeUpload={(file) => {
                 setFileList([file]);
                 return false; 
               }}
               onRemove={() => setFileList([])}
               listType="picture"
               maxCount={1}
               showUploadList={{ showRemoveIcon: true }}
             >
               <Button 
                icon={<UploadOutlined />} 
                style={{ height: '100%', width: '60px', borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px' }} 
               />
             </Upload>
             <Input
               style={{ height: '100%', fontSize: '16px', flex: 1 }}
               value={inputText}
               onChange={(e) => setInputText(e.target.value)}
               placeholder={mode === 'search' ? "Enter text to search images..." : "Describe image to generate..."}
               onPressEnter={handleAction}
               disabled={loading}
               allowClear
             />
             <Button 
                type="primary" 
                onClick={handleAction} 
                loading={loading}
                style={{ height: '100%', padding: '0 32px', fontSize: '16px', fontWeight: 'bold', borderTopRightRadius: '12px', borderBottomRightRadius: '12px' }}
             >
                 {mode === 'search' ? 'Search' : 'Generate'}
             </Button>
           </Space.Compact>
         </div>
      </div>
    </div>
  );
};
 
 export default App;
