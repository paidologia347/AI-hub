@echo off
setlocal

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AI Hub.lnk"

if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo Removed AI Hub startup shortcut.
) else (
    echo AI Hub startup shortcut was not found.
)

pause
