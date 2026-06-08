@echo off
setlocal

cd /d "%~dp0"

set "ROOT_DIR=%~dp0"
set "API_URL=http://127.0.0.1:4780"
set "WEB_URL=http://127.0.0.1:5173/"

echo.
echo [TrendForge] Starting local workbench...
echo.

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found. Please install Node.js 20+ and npm.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] node_modules was not found.
  echo Please run:
  echo   npm.cmd install --cache .\.npm-cache
  pause
  exit /b 1
)

set "API_PID="
set "WEB_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":4780 .*LISTENING"') do set "API_PID=%%P"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do set "WEB_PID=%%P"

if defined API_PID echo [INFO] API port 4780 is already listening. PID: %API_PID%
if defined WEB_PID echo [INFO] Web port 5173 is already listening. PID: %WEB_PID%

if defined API_PID if defined WEB_PID (
  echo [TrendForge] Services are already running. Opening workbench...
  start "" "%WEB_URL%"
  exit /b 0
)
if defined API_PID (
  echo [ERROR] API port is busy but Web is not running. Run stop-trendforge.bat first.
  pause
  exit /b 1
)
if defined WEB_PID (
  echo [ERROR] Web port is busy but API is not running. Run stop-trendforge.bat first.
  pause
  exit /b 1
)

if not exist "workspace" mkdir "workspace"
type nul > "workspace\api.log"
type nul > "workspace\api.err.log"
type nul > "workspace\web.log"
type nul > "workspace\web.err.log"
(
  echo @echo off
  echo cd /d "%ROOT_DIR%"
  echo npm.cmd run api ^>^> workspace\api.log 2^>^> workspace\api.err.log
) > "workspace\run-api.cmd"
(
  echo @echo off
  echo cd /d "%ROOT_DIR%"
  echo npm.cmd run web:dev ^>^> workspace\web.log 2^>^> workspace\web.err.log
) > "workspace\run-web.cmd"

echo [TrendForge] Building backend...
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. Startup stopped.
  pause
  exit /b 1
)

echo.
echo [TrendForge] Starting API and Web windows...
start "TrendForge API" /min "%ROOT_DIR%workspace\run-api.cmd"
start "TrendForge Web" /min "%ROOT_DIR%workspace\run-web.cmd"

echo.
echo [TrendForge] Waiting for API...
call :wait_for_url "%API_URL%/health" "API"
if errorlevel 1 goto :failed

echo [TrendForge] Waiting for Web...
call :wait_for_url "%WEB_URL%" "Web"
if errorlevel 1 goto :failed

echo.
echo [TrendForge] Started.
echo API: %API_URL%
echo Web: %WEB_URL%
echo.
echo Logs:
echo   workspace\api.log
echo   workspace\api.err.log
echo   workspace\web.log
echo   workspace\web.err.log
echo.

start "" "%WEB_URL%"
exit /b 0

:wait_for_url
set "TARGET_URL=%~1"
set "SERVICE_NAME=%~2"
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%TARGET_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    echo [TrendForge] %SERVICE_NAME% is ready.
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)
echo [ERROR] %SERVICE_NAME% did not become ready in time.
exit /b 1

:failed
echo.
echo [ERROR] Startup did not finish. Check logs:
echo   workspace\api.err.log
echo   workspace\web.err.log
echo.
echo You can run stop-trendforge.bat to clean up leftover processes.
pause
exit /b 1
