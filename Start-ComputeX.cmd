@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-computex.ps1"
if errorlevel 1 (
  echo.
  echo ComputeX failed to start. Review the error above.
  pause
  exit /b 1
)
exit /b 0
