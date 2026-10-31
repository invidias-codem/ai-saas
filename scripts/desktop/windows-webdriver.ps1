param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
$Directory = [IO.Path]::GetFullPath($Directory)
if (Test-Path -LiteralPath $Directory) { throw 'Driver staging requires a new directory' }
[void](New-Item -ItemType Directory -Path $Directory)
# WebView2 has its own version; the Edge browser/runner's driver can differ.
# https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
$product = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$locations = @("HKCU:\Software\Microsoft\EdgeUpdate\Clients\$product", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$product", "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$product")
$installedVersions = @($locations | ForEach-Object {
  $value = Get-ItemPropertyValue -LiteralPath $_ -Name pv -ErrorAction SilentlyContinue
  if ($value -match '^\d+\.\d+\.\d+\.\d+$' -and [version]$value -gt [version]'0.0.0.0') { $value }
})
if ($installedVersions.Count -eq 0) { throw 'Installed WebView2 runtime was not detected after package installation' }
$runtimeVersion = ($installedVersions | Sort-Object { [version]$_ } -Descending | Select-Object -First 1)
$runtimeBuild = ($runtimeVersion.Split('.')[0..2] -join '.')
function Check-Driver([string]$Candidate) {
  if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $null }
  $signature = Get-AuthenticodeSignature -LiteralPath $Candidate
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'Edge driver signature is not a valid Microsoft signature' }
  $description = (& $Candidate --version) -join ''
  if ($description -notmatch '(\d+\.\d+\.\d+\.\d+)') { throw 'Edge driver did not report a version' }
  $candidateVersion = $Matches[1]
  if (($candidateVersion.Split('.')[0..2] -join '.') -ne $runtimeBuild) { return $null }
  return [pscustomobject]@{ path = $Candidate; version = $candidateVersion; runtimeVersion = $runtimeVersion }
}
$runnerDirectory = [Environment]::GetEnvironmentVariable('EDGEWEBDRIVER')
if ($runnerDirectory) {
  $matched = Check-Driver (Join-Path $runnerDirectory 'msedgedriver.exe')
  if ($matched) { $matched | ConvertTo-Json -Compress; exit 0 }
}
$archive = Join-Path $Directory 'edgedriver.zip'
$downloadVersion = $runtimeVersion
try {
  Invoke-WebRequest -UseBasicParsing -Uri "https://msedgedriver.microsoft.com/$downloadVersion/edgedriver_win64.zip" -OutFile $archive -TimeoutSec 60
} catch {
  $downloadVersion = (Invoke-WebRequest -UseBasicParsing -Uri "https://msedgedriver.microsoft.com/LATEST_RELEASE_$($runtimeVersion.Split('.')[0])_WINDOWS" -TimeoutSec 30).Content.Trim()
  if ($downloadVersion -notmatch '^\d+\.\d+\.\d+\.\d+$' -or ($downloadVersion.Split('.')[0..2] -join '.') -ne $runtimeBuild) { throw 'No compatible Microsoft driver version was advertised' }
  Invoke-WebRequest -UseBasicParsing -Uri "https://msedgedriver.microsoft.com/$downloadVersion/edgedriver_win64.zip" -OutFile $archive -TimeoutSec 60
}
Expand-Archive -LiteralPath $archive -DestinationPath $Directory
$matched = Check-Driver (Join-Path $Directory 'msedgedriver.exe')
if (-not $matched) { throw 'Downloaded Edge driver does not match the installed WebView2 runtime' }
$matched | ConvertTo-Json -Compress
