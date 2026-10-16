$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
$dataRoot = [IO.Path]::GetFullPath((Join-Path $repo 'data'))
if (-not $dataRoot.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The staging parent escaped the repository root.'
}

& docker image inspect soundboard-android:local *> $null
if ($LASTEXITCODE -ne 0) { throw 'Build the soundboard-android:local image first with .\sb.ps1 apk.' }
& docker volume inspect soundboard_gradle *> $null
if ($LASTEXITCODE -ne 0) { throw 'The existing soundboard_gradle Docker volume was not found; run the normal Android build first.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stage = Join-Path $dataRoot ("youtube-prototype-{0}-{1}" -f $stamp, ([guid]::NewGuid().ToString('N').Substring(0, 8)))
if (Test-Path -LiteralPath $stage) { throw 'The unique staging directory already exists.' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$trackedAndLocalSources = & git -C $repo ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw 'Could not list tracked and non-ignored worktree sources.' }
foreach ($entry in $trackedAndLocalSources) {
  if ([string]::IsNullOrWhiteSpace($entry)) { continue }
  $relative = $entry.Replace('/', '\')
  if ($relative -match '(^|\\)\.env([^\\]*$|\\)' -or
      $relative -match '(^|\\)data(\\|$)' -or
      $relative -match '(^|\\)node_modules(\\|$)' -or
      $relative -match '^app-client\\android(\\|$)' -or
      $relative -match '(^|\\)\.aws(\\|$)' -or
      $relative -match '\.(keystore|jks|pem|p12|pfx|key)$') { continue }

  $source = [IO.Path]::GetFullPath((Join-Path $repo $relative))
  $destination = [IO.Path]::GetFullPath((Join-Path $stage $relative))
  if (-not $source.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
      -not $destination.StartsWith($stage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "A listed source path escaped its expected root: $entry"
  }
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination
}

# Bind the existing Yarn workspace directories separately, then create
# in-container links so workspace-relative packages resolve in the staged tree.
$containerBuild = @'
set -euo pipefail
ln -s /deps/node_modules /workspace/node_modules
mkdir -p /deps/shared
cd /workspace/app-client
../node_modules/.bin/expo prebuild --platform android --no-install
cd android
./gradlew :soundboard-youtube:testReleaseUnitTest assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
'@

$dockerArgs = @(
  'run', '--rm',
  '-e', 'SOUNDBOARD_YOUTUBE_PROTOTYPE=1',
  '-e', 'EXPO_NO_DOTENV=1',
  '-v', "${stage}:/workspace",
  '-v', "${repo}/node_modules:/deps/node_modules",
  '-v', "${repo}/shared:/deps/shared",
  '-v', 'soundboard_gradle:/gradle',
  '-w', '/workspace',
  'soundboard-android:local', 'bash', '-lc', $containerBuild
)
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw "The staged prototype APK build failed. Staging files are preserved at $stage" }

$apk = Join-Path $stage 'app-client\android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $apk -PathType Leaf)) { throw "Build completed without the expected APK at $apk" }
$sizeMiB = [math]::Round((Get-Item -LiteralPath $apk).Length / 1MB, 1)
Write-Host "Prototype APK: $apk ($sizeMiB MiB)"
Write-Host "Staged source: $stage"
