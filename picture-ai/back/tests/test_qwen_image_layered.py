"""
Qwen-Image-Layered（图片分层）测试脚本

功能：
- 读取本地图片并转为 Base64 Data URL
- 调用 302.ai Qwen-Image-Layered 接口
- 保存分层结果到 tests 下新建文件夹
"""

import http.client
import json
import base64
from pathlib import Path
from datetime import datetime

# 本地图片路径
IMAGE_PATH = Path(r"F:\work\image_create-master\picture-ai\data\images\carpet.png")

# 输出目录
OUTPUT_DIR = Path(__file__).parent / "qwen_output" / datetime.now().strftime("%Y%m%d_%H%M%S")


def image_to_base64_url(image_path: Path) -> str:
    """将本地图片转为 Base64 Data URL"""
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    # 假设是 png 格式，根据实际情况调整
    return f"data:image/png;base64,{b64}"


def submit_request(image_url: str) -> dict:
    """提交分层请求"""
    conn = http.client.HTTPSConnection("api.302.ai")
    payload = json.dumps({
        "image_url": image_url,
        "prompt": "",
        "num_layers": 4,
        "enable_safety_checker": True,
        "output_format": "png"
    })
    headers = {
        'Authorization': 'Bearer sk-s47wpiDP8Nt10Jf7A6LK0vlsE4p9cebwZHbLxZx96p19cVnY',
        'Content-Type': 'application/json'
    }
    conn.request("POST", "/302/submit/qwen-image-layered", payload, headers)
    res = conn.getresponse()
    data = res.read().decode("utf-8")
    conn.close()
    return json.loads(data)


def query_result(request_id: str) -> dict:
    """查询结果"""
    conn = http.client.HTTPSConnection("api.302.ai")
    headers = {
        'Authorization': 'Bearer sk-s47wpiDP8Nt10Jf7A6LK0vlsE4p9cebwZHbLxZx96p19cVnY',
        'Content-Type': 'application/json'
    }
    # 302.ai 的结果查询接口，使用 POST 方式
    payload = json.dumps({"request_id": request_id})
    conn.request("POST", "/302/result/qwen-image-layered", payload, headers)
    res = conn.getresponse()
    data = res.read().decode("utf-8")
    conn.close()

    # 调试：打印原始响应
    if not data:
        print(f"  [调试] 状态码: {res.status}, 响应为空")
        return {"status": "ERROR", "message": "Empty response"}

    try:
        return json.loads(data)
    except json.JSONDecodeError as e:
        print(f"  [调试] JSON解析失败: {e}")
        print(f"  [调试] 原始响应: {data[:500]}")
        return {"status": "ERROR", "message": f"Invalid JSON: {data[:200]}"}


def download_image(url: str, save_path: Path):
    """下载图片"""
    import urllib.request
    urllib.request.urlretrieve(url, save_path)


def main():
    # 检查图片存在
    if not IMAGE_PATH.exists():
        print(f"图片不存在: {IMAGE_PATH}")
        return

    print(f"读取图片: {IMAGE_PATH}")

    # 转为 Base64 Data URL
    image_url = image_to_base64_url(IMAGE_PATH)
    print("图片已转为 Base64 Data URL")

    # 提交请求
    print("提交分层请求...")
    submit_resp = submit_request(image_url)
    print(f"提交响应: {json.dumps(submit_resp, indent=2, ensure_ascii=False)}")

    request_id = submit_resp.get("request_id")
    if not request_id:
        print("未获取到 request_id")
        return

    print(f"Request ID: {request_id}")

    # 创建输出目录
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"输出目录: {OUTPUT_DIR}")

    # 保存提交响应
    (OUTPUT_DIR / "submit_response.json").write_text(
        json.dumps(submit_resp, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )

    # 查询结果（轮询）
    import time
    max_wait = 180  # 最多等待180秒
    interval = 3    # 每3秒查询一次

    print("等待结果...")
    for i in range(0, max_wait, interval):
        time.sleep(interval)
        result = query_result(request_id)
        print(f"[{i+interval}s] 状态: {result.get('status', 'unknown')}")

        if result.get("status") in ["COMPLETED", "SUCCEEDED", "SUCCESS"]:
            # 保存结果
            (OUTPUT_DIR / "result.json").write_text(
                json.dumps(result, indent=2, ensure_ascii=False),
                encoding="utf-8"
            )

            # 下载分层图片
            output_data = result.get("output", {})
            if isinstance(output_data, list):
                for idx, item in enumerate(output_data):
                    if isinstance(item, str) and item.startswith("http"):
                        save_path = OUTPUT_DIR / f"layer_{idx+1}.png"
                        download_image(item, save_path)
                        print(f"下载: {save_path}")
            elif isinstance(output_data, dict):
                for key, url in output_data.items():
                    if isinstance(url, str) and url.startswith("http"):
                        save_path = OUTPUT_DIR / f"{key}.png"
                        download_image(url, save_path)
                        print(f"下载: {save_path}")

            print(f"\n完成！结果保存在: {OUTPUT_DIR}")
            break
    else:
        print("等待超时，请手动查询结果")


if __name__ == "__main__":
    main()
