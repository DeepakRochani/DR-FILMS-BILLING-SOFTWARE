@echo off
title DR FILMS Billing Software
cd /d "%~dp0"

echo ==========================================================
echo            DR FILMS BILLING SOFTWARE                      
echo ==========================================================
echo   Starting local billing server and opening browser...
echo   Direct Link: http://127.0.0.1:5173/
echo   Press Ctrl+C in this window anytime to stop.
echo ==========================================================
echo.

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

call npm start
pause
