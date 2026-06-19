@echo off
REM ---- Launch PDF Studio on a local (no-cache) web server ----
cd /d "%~dp0"
set PORT=8000

echo Starting PDF Studio at http://localhost:%PORT%
echo (Close this window to stop the server.)
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%
    python serve.py %PORT%
    goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:%PORT%
    npx --yes serve -l %PORT% --no-clipboard .
    goto :eof
)

echo Could not find Python or Node.js. Install one, or use VS Code "Live Server".
pause
