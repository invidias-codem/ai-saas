$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

Push-Location $projectRoot
try {
    # Tauri embeds Common Controls v6 into the app, but not lib test binaries:
    # https://github.com/tauri-apps/tauri/issues/13419
    $testBuildOutput = & cargo test --locked --manifest-path src-tauri/Cargo.toml --lib --no-run --message-format=json
    $buildExitCode = $LASTEXITCODE
    $buildMessages = @($testBuildOutput | ForEach-Object { $_ | ConvertFrom-Json })
    $buildMessages | Where-Object { $_.reason -eq 'compiler-message' } | ForEach-Object { Write-Host $_.message.rendered }
    if ($buildExitCode -ne 0) { throw 'Native test compilation failed' }

    $testArtifacts = @($buildMessages | Where-Object {
        $_.reason -eq 'compiler-artifact' -and $_.profile.test -eq $true -and
        $_.target.name -eq 'app_lib' -and $_.executable
    })
    if ($testArtifacts.Count -ne 1) { throw 'Expected exactly one compiled app_lib test executable' }
    $testBinary = $testArtifacts[0].executable
    if (-not (Test-Path -LiteralPath $testBinary -PathType Leaf)) { throw 'Compiled test executable is missing' }

    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    $manifestTool = Get-ChildItem -Path "$sdkRoot\*\x64\mt.exe" |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $manifestTool) { throw 'Windows SDK mt.exe is required for native unit tests' }
    $testManifest = Join-Path $projectRoot 'src-tauri\tests\windows-unit-tests.manifest.xml'

    # Modify only the compiler-identified unit-test artifact, never the app.
    & $manifestTool.FullName -nologo -manifest $testManifest "-outputresource:$testBinary;#1"
    if ($LASTEXITCODE -ne 0) { throw 'Embedding the native test manifest failed' }
    & $testBinary --nocapture
    $testExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $testExitCode
