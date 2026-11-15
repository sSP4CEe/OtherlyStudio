@echo off
:: Watch Render Trigger - DEBUG VERSION
:: Monitors for RENDER_TRIGGER.txt, renders when found

echo ========================================
echo WATCH RENDER STARTED
echo ========================================
echo Watching: C:\OtherlyStudio\studio\RENDER_TRIGGER.txt
echo Working dir: C:\OtherlyStudio\studio
echo Checking every 10 seconds...
echo Press Ctrl+C to stop
echo ========================================
echo.

cd /d C:\OtherlyStudio\studio

:loop
echo [%date% %time%] Checking for trigger...
if exist "RENDER_TRIGGER.txt" (
    echo [%date% %time%] *** TRIGGER DETECTED! ***
    echo [%date% %time%] Starting render...
    del "RENDER_TRIGGER.txt"
    
    :: Render with EricNeural voice (preview 720p, 5 seconds = 150 frames)
    npx remotion render src/index.ts BridgeShort out/bridge/video.mp4 ^
        --codec h264 --crf 16 --concurrency 1 ^
        --frames=0-149 --scale 0.6666666666666666 ^
        --timeout=600000
    
    if %errorlevel% equ 0 (
        echo [%date% %time%] *** RENDER COMPLETE! ***
        dir out\bridge\video.mp4
    ) else (
        echo [%date% %time%] *** RENDER FAILED (errorlevel %errorlevel%) ***
    )
    echo.
    echo [%date% %time%] Waiting for next trigger...
    echo ========================================
    echo.
) else (
    echo [%date% %time%] No trigger found. Waiting...
)

timeout /t 10 /nobreak >nul
goto loop