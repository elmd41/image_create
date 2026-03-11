'''
通义万相图像生成服务
-------------------
功能：
1. 封装 DashScope ImageSynthesis 接口
2. 提供文生图 (text_to_image) 功能
3. 提供图生图 (image_to_image) 功能

作业：
- 尝试添加 style 参数，支持不同风格（如 "3d cartoon", "oil painting"）
- 尝试处理生成失败的情况（如敏感词过滤）
'''

from http import HTTPStatus
import dashscope
from dashscope import ImageSynthesis
from app.config.settings import settings
import os

# 设置 API Key
# 强制使用 settings 中的 API Key，覆盖可能存在的环境变量
dashscope.api_key = settings.API_KEY
# 也可以显式设置环境变量，双重保险
os.environ["DASHSCOPE_API_KEY"] = settings.API_KEY

class WanxService:
    
    @staticmethod
    def text_to_image(prompt: str, n: int = 1, size: str = '1024*1024') -> list:
        """
        文生图
        :param prompt: 提示词
        :param n: 生成数量
        :param size: 图片尺寸
        :return: 生成的图片 URL 列表
        """
        try:
            rsp = ImageSynthesis.call(
                model=ImageSynthesis.Models.wanx_v1,
                prompt=prompt,
                n=n,
                size=size
            )
            
            if rsp.status_code == HTTPStatus.OK:
                return [res.url for res in rsp.output.results]
            else:
                raise Exception(f"生成失败: {rsp.code}, {rsp.message}")
                
        except Exception as e:
            error_msg = str(e)
            
            # 捕获配额耗尽错误并转为友好提示
            if "AllocationQuota" in error_msg or "Free allocated quota exceeded" in error_msg:
                raise Exception("API 免费额度已耗尽，请检查阿里云 DashScope 账户余额或配额。")
                
            raise Exception(f"文生图服务异常: {error_msg}")

    @staticmethod
    def image_to_image(image_path: str, prompt: str, n: int = 1, size: str = '1024*1024') -> list:
        """
        图生图 (风格重绘)
        :param image_path: 本地图片路径 (绝对路径)
        :param prompt: 提示词
        :param n: 生成数量
        :return: 生成的图片 URL 列表
        """
        try:
            # 构造 file:// URL
            # 注意：在 Windows 上，os.path.abspath 会返回反斜杠，需要处理
            # 但 dashscope SDK 在内部可能处理了，最稳妥的是转为 file URL 格式
            ref_image_url = f"file://{image_path}"
            
            print(f"[WanxService] 正在调用图生图 API, 参考图: {ref_image_url}")

            rsp = ImageSynthesis.call(
                model='wanx-x-painting', # 使用通义万相图像编辑模型
                prompt=prompt,
                ref_image=ref_image_url,
                n=n,
                size=size
            )
            
            if rsp.status_code == HTTPStatus.OK:
                print(f"[WanxService] 图片生成成功，返回 {len(rsp.output.results)} 张图片")
                return [res.url for res in rsp.output.results]
            else:
                print(f"[WanxService] 图片生成失败: {rsp.code}, {rsp.message}")
                raise Exception(f"生成失败: {rsp.code}, {rsp.message}")
                
        except Exception as e:
            error_msg = str(e)
            print(f"[WanxService] 服务异常: {error_msg}")
            
            # 捕获配额耗尽错误并转为友好提示
            if "AllocationQuota" in error_msg or "Free allocated quota exceeded" in error_msg:
                raise Exception("API 免费额度已耗尽，请检查阿里云 DashScope 账户余额或配额。")
                
            raise Exception(f"图生图服务异常: {error_msg}")

# 单例
wanx_service = WanxService()
