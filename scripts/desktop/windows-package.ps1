param(
  [Parameter(Mandatory=$true)][ValidateSet('install','uninstall','processes')][string]$Action,
  [string]$Installer,
  [Parameter(Mandatory=$true)][string]$Directory
)
$ErrorActionPreference = 'Stop'
$Directory = [System.IO.Path]::GetFullPath($Directory)
$Application = Join-Path $Directory 'app.exe'
if ($Action -eq 'processes') {
  $prefix = $Directory.TrimEnd('\') + '\'
  $ids = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId })
  ConvertTo-Json -InputObject $ids -Compress
  exit 0
}
if ($Action -eq 'install') {
  if (Test-Path -LiteralPath $Directory) { throw 'Qualification must use a new installation directory' }
  $process = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$Directory") -PassThru
  $null = $process.Handle
  if (-not $process.WaitForExit(120000)) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    throw 'Evaluation installer exceeded its deadline; installation outcome is uncertain'
  }
  if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)" }
  if (-not (Test-Path -LiteralPath $Application -PathType Leaf)) { throw 'Installed application is missing' }
  [pscustomobject]@{ application = $Application } | ConvertTo-Json -Compress
} else {
  $uninstallers = @(Get-ChildItem -LiteralPath $Directory -Filter '*uninstall*.exe' -File)
  if ($uninstallers.Count -ne 1) { throw 'Expected exactly one uninstaller in the test installation' }
  $process = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -PassThru
  $null = $process.Handle
  if (-not $process.WaitForExit(120000)) {
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    throw 'Uninstaller exceeded its deadline'
  }
  if ($process.ExitCode -ne 0) { throw "Uninstaller exited with code $($process.ExitCode)" }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while ((Test-Path -LiteralPath $Application) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
  if (Test-Path -LiteralPath $Application) { throw 'Application remained after uninstall' }
}
