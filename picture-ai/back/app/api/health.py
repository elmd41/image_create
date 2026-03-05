'''
健康检查接口
-----------
功能：
1. 提供 /health 接口，用于负载均衡器或监控系统检测服务是否存活
2. 最简单的 API 示例

作业：
- 修改此接口，返回更多的系统状态信息（如内存使用率、数据库连接状态）
'''
from fastapi import APIRouter

router = APIRouter()

@router.get("/health", summary="健康检查接口", description="用于服务存活检测")
async def health_check():
    """
    检查服务是否正常运行
    """
    return {"status": "ok"}
