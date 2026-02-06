export interface Message {
    type: 'text' | 'image' | 'mixed';
    content: string;
    text?: string;
    prompt?: string;
    referenceImage?: string;
    source?: 'user' | 'search' | 'generate' | 'color_edit' | 'crop_edit';
    params?: {
        style?: string;
        ratio?: string;
        color?: string;
        scene?: string;
    };
    isUser: boolean;
}

export interface GenerateParams {
    style: string;
    ratio: string;
    color: string;
    scene: string;
}

// Response from backend for interactive upload
export interface InteractiveUploadResponse {
    session_id: string;
    meta: {
        w: number;
        h: number;
        seg_mode: string;
    };
}

export interface EditModeState {
    active: boolean;
    sessionId: string | null;
    currentImageDataUrl: string | null;
    maskDataUrl: string | null;
    selectedLayer: string | null;
    meta: InteractiveUploadResponse['meta'] | null;
    editLoading: boolean;
    history: string[]; // dataUrl array
}
