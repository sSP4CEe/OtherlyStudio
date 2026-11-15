@echo off
:: Check Render Status - Runs on Main Machine

echo ==============================
echo RENDER STATUS CHECK
echo ==============================
echo.

if exist "C:\OtherlyStudio\studio\RENDER_TRIGGER.txt" (
    echo [WAITING] Trigger file exists - render not started yet
    dir "C:\OtherlyStudio\studio\RENDER_TRIGGER.txt"
    echo.
) else if exist "C:\OtherlyStudio\studio\out\bridge\video.mp4" (
    for %%F in (C:\OtherlyStudio\studio\out\bridge\video.mp4) do (
        echo [READY] Video exists!
        echo    File: video.mp4
        echo    Date: %%~tF
        echo    Size: %%~zF bytes
    )
    echo.
) else (
    echo [IDLE] No trigger file, no video output
    echo.
)

echo Syncthing status check:
echo   Open http://localhost:8384 on BOTH machines
echo   Check: otherly-studio folder -> Last Sync time