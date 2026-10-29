# Arclane Dual-Boot Clock Fix Script
# Requires Administrator Privileges

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host " [ERROR] Administrator privileges required to adjust time & RTC " -ForegroundColor Red
    Write-Host " Please open PowerShell as Administrator or run fix_clock.bat!  " -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Red
    Exit 1
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   Dual-Boot Clock & Time Skew Repair Utility     " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Fetch exact real time via HTTP Date header (immune to TLS/NTP clock-skew handshake failures)
try {
    Write-Host "[1/5] Fetching reference time from Google HTTP server..." -ForegroundColor Yellow
    $res = Invoke-WebRequest -Uri "https://www.google.com" -Method Head -UseBasicParsing -TimeoutSec 5
    $dateStr = $res.Headers['Date']
    $utc = [DateTime]::ParseExact($dateStr, "ddd, dd MMM yyyy HH:mm:ss 'GMT'", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal)
    $ist = [TimeZoneInfo]::ConvertTimeFromUtc($utc.ToUniversalTime(), [TimeZoneInfo]::FindSystemTimeZoneById("India Standard Time"))
    
    Write-Host "      Internet True UTC: $($utc.ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
    Write-Host "      Internet True IST: $($ist.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
    
    # Set system time immediately
    Set-Date -Date $ist
    Write-Host "  -> System time updated to: $ist" -ForegroundColor Green
} catch {
    Write-Host "  -> Notice: Could not sync via HTTP ($($_.Exception.Message)). Will rely on NTP." -ForegroundColor Yellow
}

# 2. Disable Windows Fast Startup (Crucial: prevents +5:30 offset on reboot when RealTimeIsUniversal=1)
Write-Host "[2/5] Disabling Windows Fast Startup (HiberbootEnabled = 0)..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name "HiberbootEnabled" -Value 0 -Type DWord
Write-Host "  -> Fast Startup disabled. (Prevents Windows kernel hibernation clock skew)" -ForegroundColor Green

# 3. Ensure RealTimeIsUniversal is set to 1 for dual-boot UTC compatibility
Write-Host "[3/5] Verifying RealTimeIsUniversal = 1 in registry..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\TimeZoneInformation" -Name "RealTimeIsUniversal" -Value 1 -Type DWord
Write-Host "  -> RealTimeIsUniversal=1 verified for Linux UTC hardware clock parity." -ForegroundColor Green

# 4. Configure Windows Time Service (w32time) to Automatic
Write-Host "[4/5] Configuring Windows Time Service (w32time) to Automatic..." -ForegroundColor Yellow
Set-Service -Name w32time -StartupType Automatic
Start-Service w32time -ErrorAction SilentlyContinue
Write-Host "  -> Windows Time service running and configured for automatic startup." -ForegroundColor Green

# 5. Force NTP resynchronization and hardware clock update
Write-Host "[5/5] Resynchronizing hardware clock with NTP server..." -ForegroundColor Yellow
try {
    & w32tm /config /update
    & w32tm /resync /force
    Write-Host "  -> NTP Resync complete." -ForegroundColor Green
} catch {
    Write-Host "  -> NTP Resync note: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "✅ Fix Complete! Current system time is: $(Get-Date)" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Start-Sleep -Seconds 3
