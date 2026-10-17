# Download, inspect, then run: .\install.ps1 -Version cli-v<VERSION> -SourceCommit <COMMIT>
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^cli-v[0-9]+\.[0-9]+\.[0-9]+(-rc\.[0-9]+)?$')][string]$Version,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit
)
$ErrorActionPreference = 'Stop'
$PreviousGhHost = $env:GH_HOST
$Repo = 'invidias-codem/ai-saas'
$Asset = 'lattice-windows-amd64.exe'
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw 'This installer requires Windows x64.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI (gh) for provenance verification.' }
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $TempDir | Out-Null
try {
    $env:GH_HOST = 'github.com'
    $Draft = & gh release view $Version --repo $Repo --json isDraft --jq '.isDraft'
    if ($LASTEXITCODE -ne 0 -or $Draft -ne 'false') { throw 'Release is not published.' }
    & gh release download $Version --repo $Repo --pattern $Asset --pattern SHA256SUMS --dir $TempDir
    if ($LASTEXITCODE -ne 0) { throw 'Download failed.' }
    $Entries = @(Get-Content (Join-Path $TempDir 'SHA256SUMS') | Where-Object { $_ -match "^[a-f0-9]{64}  $([Regex]::Escape($Asset))$" })
    if ($Entries.Count -ne 1) { throw 'Missing or ambiguous checksum.' }
    $Binary = Join-Path $TempDir $Asset
    if ((Get-FileHash $Binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Entries[0].Substring(0,64)) { throw 'Checksum mismatch.' }
    & gh attestation verify $Binary --repo $Repo --signer-workflow "$Repo/.github/workflows/build-lattice-cli.yml" --source-ref refs/heads/main --source-digest $SourceCommit
    if ($LASTEXITCODE -ne 0) { throw 'Provenance verification failed.' }
    $Output = & $Binary --version
    if ($LASTEXITCODE -ne 0 -or $Output -ne "lattice $($Version.Substring(5))") { throw 'Version mismatch.' }
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\LatticeOS\bin'
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $Destination = Join-Path $InstallDir 'lattice.exe'
    if ((Test-Path $Destination) -and ((Get-Item $Destination).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Remove the existing lattice link before installing.' }
    $Stage = Join-Path $InstallDir ([System.Guid]::NewGuid().ToString() + '.exe')
    try { Copy-Item $Binary $Stage; Move-Item $Stage $Destination -Force }
    finally { if (Test-Path $Stage) { Remove-Item $Stage -Force } }
    Write-Host "Installed $Version to $Destination"
    Write-Host "Add $InstallDir to your user PATH, then run lattice doctor --offline --json."
} finally {
    Remove-Item $TempDir -Recurse -Force
    $env:GH_HOST = $PreviousGhHost
}
