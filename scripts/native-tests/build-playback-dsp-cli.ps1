param(
  [string]$OutputPath = (Join-Path $env:TEMP 'soundboard-playback-dsp-cli.exe')
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$source = Join-Path $PSScriptRoot 'playback_dsp_cli.cpp'
$core = Join-Path $repoRoot 'app-play/play-native-modules/soundboard-device-audio/android/src/main/cpp/playback_dsp.cpp'
$headerDir = Split-Path -Parent $core

$compiler = $env:CXX
if (-not $compiler) {
  foreach ($candidate in @('clang++', 'g++', 'c++')) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) { $compiler = $command.Source; break }
  }
}
if (-not $compiler) {
  throw 'No C++17 compiler found. Set CXX to clang++ or g++ and rerun.'
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

& $compiler -std=c++17 -O3 -DNDEBUG -Wall -Wextra -Wpedantic `
  -I $headerDir $source $core -o $OutputPath
if ($LASTEXITCODE -ne 0) { throw "C++ build failed with exit code $LASTEXITCODE." }

Write-Output $OutputPath
