@echo off
setlocal

cd /d "%~dp0"

echo.
echo [TrendForge] Stopping local workbench...
echo.

call :stop_port 4780 "API"
call :stop_port 5173 "Web"

echo.
echo [TrendForge] Checking ports...
call :check_port 4780 "API"
call :check_port 5173 "Web"

echo.
echo [TrendForge] Stop flow completed.
pause
exit /b 0

:stop_port
set "PORT=%~1"
set "SERVICE_NAME=%~2"
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo [TrendForge] Stopping %SERVICE_NAME% on port %PORT%. PID: %%P
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 (
    echo [WARN] Could not stop PID %%P. Try running this script as administrator.
  ) else (
    echo [TrendForge] PID %%P stopped.
  )
)
if not defined FOUND echo [TrendForge] No listener found for %SERVICE_NAME% port %PORT%.
exit /b 0

:check_port
set "PORT=%~1"
set "SERVICE_NAME=%~2"
set "STILL="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do set "STILL=%%P"
if defined STILL (
  echo [WARN] %SERVICE_NAME% port %PORT% is still occupied by PID %STILL%.
) else (
  echo [TrendForge] %SERVICE_NAME% port %PORT% is free.
)
del "workspace\run-api.cmd" >nul 2>nul
del "workspace\run-web.cmd" >nul 2>nul
exit /b 0
