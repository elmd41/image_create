'''
Pydantic 数据模型定义
--------------------
功能：
1. 定义 API 请求和响应的数据结构
2. 提供数据类型验证和自动文档生成（OpenAPI/Swagger）
3. 确保前后端数据交互的规范性

作业：
- 尝试修改 UserRequest，添加一个新的必填字段
- 了解 Pydantic 的 Field 参数，尝试添加正则表达式验证（例如手机号格式）
'''
from pydantic import BaseModel, Field
from typing import List, Optional

class UserRequest(BaseModel):
    """用户请求体模型"""
    username: str = Field(..., description="用户名")
    email: Optional[str] = Field(None, description="电子邮箱")
    age: Optional[int] = Field(None, ge=0, le=120, description="年龄")

class UserResponse(BaseModel):
    """用户响应结构模型"""
    id: int = Field(..., description="用户唯一标识 ID")
    username: str = Field(..., description="用户名")
    status: str = Field("active", description="账号状态")

class ErrorResponse(BaseModel):
    """错误响应结构"""
    code: int = Field(..., description="错误码")
    message: str = Field(..., description="错误详情描述")
