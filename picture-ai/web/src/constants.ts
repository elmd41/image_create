export const DEFAULT_SCENE_VALUE = '平面设计图';

export const STYLE_OPTIONS = [
    { value: '波斯风', label: '波斯风' },
    { value: '土耳其', label: '土耳其' },
    { value: '高加索', label: '高加索' },
    { value: '摩洛哥', label: '摩洛哥' },
    { value: '硬度手工风', label: '硬度手工风' },
    { value: '中式古典', label: '中式古典' },
    { value: '北欧极简', label: '北欧极简' },
];

export const RATIO_OPTIONS = [
    { value: '1:1', label: '1:1' },
    { value: '2:3', label: '2:3' },
    { value: '3:4', label: '3:4' },
    { value: '4:3', label: '4:3' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '满铺', label: '满铺' },
];

export const COLOR_OPTIONS = [
    { value: '红色', label: '红色' },
    { value: '蓝色', label: '蓝色' },
    { value: '绿色', label: '绿色' },
];

export const SCENE_OPTIONS = [
    { value: DEFAULT_SCENE_VALUE, label: '平面设计图（默认值）' },
    { value: '场景透视', label: '场景透视（室内摆拍）' },
    { value: '阳光照射', label: '阳光照射（窗光投影）' },
    { value: '棚拍产品图', label: '棚拍产品图（白棚柔光）' },
    { value: '木地板场景', label: '木地板场景（温暖家居）' },
    { value: '家具虚化背景', label: '家具虚化背景（空间感）' },
    { value: '纹理细节', label: '纹理细节（局部特写）' },
    { value: '3D渲染', label: '3D渲染（效果图）' },
];

export const PARAM_LABELS: Record<string, string> = {
    style: '风格流派',
    ratio: '比例',
    color: '主体颜色',
    scene: '场景/图结构',
};

export const PARAM_ORDER_DEFAULT = ['style', 'ratio', 'color', 'scene'];
