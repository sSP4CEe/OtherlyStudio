@echo off
:: Watch Render Trigger - Runs on Gaming Laptop
:: Monitors for RENDER_TRIGGER.txt, renders when found

cd /d C:\OtherlyStudio\studio

:loop
if exist "RENDER_TRIGGER.txt" (
    echo [%date% %time%] Trigger detected - starting render...
    del "RENDER_TRIGGER.txt"
    
    :: Render with EricNeural voice (preview 720p, 5 seconds = 150 frames)
    npx remotion render src/index.ts BridgeShort out/bridge/video.mp4 ^
        --codec h264 --crf 16 --concurrency 1 ^
        --frames=0-149 --scale 0.6666666666666666 ^
        --timeout=600000
    
    if %errorlevel% equ 0 (
        echo [%date% %time%] Render complete!
    ) else (
        echo [%date% %time%] Render FAILED (errorlevel %errorlevel%)
    )
) else (
    echo [%date% %time%] Waiting for trigger...
)

timeout /t 10 /nobreak >nul
goto loop