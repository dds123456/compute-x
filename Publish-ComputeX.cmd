@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-computex.ps1"
if errorlevel 1 (
  echo.
  echo ComputeX publishing failed. Review the error above.
  pause
  exit /b 1
)
exit /b 0
