Stop-ScheduledTask -TaskName DecoritPrintAgent -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName DecoritPrintAgent -Confirm:$false
Write-Host "Removed."
