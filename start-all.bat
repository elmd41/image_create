@echo off
chcp 65001 >nul
title Picture AI - Full Stack

echo ==========================================
echo   Picture AI - Full Stack Startup
echo ==========================================
echo.

set PROJECT_ROOT=%~dp0picture-ai
set BACKEND_DIR=%PROJECT_ROOT%\back
set FRONTEND_DIR=%PROJECT_ROOT%\web
set VENV_PYTHON=%PROJECT_ROOT%\venv\Scripts\python.exe

echo [1/4] Checking virtual environment...
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment not found!
    pause
    exit /b 1
)

echo [2/4] Checking frontend dependencies...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

echo [3/4] Starting Backend on port 8000...
cd /d "%BACKEND_DIR%"
start "Picture AI Backend" cmd /k "%VENV_PYTHON%" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

timeout /t 3 /nobreak >nul

echo [4/4] Starting Frontend on port 5173...
cd /d "%FRONTEND_DIR%"
start "Picture AI Frontend" cmd /k "npm run dev"

echo.
echo ==========================================
echo   Both services started!
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo ==========================================
echo.
pause
