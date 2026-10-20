param([string] $StagePath = '')

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
if (-not $StagePath) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $StagePath = Join-Path $repo ("data/device-audio-native-tests-{0}" -f $stamp)
}
$stage = [IO.Path]::GetFullPath($StagePath)
$dataRoot = [IO.Path]::GetFullPath((Join-Path $repo 'data'))
if (-not $stage.StartsWith($dataRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Native-test staging must be under ignored repository data/.'
}

& (Join-Path $repo 'scripts/build-play-android.ps1') -StageOnly -StagePath $stage
if ($LASTEXITCODE -ne 0) { throw 'Play source staging failed before native tests.' }

$testSource = Join-Path $repo 'scripts/native-tests/PcmWavWriterTest.kt'
$testTarget = Join-Path $stage 'app-play/play-native-modules/soundboard-device-audio/android/src/test/java/dev/sarunas/soundboard/deviceaudio/PcmWavWriterTest.kt'
New-Item -ItemType Directory -Path (Split-Path -Parent $testTarget) -Force | Out-Null
Copy-Item -LiteralPath $testSource -Destination $testTarget

$containerScript = @'
set -euo pipefail
mkdir -p /tmp/device-audio-test-project
cp -a /workspace/. /tmp/device-audio-test-project/
cd /tmp/device-audio-test-project
corepack yarn install --immutable --mode=skip-build
cd app-play
../node_modules/.bin/expo prebuild --platform android --no-install
cd android
./gradlew :soundboard-device-audio:testReleaseUnitTest --no-daemon
mkdir -p /workspace/artifacts/native-tests
cp -a ../play-native-modules/soundboard-device-audio/android/build/test-results/testReleaseUnitTest /workspace/artifacts/native-tests/
'@
$dockerArgs = @(
  'run', '--rm',
  '-e', 'EXPO_NO_DOTENV=1',
  '-e', 'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
  '-e', 'DEVICE_AUDIO_FAULT_DIR=/device-audio-fault-test',
  '--tmpfs', '/device-audio-fault-test:rw,size=64k',
  '-v', "${stage}:/workspace",
  '-v', 'soundboard_gradle:/gradle',
  '-v', 'soundboard_yarn-cache:/root/.yarn/berry/cache',
  '-w', '/workspace',
  'soundboard-android:local', 'bash', '-lc', $containerScript
)
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw "Native JVM tests failed. Stage and logs are preserved at $stage" }
Write-Host "Native JVM test results: $(Join-Path $stage 'artifacts/native-tests')"
