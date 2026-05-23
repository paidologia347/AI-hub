@echo off
setlocal

set "APP_DIR=%~dp0"
set "LAUNCHER=%APP_DIR%start-ai-hub.bat"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_DIR%\AI Hub.lnk"

if not exist "%LAUNCHER%" (
    echo Missing launcher: "%LAUNCHER%"
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut('%SHORTCUT%'); $shortcut.TargetPath = '%LAUNCHER%'; $shortcut.WorkingDirectory = '%APP_DIR%'; $shortcut.WindowStyle = 7; $shortcut.Description = 'Start AI Hub on Windows login'; $shortcut.Save()"

if errorlevel 1 (
    echo Failed to install startup shortcut.
    pause
    exit /b 1
)

echo AI Hub startup shortcut installed:
echo "%SHORTCUT%"
echo.
echo AI Hub will start automatically after Windows login.
pause
