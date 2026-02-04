"""Vision prompt optimization service."""

from __future__ import annotations

import logging


logger = logging.getLogger(__name__)


class VisionService:
    """Minimal prompt optimization service.

    This module exists to keep the generation pipeline runnable even when
    advanced prompt engineering is not available.
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

    def optimize_text_prompt_with_confirm(self, user_prompt: str, context: str | None = None) -> dict[str, str]:
        """Return {optimized_prompt, assistant_confirm} for text-to-image."""
        optimized_prompt = (user_prompt or "").strip() or user_prompt
        assistant_confirm = self._fallback_confirm_text(user_prompt)

        return {"optimized_prompt": optimized_prompt, "assistant_confirm": assistant_confirm}

    def optimize_prompt_with_confirm(self, image_path: str, user_prompt: str, context: str | None = None) -> dict[str, str]:
        """Return {optimized_prompt, assistant_confirm} for image-to-image."""
        optimized_prompt = (user_prompt or "").strip() or user_prompt
        assistant_confirm = self._fallback_confirm_edit(user_prompt)

        return {"optimized_prompt": optimized_prompt, "assistant_confirm": assistant_confirm}


vision_service = VisionService()
