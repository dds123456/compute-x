@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-computex.ps1"
if errorlevel 1 (
  echo.
  echo ComputeX failed to stop. Review the error above.
  pause
  exit /b 1
)
exit /b 0
