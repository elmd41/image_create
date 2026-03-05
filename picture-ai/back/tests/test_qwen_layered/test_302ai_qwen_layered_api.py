import requests
import json
import base64
import time

# ==================== 配置 ====================
API_KEY = "sk-s47wpiDP8Nt10Jf7A6LK0vlsE4p9cebwZHbLxZx96p19cVnY"
INPUT_IMAGE = r"F:\work\image_create-master\picture-ai\data\images\image (2).tiff"
OUTPUT_DIR = r"F:\work\image_create-master\picture-ai\back\tests\test_qwen_layered\output"
NUM_LAYERS = 3
# ==============================================

# 图片转 base64
with open(INPUT_IMAGE, "rb") as f:
    image_url = f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"

# 提交任务
url = "https://api.302.ai/302/submit/qwen-image-layered"
payload = json.dumps({
    "image_url": image_url,
    "prompt": "",
    "num_layers": NUM_LAYERS,
    "enable_safety_checker": True,
    "output_format": "png"
})
headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}

response = requests.post(url, headers=headers, data=payload)
print(f"提交: {response.text}")
request_id = response.json().get("request_id")

# 轮询获取结果
result_url = f"{url}?request_id={request_id}"
for i in range(60):
    time.sleep(5)
    res = requests.get(result_url, headers={'Authorization': f'Bearer {API_KEY}'})
    data = res.json()
    if "images" in data:
        print(json.dumps(data, indent=2))
        # 下载图片
        import os
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        for idx, img in enumerate(data["images"]):
            img_data = requests.get(img["url"]).content
            with open(f"{OUTPUT_DIR}/layer_{idx}.png", "wb") as f:
                f.write(img_data)
        print(f"图片已保存到: {OUTPUT_DIR}")
        break
    print(f"[{(i+1)*5}s] {data.get('detail', data.get('status', ''))}")
