@echo off
:: Trigger Remote Render - Runs on Main Machine
:: Creates trigger file that gaming laptop watches

echo Triggering remote render...
echo render > "C:\OtherlyStudio\studio\RENDER_TRIGGER.txt"
echo.
echo Trigger file created at: C:\OtherlyStudio\studio\RENDER_TRIGGER.txt
echo.
echo Checking file exists...
if exist "C:\OtherlyStudio\studio\RENDER_TRIGGER.txt" (
    echo [OK] Trigger file exists locally
    dir "C:\OtherlyStudio\studio\RENDER_TRIGGER.txt"
) else (
    echo [ERROR] Trigger file NOT found!
)
echo.
echo Gaming laptop will pick it up within 10 seconds (via Syncthing).
echo.
echo To check status, run: scripts\check_render.bat