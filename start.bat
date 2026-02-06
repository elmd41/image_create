@echo off
chcp 65001 >nul
title Picture AI Backend

echo ==========================================
echo   Picture AI - Backend Startup
echo ==========================================
echo.

set "PROJECT_DIR=%~dp0picture-ai\back"
set "VENV_PYTHON=%~dp0picture-ai\venv\Scripts\python.exe"

echo [1/3] Checking virtual environment...
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment not found!
    echo Run: python -m venv venv
    echo      pip install -r back/requirements.txt
    pause
    exit /b 1
)

echo [2/3] Changing to project directory...
cd /d "%PROJECT_DIR%"

echo [3/3] Starting FastAPI server...
echo.
echo Server will run at: http://localhost:8000
echo Press Ctrl+C to stop
echo.

"%VENV_PYTHON%" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
