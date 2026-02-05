@echo off
REM === Compass - Always On Top Launcher ===
REM Edge --app mode + pin to topmost

set URL=https://compass-31e9e.web.app
set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

REM Launch Edge in app mode
start "" %EDGE% --app=%URL%

REM Wait for window to appear
timeout /t 3 /nobreak >nul

REM Pin to always-on-top via PowerShell
powershell -ExecutionPolicy Bypass -Command ^
  "Add-Type 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int ht, uint f); }'; ^
   Start-Sleep -Seconds 1; ^
   $p = Get-Process -Name msedge -EA SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle -ne '' }; ^
   foreach ($w in $p) { [W]::SetWindowPos($w.MainWindowHandle, [IntPtr]::new(-1), 0, 0, 0, 0, 3); Write-Host ('Pinned: ' + $w.MainWindowTitle) }"

echo Done!
pause
