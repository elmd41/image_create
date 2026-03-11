import React, { useState } from 'react';
import { Button, Tooltip } from "@heroui/react";
import { PlusOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';

export interface EditSession {
    id: string;
    title: string;
    thumbnail?: string | null;
    layerCount: number;
    stepCount: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    meta?: Record<string, unknown> | null;
}

interface EditHistoryPanelProps {
    sessions: EditSession[];
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

export const EditHistoryPanel: React.FC<EditHistoryPanelProps> = ({
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
                h-full
                bg-[#0f1016]/95 backdrop-blur-xl
                rounded-2xl shadow-2xl
                border border-white/10
                flex flex-col
                transition-all duration-300 ease-in-out
                overflow-hidden shrink-0
                ${isHovered ? 'w-60' : 'w-[72px]'}
            `}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 固定的新建按钮区域 - 固定高度防止跳动 */}
            <div className="px-3 py-3 border-b border-white/10 flex-shrink-0 h-[52px] flex items-center">
                <Tooltip content={isHovered ? "" : "新建编辑"} placement="right" delay={300} isDisabled={isHovered}>
                    <Button
                        size="sm"
                        variant="flat"
                        className={`
                            transition-all duration-300 ease-in-out
                            ${isHovered 
                                ? 'w-full justify-center bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 font-medium' 
                                : 'w-10 min-w-10 justify-center bg-transparent text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                            }
                        `}
                        startContent={<PlusOutlined />}
                        onPress={onNewSession}
                    >
                        <span className={`transition-all duration-300 ${isHovered ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}`}>
                            新建编辑
                        </span>
                    </Button>
                </Tooltip>
            </div>

            {/* 会话列表区域 */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
                {sessions.length === 0 ? (
                    <div className={`text-center text-white/30 text-xs py-8 ${isHovered ? '' : 'hidden'}`}>
                        暂无编辑历史
                        <br />
                        <span className="text-white/20">上传图片后自动保存</span>
                    </div>
                ) : isHovered ? (
                    /* 展开状态 - 详细列表 */
                    <div className="flex flex-col gap-1">
                        {sessions.map(session => (
                            <div
                                key={session.id}
                                className={`
                                    group flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer transition-all
                                    ${session.id === currentSessionId
                                        ? 'bg-cyan-500/15 border border-cyan-500/30'
                                        : 'hover:bg-white/5 border border-transparent'}
                                `}
                                onClick={() => onSelectSession(session.id)}
                            >
                                {/* Thumbnail */}
                                {session.thumbnail ? (
                                    <img
                                        src={session.thumbnail}
                                        alt=""
                                        className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                        <HistoryOutlined className="text-white/30 text-sm" />
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-white/90 truncate font-medium">
                                        {session.title || `编辑 ${session.id.slice(0, 6)}`}
                                    </div>
                                    <div className="text-[11px] text-white/40">
                                        {session.layerCount}层 · {session.stepCount}步 · {formatTime(session.updatedAt)}
                                    </div>
                                </div>

                                {/* Delete Button */}
                                <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all min-w-6 w-6 h-6"
                                    onPress={() => onDeleteSession(session.id)}
                                >
                                    <DeleteOutlined className="text-xs" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* 收起状态 - 大缩略图 */
                    <div className="flex flex-col items-center gap-2">
                        {sessions.slice(0, 4).map(session => (
                            <Tooltip key={session.id} content={session.title || `编辑 ${session.id.slice(0, 6)}`} placement="right" delay={200}>
                                <div
                                    className={`
                                        w-12 h-12 rounded-xl cursor-pointer transition-all
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
                                        <HistoryOutlined className={`text-base ${session.id === currentSessionId ? 'text-cyan-400' : 'text-white/30'}`} />
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
