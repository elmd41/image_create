from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/interactive/ping")
async def interactive_ping() -> dict:
    return {"ok": True}
