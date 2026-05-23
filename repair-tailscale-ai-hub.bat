@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting Administrator permission...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo [1/6] Stopping Tailscale service...
sc.exe stop Tailscale
timeout /t 3 /nobreak >nul

echo [2/6] Cleaning stuck Tailscale processes...
taskkill /F /IM tailscaled.exe >nul 2>&1
taskkill /F /IM tailscale.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/6] Starting Tailscale service...
sc.exe start Tailscale
timeout /t 8 /nobreak >nul

echo [4/6] Starting AI Hub locally...
call "%~dp0start-ai-hub.bat"

echo [5/6] Connecting Tailscale...
tailscale up --reset
if errorlevel 1 (
    echo.
    echo Tailscale did not connect. If a browser login link appeared, open it and sign in.
    echo Then run this repair file again.
    pause
    exit /b 1
)

echo [6/6] Serving AI Hub over Tailscale HTTPS...
tailscale serve --bg --yes 8000
if errorlevel 1 (
    echo.
    echo Tailscale Serve failed. Current status:
    tailscale status
    pause
    exit /b 1
)

echo.
echo Done. AI Hub should be available at:
echo https://desktop-jvckt8p.tailbd413a.ts.net/
echo.
tailscale status
tailscale serve status
pause
