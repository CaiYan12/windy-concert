@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
if "%~1"=="zip" goto :zip
call npm run build || goto :err
call npx electron-builder --win dir || goto :err
if exist build rmdir /s /q build
robocopy "release\win-unpacked" "build" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 goto :err
echo BUILD OK: build\Windy Concert.exe
goto :eof
:zip
powershell -NoProfile -Command "Compress-Archive -Path 'build\*' -DestinationPath ('Windy-Concert-' + (Get-Content package.json ^| ConvertFrom-Json).version + '-win64.zip') -Force"
goto :eof
:err
echo BUILD FAILED
exit /b 1
