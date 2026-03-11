export interface Message {
    type: 'text' | 'image' | 'mixed' | 'image_grid';
    content: string;
    images?: string[];  // 用于 image_grid 类型，存储多张图片
    text?: string;
    prompt?: string;
    referenceImage?: string;
    source?: 'user' | 'search' | 'generate' | 'color_edit' | 'crop_edit' | 'color_variant';
    params?: {
        style?: string;
        ratio?: string;
        color?: string;
        scene?: string;
    };
    // 套色配置 - 用于重新生成套色
    colorVariantConfig?: {
        originalImageBase64: string;  // 原始图片 base64
        count: number;
        colorScheme: string[] | null;
    };
    isUser: boolean;
}

export interface GenerateParams {
    style: string;
    ratio: string;
    color: string;
    scene: string;
}

export interface LayerItem {
    id: string;
    name: string;
    visible: boolean;
    deleted: boolean;
    selected: boolean;
    thumbnail?: string;
    maskDataUrl?: string;
}

export interface EditSnapshot {
    imageDataUrl: string;
    layers: LayerItem[];
}

// Response from backend for interactive upload
export interface InteractiveUploadResponse {
    session_id: string;
    meta: {
        w: number;
        h: number;
        seg_mode: string;
        layer_count?: number;
        layer_names?: string[];
        qwen_status?: string;
    };
}

export interface EditModeState {
    active: boolean;
    sessionId: string | null;
    currentImageDataUrl: string | null;
    meta: InteractiveUploadResponse['meta'] | null;
    editLoading: boolean;
    layers: LayerItem[];
    historyStack: EditSnapshot[];
    futureStack: EditSnapshot[];
    initialSnapshot: EditSnapshot | null;
}
