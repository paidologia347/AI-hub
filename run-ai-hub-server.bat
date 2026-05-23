@echo off
setlocal

set "APP_DIR=%~dp0"
set "LOG_DIR=%APP_DIR%logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%APP_DIR%"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "%LOG_DIR%\uvicorn.out.log" 2>> "%LOG_DIR%\uvicorn.err.log"
