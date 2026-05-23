@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting Administrator permission...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo [AI Hub] Starting local AI Hub server if needed...
call "%~dp0start-ai-hub.bat"

echo [Tailscale] Connecting this device to the tailnet...
tailscale up
if errorlevel 1 (
    echo [Tailscale] tailscale up failed. Open the Tailscale app and sign in, then run this file again.
    pause
    exit /b 1
)

echo [Tailscale] Enabling HTTPS serve to local port 8000...
tailscale serve --bg --yes 8000
if errorlevel 1 (
    echo [Tailscale] serve failed. Check that Tailscale is signed in and running.
    pause
    exit /b 1
)

echo.
echo Done. Open:
echo https://desktop-jvckt8p.tailbd413a.ts.net/
echo.
tailscale serve status
pause
