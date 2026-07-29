@echo off
title ImageSizer - Local Dev Server
cd /d "%~dp0"

echo.
echo  ================================================
echo    ImageSizer - Image Resizer Tool
echo  ================================================
echo.

:: Check if Node.js / npm is available
where npm >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Opening the Node.js download page in your browser...
    echo.
    start https://nodejs.org/en/download
    echo  Steps to fix:
    echo    1. Download and install Node.js LTS ^(the big green button^)
    echo    2. Keep all defaults - ensure "Add to PATH" is checked
    echo    3. Restart your computer after the install
    echo    4. Double-click this file again
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists, install if not
if not exist "node_modules\" (
    echo  [1/2] Installing dependencies...
    echo.
    npm install
    if errorlevel 1 (
        echo.
        echo  ERROR: npm install failed. Make sure Node.js is installed.
        echo  Opening download page now...
        echo.
        start https://nodejs.org/en/download
        echo  1. Install Node.js LTS (click the big green button)
        echo  2. Keep all defaults - make sure "Add to PATH" is checked
        echo  3. Restart your computer after install
        echo  4. Then double-click this file again
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencies installed successfully!
    echo.
)

echo  [2/2] Starting dev server...
echo.
echo  The app will open in your browser at http://localhost:5173
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after a short delay
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:5173"

:: Start Vite dev server
npm run dev

pause
