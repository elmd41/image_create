import React from 'react';
import { Button } from "@heroui/react";
import { PlusOutlined } from '@ant-design/icons';

/**
 * 分层编辑左侧边栏
 * 简洁方框样式
 */
interface EditSidebarProps {
    onNewSession: () => void;
}

export const EditSidebar: React.FC<EditSidebarProps> = ({ onNewSession }) => {
    return (
        <div className="w-44 h-full shrink-0 bg-[#0f1016]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden">
            {/* 新建编辑按钮 - 简洁方框样式 */}
            <div className="px-3 pt-3 pb-2">
                <Button
                    size="sm"
                    variant="flat"
                    className="w-full h-9 justify-center bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 font-medium"
                    startContent={<PlusOutlined />}
                    onPress={onNewSession}
                >
                    新建编辑
                </Button>
            </div>

            {/* 分隔线 */}
            <div className="mx-3 h-px bg-white/10" />

            {/* 历史编辑区域 */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
                <div className="text-[10px] text-white/30 text-center py-4">
                    暂无历史编辑
                </div>
            </div>
        </div>
    );
};
