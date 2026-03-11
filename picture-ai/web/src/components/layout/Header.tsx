import React from 'react';
import { Navbar, NavbarBrand, NavbarContent, NavbarItem, Button } from "@heroui/react";
import { BgColorsOutlined } from '@ant-design/icons';

interface HeaderProps {
    activeTab: 'chat' | 'edit';
    onChangeTab: (tab: 'chat' | 'edit') => void;
    editModeActive?: boolean;
    onExitEditMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    activeTab,
    onChangeTab,
    editModeActive,
    onExitEditMode
}) => {
    return (
        <Navbar
            maxWidth="full"
            className="bg-[#08080c]/90 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50 h-14"
            classNames={{
                wrapper: "px-6 max-w-none"
            }}
        >
            <NavbarBrand className="flex-none">
                {/* Minimalist Logo */}
                <div className="group flex items-center gap-2.5 select-none cursor-default">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 flex items-center justify-center shadow-lg">
                        <BgColorsOutlined className="text-white text-sm" />
                    </div>
                    <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        RugCanvas
                    </span>
                </div>
            </NavbarBrand>

            <NavbarContent justify="center" className="absolute left-1/2 -translate-x-1/2">
                <NavbarItem>
                    <div className="flex p-1 bg-white/[0.03] backdrop-blur-md rounded-full border border-white/[0.05]">
                        <Button
                            size="sm"
                            radius="full"
                            variant={activeTab === 'chat' ? "shadow" : "light"}
                            className={`font-medium transition-all duration-300 px-4 ${activeTab === 'chat'
                                    ? "bg-[#1f2029] text-white shadow-lg border border-white/10"
                                    : "text-white/50 hover:text-white/80"
                                }`}
                            onPress={() => onChangeTab('chat')}
                        >
                            生图 / 搜图
                        </Button>
                        <Button
                            size="sm"
                            radius="full"
                            variant={activeTab === 'edit' ? "shadow" : "light"}
                            className={`font-medium transition-all duration-300 px-4 ${activeTab === 'edit'
                                    ? "bg-[#1f2029] text-white shadow-lg border border-white/10"
                                    : "text-white/50 hover:text-white/80"
                                }`}
                            onPress={() => onChangeTab('edit')}
                        >
                            分层编辑
                        </Button>
                    </div>
                </NavbarItem>
            </NavbarContent>

            <NavbarContent justify="end" className="flex-none">
                {/* 退出编辑按钮仅在分层编辑tab且编辑模式激活时显示 */}
                {activeTab === 'edit' && editModeActive && (
                    <NavbarItem>
                        <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            radius="full"
                            className="bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            onPress={onExitEditMode}
                        >
                            退出编辑
                        </Button>
                    </NavbarItem>
                )}
            </NavbarContent>
        </Navbar>
    );
};
