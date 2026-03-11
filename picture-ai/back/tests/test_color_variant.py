"""
测试套色服务
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import base64
import json
import requests
from app.config.settings import settings


def test_color_variant_api():
    """直接测试火山引擎 API"""
    
    api_key = settings.VOLC_API_KEY
    api_endpoint = settings.VOLC_API_ENDPOINT
    model = settings.VOLC_IMAGE_MODEL
    
    print(f"API Endpoint: {api_endpoint}")
    print(f"Model: {model}")
    print(f"API Key: {api_key[:10]}...")
    
    # 使用一个简单的测试图片URL
    test_image_url = "https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imageToimages.png"
    
    payload = {
        "model": model,
        "prompt": "根据这张图片，生成3张配色不同的变体。保持图案、构图完全一致，只改变配色方案。",
        "image": test_image_url,
        "sequential_image_generation": "auto",
        "sequential_image_generation_options": {
            "max_images": 3
        },
        "response_format": "url",
        "size": "1920x1920",  # 必须至少 3686400 像素
        "stream": True,
        "watermark": False,
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    
    print("\n发送请求...")
    print(f"Payload: {json.dumps(payload, ensure_ascii=False, indent=2)}")
    
    try:
        resp = requests.post(
            api_endpoint,
            headers=headers,
            data=json.dumps(payload, ensure_ascii=False),
            timeout=180,
            stream=True,
        )
        
        print(f"\n响应状态码: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"错误响应: {resp.text}")
            return
        
        # 解析流式响应
        urls = []
        print("\n解析流式响应...")
        
        for line in resp.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                print(f"行: {line_str[:200]}...")
                
                if line_str.startswith('data: '):
                    data_str = line_str[6:]
                    if data_str.strip() == '[DONE]':
                        print("收到 [DONE]")
                        continue
                    try:
                        data = json.loads(data_str)
                        print(f"解析的数据: {json.dumps(data, ensure_ascii=False, indent=2)[:500]}...")
                        
                        # 检查顶层 url 字段 (sequential_image_generation 模式)
                        if 'url' in data and data['url']:
                            urls.append(data['url'])
                            print(f"获取到URL (顶层): {data['url'][:80]}...")
                        
                        # 也检查 data 数组 (普通模式)
                        elif 'data' in data and isinstance(data['data'], list):
                            for item in data['data']:
                                if 'url' in item and item['url']:
                                    urls.append(item['url'])
                                    print(f"获取到URL (data数组): {item['url'][:80]}...")
                    except json.JSONDecodeError as e:
                        print(f"JSON解析错误: {e}")
        
        print(f"\n总共获取到 {len(urls)} 个URL:")
        for i, url in enumerate(urls):
            print(f"  {i+1}. {url[:100]}...")
            
    except Exception as e:
        print(f"请求失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    test_color_variant_api()
