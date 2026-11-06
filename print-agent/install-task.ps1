# Creates a Scheduled Task that runs the print agent at startup and restarts it on failure.
# Run in PowerShell as Administrator:
#   cd C:\print-agent
#   powershell -ExecutionPolicy Bypass -File .\install-task.ps1
$ErrorActionPreference = "Stop"
$TaskName = "DecoritPrintAgent"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $Dir ".env"))) {
  throw "Missing .env in $Dir (copy .env.example to .env and fill PRINT_API_KEY)"
}
$node = (Get-Command node.exe -ErrorAction Stop).Source

$action    = New-ScheduledTaskAction -Execute $node -Argument "agent.js" -WorkingDirectory $Dir
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Decorit cutting slip print agent" | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
Write-Host "Task $TaskName created and started. Log: $Dir\agent.log"
Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Format-List LastRunTime, LastTaskResult
