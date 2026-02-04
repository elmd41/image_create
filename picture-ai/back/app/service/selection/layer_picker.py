from __future__ import annotations

import numpy as np


LAYER_ORDER = (
    "border",
    "field",
    "rug",
    "background",
)


def pick_layer(masks: dict[str, np.ndarray], x: int, y: int) -> tuple[str, np.ndarray]:
    """Pick layer by clicking point (x,y).

    Expects masks contain *_mask keys, or {border_mask, field_mask, rug_mask, background_mask}.
    Returns: (layer_name, selected_mask)
    """
    if not masks:
        raise ValueError("masks is empty")
    if x < 0 or y < 0:
        raise ValueError("x/y must be >= 0")

    def _get(key: str) -> np.ndarray | None:
        return masks.get(key) or masks.get(f"{key}_mask")

    candidates: list[tuple[str, np.ndarray]] = []
    for layer in LAYER_ORDER:
        m = _get(layer)
        if m is None:
            continue
        candidates.append((layer, m))

    if not candidates:
        raise ValueError("no known masks")

    for layer, m in candidates:
        if y < m.shape[0] and x < m.shape[1] and int(m[y, x]) > 0:
            return layer, m

    # fallback: if click outside any mask, return rug if exists else first
    rug = _get("rug")
    if rug is not None:
        return "rug", rug
    return candidates[0]
