import React, { useState } from 'react';
import { Button, Tooltip } from "@heroui/react";
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';

export interface ChatSession {
    id: string;
    title: string;
    thumbnail?: string | null;
    firstPrompt?: string | null;
    createdAt: Date;
    updatedAt: Date;
    messageCount: number;
}

interface ChatHistoryPanelProps {
    sessions: ChatSession[];
    currentSessionId: string | null;
    onSelectSession: (sessionId: string) => void;
    onNewSession: () => void;
    onDeleteSession: (sessionId: string) => void;
}

const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
    sessions,
    currentSessionId,
    onSelectSession,
    onNewSession,
    onDeleteSession,
}) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className={`
                h-full shrink-0
                bg-[#0f1016]/95 backdrop-blur-xl
                rounded-2xl shadow-2xl
                border border-white/10
                flex flex-col
                transition-all duration-300 ease-in-out
                overflow-hidden
                ${isHovered ? 'w-56' : 'w-[72px]'}
            `}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 新建按钮区域 */}
            <div className="px-2 py-3 border-b border-white/10 flex-shrink-0 flex justify-center">
                <Tooltip content={isHovered ? "" : "新建对话"} placement="right" delay={300} isDisabled={isHovered}>
                    <Button
                        size="sm"
                        variant="flat"
                        className={`
                            transition-all duration-300 ease-in-out h-9
                            ${isHovered 
                                ? 'w-full justify-center bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 font-medium' 
                                : 'w-9 min-w-9 justify-center bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                            }
                        `}
                        startContent={<PlusOutlined />}
                        onPress={onNewSession}
                    >
                        {isHovered && <span className="ml-1">新建对话</span>}
                    </Button>
                </Tooltip>
            </div>

            {/* 会话列表区域 */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
                {sessions.length === 0 ? (
                    <div className={`text-center text-white/30 text-xs py-6 ${isHovered ? '' : 'hidden'}`}>
                        暂无历史会话
                    </div>
                ) : isHovered ? (
                    /* 展开状态 */
                    <div className="flex flex-col gap-1">
                        {sessions.map(session => (
                            <div
                                key={session.id}
                                className={`
                                    group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all
                                    ${session.id === currentSessionId
                                        ? 'bg-cyan-500/15 border border-cyan-500/30'
                                        : 'hover:bg-white/5 border border-transparent'}
                                `}
                                onClick={() => onSelectSession(session.id)}
                            >
                                {session.thumbnail ? (
                                    <img src={session.thumbnail} alt="" className="w-8 h-8 rounded-md object-cover border border-white/10 shrink-0" />
                                ) : (
                                    <div className="w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                        <MessageOutlined className="text-white/30 text-xs" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-white/90 truncate">{session.firstPrompt || session.title || '新会话'}</div>
                                    <div className="text-[10px] text-white/40">{formatTime(session.createdAt)}</div>
                                </div>
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 min-w-5 w-5 h-5"
                                    onPress={() => onDeleteSession(session.id)}
                                >
                                    <DeleteOutlined className="text-[10px]" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* 收起状态 - 缩略图 */
                    <div className="flex flex-col items-center gap-2">
                        {sessions.slice(0, 6).map(session => (
                            <Tooltip key={session.id} content={session.firstPrompt || session.title || '新会话'} placement="right" delay={200}>
                                <div
                                    className={`
                                        w-10 h-10 rounded-lg cursor-pointer transition-all
                                        border flex items-center justify-center shrink-0 overflow-hidden
                                        ${session.id === currentSessionId 
                                            ? 'border-cyan-400 ring-2 ring-cyan-400/30' 
                                            : 'border-white/10 hover:border-cyan-400/50'}
                                    `}
                                    onClick={() => onSelectSession(session.id)}
                                >
                                    {session.thumbnail ? (
                                        <img src={session.thumbnail} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <MessageOutlined className={`text-sm ${session.id === currentSessionId ? 'text-cyan-400' : 'text-white/30'}`} />
                                    )}
                                </div>
                            </Tooltip>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
