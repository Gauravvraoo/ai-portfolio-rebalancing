@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if not exist "%~dp0.venv\Scripts\python.exe" (
  echo ERROR: Missing .venv\Scripts\python.exe.
  echo Follow the Windows dependency setup in README.md, then try again.
  pause
  exit /b 1
)
"%~dp0.venv\Scripts\python.exe" "%~dp0scripts\windows_launcher.py"
set "LAUNCH_RESULT=%ERRORLEVEL%"
if not "%LAUNCH_RESULT%"=="0" pause
exit /b %LAUNCH_RESULT%
