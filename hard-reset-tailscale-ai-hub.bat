@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting Administrator permission...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "BACKUP_ROOT=%~dp0tailscale-state-backup"
set "PROGRAMDATA_TS=C:\ProgramData\Tailscale"
set "LOCALAPPDATA_TS=%LOCALAPPDATA%\Tailscale"

for /f "tokens=1-6 delims=/:. " %%a in ("%date% %time%") do set "STAMP=%%c%%a%%b-%%d%%e%%f"
set "BACKUP_DIR=%BACKUP_ROOT%\%STAMP%"

echo.
echo This will reset this Windows device's local Tailscale state.
echo A backup will be created first:
echo "%BACKUP_DIR%"
echo.
echo After this, you must log in to Tailscale again.
echo.
pause

echo [1/7] Stopping Tailscale service...
sc.exe stop Tailscale
timeout /t 5 /nobreak >nul

echo [2/7] Killing stuck Tailscale processes...
taskkill /F /IM tailscaled.exe >nul 2>&1
taskkill /F /IM tailscale.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/7] Backing up Tailscale state...
mkdir "%BACKUP_DIR%" >nul 2>&1
if exist "%PROGRAMDATA_TS%" robocopy "%PROGRAMDATA_TS%" "%BACKUP_DIR%\ProgramData-Tailscale" /E >nul
if exist "%LOCALAPPDATA_TS%" robocopy "%LOCALAPPDATA_TS%" "%BACKUP_DIR%\LocalAppData-Tailscale" /E >nul

echo [4/7] Removing active Tailscale state folders...
if exist "%PROGRAMDATA_TS%" rmdir /S /Q "%PROGRAMDATA_TS%"
if exist "%LOCALAPPDATA_TS%" rmdir /S /Q "%LOCALAPPDATA_TS%"

echo [5/7] Starting Tailscale service...
sc.exe start Tailscale
timeout /t 8 /nobreak >nul

echo [6/7] Starting AI Hub locally...
call "%~dp0start-ai-hub.bat"

echo [7/7] Running Tailscale login/setup...
tailscale up --reset
if errorlevel 1 (
    echo.
    echo Tailscale still did not connect.
    echo Open the Tailscale tray app manually, choose Log in, complete browser login,
    echo then run:
    echo tailscale serve --bg --yes 8000
    pause
    exit /b 1
)

echo Serving AI Hub over Tailscale HTTPS...
tailscale serve --bg --yes 8000
if errorlevel 1 (
    echo Tailscale is connected but Serve failed. Try manually:
    echo tailscale serve --bg --yes 8000
    pause
    exit /b 1
)

echo.
echo Done. Open:
echo https://desktop-jvckt8p.tailbd413a.ts.net/
echo.
tailscale status
tailscale serve status
pause
