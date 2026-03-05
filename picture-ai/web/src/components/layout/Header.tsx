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
            className="bg-[#08080c]/80 backdrop-blur-xl border-b border-[var(--color-border-subtle)] sticky top-0 z-50 h-16"
            classNames={{
                wrapper: "px-6"
            }}
        >
            <NavbarBrand>
                {/* Minimalist Logo */}
                <div className="group flex items-center gap-3 select-none cursor-default">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-500 flex items-center justify-center shadow-lg">
                        <BgColorsOutlined className="text-white text-base" />
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 group-hover:to-indigo-400 transition-all duration-500">
                        Picture AI
                    </span>
                    <div className="h-[1px] w-0 group-hover:w-full bg-indigo-500 transition-all duration-700 ease-[var(--ease-spring)] absolute bottom-0 left-0" />
                </div>
            </NavbarBrand>

            <NavbarContent justify="center">
                <NavbarItem>
                    <div className="flex p-1 bg-white/[0.03] backdrop-blur-md rounded-full border border-white/[0.05]">
                        <Button
                            size="sm"
                            radius="full"
                            variant={activeTab === 'chat' ? "shadow" : "light"}
                            className={`font-medium transition-all duration-300 ${activeTab === 'chat'
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
                            className={`font-medium transition-all duration-300 ${activeTab === 'edit'
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

            <NavbarContent justify="end">
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
