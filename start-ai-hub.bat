@echo off
setlocal

set "APP_DIR=%~dp0"
set "APP_URL=http://127.0.0.1:8000/"
set "LOG_DIR=%APP_DIR%logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%APP_DIR%"

echo [AI Hub] Checking Python dependencies...
python -c "import fastapi, uvicorn, openai, httpx, dotenv" >nul 2>&1
if errorlevel 1 (
    echo [AI Hub] Installing dependencies...
    python -m pip install -e .
    if errorlevel 1 (
        echo [AI Hub] Dependency install failed.
        pause
        exit /b 1
    )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if ((Test-NetConnection 127.0.0.1 -Port 8000 -InformationLevel Quiet) -eq $true) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [AI Hub] Starting server on port 8000...
    start "AI Hub Server" /min "%APP_DIR%run-ai-hub-server.bat"
) else (
    echo [AI Hub] Server is already running.
)

echo [AI Hub] Waiting for server...
for /l %%i in (1,1,20) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%APP_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
    if not errorlevel 1 goto open_browser
    timeout /t 1 /nobreak >nul
)

echo [AI Hub] Server did not respond. Check logs:
echo "%LOG_DIR%\uvicorn.err.log"
pause
exit /b 1

:open_browser
echo [AI Hub] Opening %APP_URL%
start "" "%APP_URL%"
exit /b 0
