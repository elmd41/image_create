'''
测试阿里云通义万相 (Wanx) 图像生成 API
--------------------------------------
功能：
调用 DashScope SDK，测试能否通过 API 生成图片。
'''

import os
from http import HTTPStatus
import dashscope
from dashscope import ImageSynthesis

# 使用你的 API Key (从 settings.py 中读取，或者直接在这里硬编码测试)
# 建议直接读取环境变量或 settings
try:
    from app.config.settings import settings
    dashscope.api_key = settings.API_KEY
except ImportError:
    # 如果找不到 settings，请在这里手动填入 API Key
    dashscope.api_key = "sk-3fab2e04b2104c05894ead0ca1e4cab1" 

def test_text_to_image():
    print("--- 开始测试文生图 (Text-to-Image) ---")
    prompt = "一只可爱的卡通猫，坐在红色的地毯上，赛博朋克风格"
    print(f"提示词: {prompt}")

    try:
        # 调用通义万相文生图模型
        rsp = ImageSynthesis.call(
            model=ImageSynthesis.Models.wanx_v1, # 使用通义万相 v1 模型
            prompt=prompt,
            n=1,
            size='1024*1024'
        )
        
        if rsp.status_code == HTTPStatus.OK:
            print("生成成功！")
            for result in rsp.output.results:
                print(f"图片 URL: {result.url}")
        else:
            print(f"生成失败: Code={rsp.code}, Message={rsp.message}")
            
    except Exception as e:
        print(f"发生异常: {e}")

def test_image_to_image():
    print("\n--- 开始测试图生图 (Image-to-Image / Style Repaint) ---")
    
    # 使用本地存在的图片
    # 注意：Wanx API 要求 ref_image 必须是 file:// 开头的本地路径，或者 http/https URL
    # Windows 路径需要注意转义
    local_image_path = os.path.abspath("../data/images/car.png")
    
    if not os.path.exists(local_image_path):
        print(f"错误：测试图片不存在 {local_image_path}")
        return

    # 转换为 file URL 格式
    ref_image_url = f"file://{local_image_path}"
    
    prompt = "把这辆车变成赛博朋克风格，霓虹灯背景"
    print(f"参考图: {local_image_path}")
    print(f"提示词: {prompt}")

    try:
        # 通义万相 v1 支持通过 ref_image 参数进行风格重绘
        rsp = ImageSynthesis.call(
            model=ImageSynthesis.Models.wanx_v1,
            prompt=prompt,
            ref_image=ref_image_url, 
            # style='<auto>', # 可以指定风格，如 <3d cartoon>, <oil painting> 等
            n=1,
            size='1024*1024'
        )
        
        if rsp.status_code == HTTPStatus.OK:
            print("生成成功！")
            for result in rsp.output.results:
                print(f"图片 URL: {result.url}")
        else:
            print(f"生成失败: Code={rsp.code}, Message={rsp.message}")
            
    except Exception as e:
        print(f"发生异常: {e}")

if __name__ == "__main__":
    # 先测文生图
    # test_text_to_image()
    
    # 再测图生图
    test_image_to_image()
