import requests

url = "http://127.0.0.1:8000/api/search"

# 测试文本搜索
print("正在测试文本搜索...")
try:
    response = requests.post(url, data={"text": "cat", "top_k": 5})
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        print("响应内容:", response.json())
    else:
        print("错误信息:", response.text)
except Exception as e:
    print(f"请求发送失败: {e}")
