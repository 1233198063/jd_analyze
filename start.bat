@echo off
rem One-click start for Windows: opens the backend and frontend in their own
rem windows, then the app in your browser. Close a window to stop that server.
rem Needs the one-time setup from SETUP.md (backend\.venv, frontend\node_modules).
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
    echo backend\.venv not found. Do the one-time setup in SETUP.md first.
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo frontend\node_modules not found. Run "npm install" in frontend first.
    pause
    exit /b 1
)

netstat -ano | findstr /r /c:":5432 .*LISTENING" >nul || (
    echo Warning: nothing is listening on port 5432. Start PostgreSQL first, or the backend will fail.
)

rem Skip a server that is already running so a second double-click doesn't start duplicates.
netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul && (
    echo Backend already running on port 8000.
) || (
    start "JD Analyze - backend" /d "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
)

netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul && (
    echo Frontend already running on port 5173.
) || (
    start "JD Analyze - frontend" /d "%~dp0frontend" cmd /k "npm run dev"
)

rem Wait up to 30 seconds for the frontend before opening the browser.
set /a tries=0
:wait
curl -s -o nul http://localhost:5173 && goto open
set /a tries+=1
if %tries% geq 30 goto open
timeout /t 1 /nobreak >nul
goto wait

:open
start "" http://localhost:5173
