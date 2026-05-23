@echo off
setlocal

set "APP_DIR=%~dp0"
set "ENV_FILE=%APP_DIR%.env"

set /p FREEMODEL_KEY=Paste FreeModel API key: 

if "%FREEMODEL_KEY%"=="" (
    echo No key entered.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$envFile = '%ENV_FILE%'; $key = '%FREEMODEL_KEY%'; $lines = @(); if (Test-Path $envFile) { $lines = Get-Content -LiteralPath $envFile } else { $lines = @('DASHSCOPE_API_KEY=') }; $found = $false; $lines = $lines | ForEach-Object { if ($_ -match '^FREEMODEL_API_KEY=') { $found = $true; 'FREEMODEL_API_KEY=' + $key } else { $_ } }; if (-not $found) { $lines += 'FREEMODEL_API_KEY=' + $key }; Set-Content -LiteralPath $envFile -Encoding ASCII -Value $lines"

echo FreeModel key saved to "%ENV_FILE%".
echo Restart AI Hub after changing the key.
pause
