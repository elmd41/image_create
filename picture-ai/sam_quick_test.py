import time
import cv2
import numpy as np
import torch
from segment_anything import sam_model_registry, SamPredictor

CHECKPOINT = r"F:\work\picture-ai-new\picture-ai\back\models\sam\sam_vit_b_01ec64.pth"
MODEL_TYPE = "vit_b"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

IMG_PATH = r"F:\work\picture-ai-new\picture-ai\rug.png"
OUT_MASK = r"F:\work\picture-ai-new\picture-ai\sam_mask.png"

def main():
    t0 = time.time()
    print("[1/6] torch cuda available =", torch.cuda.is_available(), "device =", DEVICE, flush=True)

    print("[2/6] reading image:", IMG_PATH, flush=True)
    img_bgr = cv2.imread(IMG_PATH)
    if img_bgr is None:
        raise FileNotFoundError(f"Cannot read image: {IMG_PATH}")

    h0, w0 = img_bgr.shape[:2]
    print(f"[3/6] image loaded: {w0}x{h0}", flush=True)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    print("[4/6] loading SAM model...", flush=True)
    sam = sam_model_registry[MODEL_TYPE](checkpoint=CHECKPOINT)

    print("[5/6] moving model to device (this may take a bit)...", flush=True)
    sam.to(device=DEVICE)

    predictor = SamPredictor(sam)
    predictor.set_image(img_rgb)
    print("[6/6] running predict...", flush=True)

    x, y = w0 // 2, h0 // 2
    point_coords = np.array([[x, y]])
    point_labels = np.array([1])

    masks, scores, _ = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=True,
    )

    best = int(np.argmax(scores))
    mask = masks[best].astype(np.uint8) * 255

    ok = cv2.imwrite(OUT_MASK, mask)
    print("best_score:", float(scores[best]), flush=True)
    print("write ok:", ok, "saved:", OUT_MASK, flush=True)
    print("done, seconds:", round(time.time() - t0, 2), flush=True)

if __name__ == "__main__":
    main()
