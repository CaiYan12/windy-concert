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
powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $source = [System.IO.Path]::GetFullPath('build'); $package = Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json; $destination = [System.IO.Path]::GetFullPath(('Windy-Concert-' + $package.version + '-win64.zip')); try { $exe = Join-Path $source 'Windy Concert.exe'; if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'source build executable missing' }; if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }; [System.IO.Compression.ZipFile]::CreateFromDirectory($source, $destination, [System.IO.Compression.CompressionLevel]::Optimal, $false); $required = @('Windy Concert.exe', 'resources/app.asar', 'resources/icon.ico'); $archive = [System.IO.Compression.ZipFile]::OpenRead($destination); try { $names = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') }); foreach ($requiredName in $required) { if ($names -notcontains $requiredName) { throw ('required archive entry missing: ' + $requiredName) } }; $nativeCount = @($names | Where-Object { $_ -like '*.node' }).Count; if ($nativeCount -lt 1) { throw 'required native .node entry missing' }; Write-Output ('ZIP OK: ' + $destination + ' entries=' + $names.Count + ' nativeNodeEntries=' + $nativeCount) } finally { $archive.Dispose() } } catch { if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue }; Write-Error $_; exit 1 }"
if errorlevel 1 goto :err
goto :eof
:err
echo BUILD FAILED
exit /b 1
