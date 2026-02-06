
import { ThunderboltOutlined } from '@ant-design/icons';

export const EmptyState: React.FC = () => (
    <div className="h-full flex flex-col justify-center items-center text-[var(--color-text-secondary)] gap-8 select-none relative overflow-hidden">

        {/* Background Glow - Breathing */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[600px] rounded-full bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-[120px] animate-[pulse-glow_4s_ease-in-out_infinite]" />
        </div>

        {/* Icon Container with Glass Effect */}
        <div className="relative z-10 w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-sm animate-scale-in">
            <ThunderboltOutlined className="text-5xl text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
        </div>

        <div className="relative z-10 text-center space-y-2 animate-slide-up">
            <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] tracking-tight">
                开始创作
            </h2>
            <p className="text-[var(--color-text-muted)] text-sm max-w-xs mx-auto">
                输入描述或上传参考图，AI 将为您生成精美图像
            </p>
        </div>
    </div>
);
