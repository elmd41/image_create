from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/conversations/ping")
async def conversations_ping() -> dict:
    return {"ok": True}
