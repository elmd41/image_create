"""Vision prompt optimization service.

受限扩写策略：
- 当用户指令很简单（一个词/一个参数）时，可以扩写成一句通顺的话
- 但扩写时禁止添加地毯参数（颜色/风格/比例/场景/纹理/材质/图案等）
- 只做"语义通顺化"，不做"参数注入"
"""

from __future__ import annotations

import logging

from dashscope import Generation

from app.config.settings import settings


logger = logging.getLogger(__name__)


# 受限扩写的 system prompt
_CONSTRAINED_EXPAND_SYSTEM_PROMPT = """你是一个地毯图像生成的提示词助手。你的任务是将用户的简单指令扩写成一句通顺的话。

【核心规则】
1. 你只能让语句更通顺，不能添加任何用户没说的地毯参数
2. 禁止添加的参数包括：颜色、风格流派、比例、场景、纹理、材质、图案、形状等
3. 如果用户说"红色"，你可以说"生成一张主体红色的地毯图"，但不能说"生成一张红色的波西米亚风格地毯图"
4. 如果用户说"波西米亚"，你可以说"生成一张波西米亚风格的地毯"，但不能说"生成一张红色波西米亚风格的地毯"
5. 保持扩写简洁，一句话即可

【正确示例】
- 用户输入：红色 → 输出：生成一张主体红色的地毯图
- 用户输入：改成蓝色 → 输出：将地毯的主体颜色修改为蓝色
- 用户输入：波西米亚 → 输出：生成一张波西米亚风格的地毯

【错误示例（禁止）】
- 用户输入：红色 → 输出：生成一张红色的波西米亚风格地毯图（错误：添加了风格）
- 用户输入：改成蓝色 → 输出：将地毯的颜色修改为深蓝色并添加几何图案（错误：添加了图案）

直接输出扩写后的提示词，不要解释。"""


class VisionService:
    """受限扩写服务。
    
    当用户指令很简单时调用 DashScope 扩写成通顺句子，
    但严格禁止添加用户未提及的地毯参数。
    """

    @staticmethod
    def _fallback_confirm_text(user_prompt: str) -> str:
        p = (user_prompt or "").strip()
        if not p:
            return "将帮你生成一张地毯图。"
        if len(p) <= 24:
            return f"将帮你生成{p}的地毯图。"
        return f"将帮你生成{p[:24]}…的地毯图。"

    @staticmethod
    def _fallback_confirm_edit(user_prompt: str) -> str:
        p = (user_prompt or "").strip()
        if not p:
            return "修改地毯：按你的要求调整细节。"
        if len(p) <= 24:
            return f"修改地毯：{p}。"
        return f"修改地毯：{p[:24]}…"

    @staticmethod
    def _is_simple_prompt(user_prompt: str) -> bool:
        """判断用户输入是否足够简单，需要扩写。
        
        只有非常简短的输入（如单个词、单个颜色）才需要扩写。
        """
        p = (user_prompt or "").strip()
        if not p:
            return False
        # 中文：少于 8 个字符才认为是简单指令
        # 这样 "红色"、"波西米亚"、"改成蓝色" 会触发扩写
        # 但 "图中所有小花小草的图案修改为小鹿小马的图案" 不会
        return len(p) <= 8

    def _call_dashscope_expand(self, user_prompt: str) -> str | None:
        """调用 DashScope 进行受限扩写。"""
        if not settings.API_KEY:
            logger.warning("DASHSCOPE_API_KEY 未配置，跳过扩写")
            return None

        try:
            response = Generation.call(
                api_key=settings.API_KEY,
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": _CONSTRAINED_EXPAND_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                result_format="message",
            )
            if response.status_code == 200:
                content = response.output.choices[0].message.content
                expanded = (content or "").strip()
                if expanded:
                    logger.info("【受限扩写】%s → %s", user_prompt, expanded)
                    return expanded
            else:
                logger.warning("DashScope 扩写失败: %s", response.message)
        except Exception as e:
            logger.warning("DashScope 扩写异常: %s", e)

        return None

    def optimize_text_prompt_with_confirm(self, user_prompt: str, context: str | None = None) -> dict[str, str]:
        """Return {optimized_prompt, assistant_confirm} for text-to-image."""
        p = (user_prompt or "").strip()
        
        # 如果是简单指令，尝试受限扩写
        if self._is_simple_prompt(p):
            expanded = self._call_dashscope_expand(p)
            if expanded:
                return {
                    "optimized_prompt": expanded,
                    "assistant_confirm": self._fallback_confirm_text(p),
                }

        # 否则原样返回
        return {
            "optimized_prompt": p or user_prompt,
            "assistant_confirm": self._fallback_confirm_text(p),
        }

    def optimize_prompt_with_confirm(self, image_path: str, user_prompt: str, context: str | None = None) -> dict[str, str]:
        """Return {optimized_prompt, assistant_confirm} for image-to-image."""
        p = (user_prompt or "").strip()

        # 如果是简单指令，尝试受限扩写
        if self._is_simple_prompt(p):
            expanded = self._call_dashscope_expand(p)
            if expanded:
                return {
                    "optimized_prompt": expanded,
                    "assistant_confirm": self._fallback_confirm_edit(p),
                }

        # 否则原样返回
        return {
            "optimized_prompt": p or user_prompt,
            "assistant_confirm": self._fallback_confirm_edit(p),
        }


vision_service = VisionService()
