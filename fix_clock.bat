@echo off
:: Self-elevation wrapper
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to adjust system time and registry...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fix_clock.ps1"
pause
