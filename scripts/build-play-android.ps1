param(
  [switch] $StageOnly,
  [switch] $EnableDeviceAudioCapture,
  [switch] $DisableDeviceAudioCapture,
  [switch] $EnableProductAnalytics,
  [switch] $AnalyticsDiagnostics,
  [string] $PostHogProjectToken = '',
  [string] $StagePath = '',
  [ValidatePattern('^(arm64-v8a|x86_64|armeabi-v7a|x86)(,(arm64-v8a|x86_64|armeabi-v7a|x86))*$')]
  [string] $ReactNativeArchitectures = 'arm64-v8a'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($EnableDeviceAudioCapture -and $DisableDeviceAudioCapture) {
  throw 'Use only one of -EnableDeviceAudioCapture and -DisableDeviceAudioCapture.'
}
$deviceAudioCaptureEnabled = -not $DisableDeviceAudioCapture
$analyticsEnabled = [bool]$EnableProductAnalytics
$analyticsDiagnosticsEnabled = [bool]$AnalyticsDiagnostics
$postHogSdkVersion = '1.61.2'
$postHogHost = 'https://eu.i.posthog.com'
if ($analyticsDiagnosticsEnabled -and -not $analyticsEnabled) {
  throw 'Use -AnalyticsDiagnostics only together with -EnableProductAnalytics.'
}
if (-not $analyticsEnabled -and $PostHogProjectToken) {
  throw 'A PostHog project token requires -EnableProductAnalytics.'
}

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
$sourceCommit = (& git -C $repo rev-parse HEAD).Trim()
$workingTreeDirty = [bool]((& git -C $repo status --porcelain) | Where-Object { $_ })
$dataRoot = [IO.Path]::GetFullPath((Join-Path $repo 'data'))
if (-not $dataRoot.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The stage parent escaped the repository root.'
}

if (-not $StagePath) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $StagePath = Join-Path $dataRoot ("play-build-{0}-{1}" -f $stamp, ([guid]::NewGuid().ToString('N').Substring(0, 8)))
}
$stage = [IO.Path]::GetFullPath($StagePath)
if (Test-Path -LiteralPath $stage) { throw "Play stage already exists: $stage" }
if (-not $stage.StartsWith($dataRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Play staging must be under the ignored repository data/ directory.'
}

$appPlay = Join-Path $repo 'app-play'
if (-not (Test-Path -LiteralPath $appPlay -PathType Container)) { throw 'app-play/ is missing.' }
$playPackageManifest = Get-Content -LiteralPath (Join-Path $appPlay 'package.json') -Raw | ConvertFrom-Json
$postHogSdkVersion = $playPackageManifest.dependencies.'@posthog/core'
if ($postHogSdkVersion -ne '1.61.2') { throw 'The reviewed Play analytics SDK version must remain pinned to @posthog/core 1.61.2.' }
if ($analyticsEnabled -and -not $PostHogProjectToken) {
  $PostHogProjectToken = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN', 'Process')
  if (-not $PostHogProjectToken) {
    $analyticsEnvPath = Join-Path $appPlay '.env.local'
    if (Test-Path -LiteralPath $analyticsEnvPath -PathType Leaf) {
      $tokenAssignments = @(
        foreach ($line in Get-Content -LiteralPath $analyticsEnvPath) {
          if ($line -match '^\s*EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN\s*=\s*(.*?)\s*$') { $Matches[1] }
        }
      )
      if ($tokenAssignments.Count -ne 1) { throw 'Set exactly one EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN entry in app-play/.env.local or pass -PostHogProjectToken.' }
      $PostHogProjectToken = $tokenAssignments[0]
      if ($PostHogProjectToken.Length -ge 2 -and (($PostHogProjectToken[0] -eq '"' -and $PostHogProjectToken[-1] -eq '"') -or ($PostHogProjectToken[0] -eq "'" -and $PostHogProjectToken[-1] -eq "'"))) {
        $PostHogProjectToken = $PostHogProjectToken.Substring(1, $PostHogProjectToken.Length - 2)
      }
    }
  }
}
if ($analyticsEnabled -and $PostHogProjectToken -notmatch '^phc_[A-Za-z0-9_-]{8,196}$') {
  throw 'Product analytics requires a valid public PostHog project token (phc_...). Set it in app-play/.env.local or pass -PostHogProjectToken; do not use a secret or personal API key.'
}

$appPlayFiles = @('index.ts', 'App.tsx', 'app.json', 'app.config.js', 'package.json', 'tsconfig.json', '.gitignore', 'README.md')
$appPlayAssetFiles = @(
  'assets/stimyz/icon.png',
  'assets/stimyz/android-icon-foreground.png',
  'assets/stimyz/android-icon-monochrome.png',
  'assets/stimyz/stimmyz-logo-transparent.png'
)
$appPlayTrees = @('src/ui', 'src/data', 'src/media', 'src/analytics', 'src/onboarding')
$optionalAppPlayTrees = @('src/types', 'plugins')
$deviceAudioNativeFiles = @(
  'package.json',
  'index.js',
  'index.d.ts',
  'expo-module.config.json',
  'android/build.gradle',
  'android/src/main/cpp/CMakeLists.txt',
  'android/src/main/cpp/playback_dsp.h',
  'android/src/main/cpp/playback_dsp.cpp',
  'android/src/main/cpp/playback_dsp_jni.cpp',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/CaptureStatus.kt',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/PcmWavWriter.kt',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/PlaybackPreparation.kt',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/NativePlaybackDsp.kt',
  'android/src/test/java/dev/sarunas/soundboard/deviceaudio/PlaybackPreparationTest.kt',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioCaptureService.kt',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioConsentActivity.kt',
  'android/src/main/java/dev/sarunas/soundboard/deviceaudio/SoundboardDeviceAudioModule.kt'
)
$sharedLeaves = @(
  'app-client/src/audio/engine.ts',
  'app-client/src/audio/playbackState.ts',
  'app-client/src/editor/catalog.ts',
  'app-client/src/editor/importValidation.ts',
  'app-client/src/transfer/folderTransfer.ts',
  'app-client/src/editor/localAudioPcm.ts',
  'app-client/src/limits.ts',
  'app-client/src/keyboard/keyboardGeometry.ts',
  'app-client/src/keyboard/useKeyboardInputReveal.ts',
  'app-client/src/board/reorderGeometry.ts',
  'app-client/src/types/react-native-audio-api.d.ts'
)
$rootFiles = @(
  'package.json',
  '.yarnrc.yml',
  'yarn.lock',
  'scripts/check-elf-page-alignment.py',
  'scripts/assert-play-gradle-security-versions.cjs',
  '.yarn/patches/metro-npm-0.84.4-security.patch',
  '.yarn/patches/node-forge-npm-1.4.0-security.patch',
  'scripts/native-ffmpeg/build-android.sh',
  'scripts/native-ffmpeg/README.md',
  'scripts/native-ffmpeg/LICENSE',
  'scripts/native-tests/ffmpeg_decode_probe.c'
)
$workspaceManifests = @('shared/package.json', 'service/package.json', 'worker/package.json', 'app-client/package.json')
$blockedSegments = @('.git', '.expo', 'node_modules', 'android', 'ios', 'build', 'dist', '.yarn')
$blockedFile = '(?i)(^|[\/])\.env([^\/]*$|[\/])|\.(?:keystore|jks|pem|p12|pfx|key|mobileprovision)$'
$forbiddenText = '(?i)(soundboard-youtube|SoundboardYoutube|soundboard[/.$]youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|onDeviceYoutube|youtubeUrl|youtube\.com|youtu\.be|com[./]yausername|libpython|quickjs|youtubedl)'

New-Item -ItemType Directory -Path $stage | Out-Null

function Copy-StageFile([string] $relative) {
  $source = Join-Path $repo $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required Play input is missing: $relative" }
  $item = Get-Item -LiteralPath $source -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse-point input: $relative" }
  if ($relative.StartsWith('.yarn/patches/', [StringComparison]::Ordinal)) {
    foreach ($directory in @((Join-Path $repo '.yarn'), (Join-Path $repo '.yarn/patches'))) {
      if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Reviewed Yarn patch directory is missing: $directory" }
      $directoryItem = Get-Item -LiteralPath $directory -Force
      if (($directoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse-point Yarn patch directory: $directory" }
    }
  }
  if ($relative.StartsWith('scripts/native-ffmpeg/', [StringComparison]::Ordinal) -or $relative.StartsWith('scripts/native-tests/', [StringComparison]::Ordinal)) {
    $parentPaths = @((Join-Path $repo 'scripts'))
    if ($relative.StartsWith('scripts/native-ffmpeg/', [StringComparison]::Ordinal)) { $parentPaths += (Join-Path $repo 'scripts/native-ffmpeg') }
    if ($relative.StartsWith('scripts/native-tests/', [StringComparison]::Ordinal)) { $parentPaths += (Join-Path $repo 'scripts/native-tests') }
    foreach ($directory in $parentPaths) {
      if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw "Native build input directory is missing: $directory" }
      $directoryItem = Get-Item -LiteralPath $directory -Force
      if (($directoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse-point native build input directory: $directory" }
    }
  }
  if ($relative -match $blockedFile) { throw "Forbidden Play input: $relative" }
  $destination = Join-Path $stage ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination
}

function Copy-StageTree([string] $relative) {
  $source = Join-Path $appPlay $relative
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "Required Play source directory is missing: app-play/$relative" }
  $baseItem = Get-Item -LiteralPath $source -Force
  if (($baseItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse-point input: app-play/$relative" }
  foreach ($item in Get-ChildItem -LiteralPath $source -Recurse -Force) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse point inside app-play/$relative : $($item.FullName)" }
    if ($item.PSIsContainer) { continue }
    $repoRelative = [IO.Path]::GetRelativePath($repo, $item.FullName).Replace('\', '/')
    if ($repoRelative -match '(?i)\.test\.(?:mjs|cjs|js|jsx|ts|tsx)$') { continue }
    if ($repoRelative -match $blockedFile) { throw "Forbidden environment or key file in Play source: $repoRelative" }
    $segments = $repoRelative.Split('/')
    if ($segments | Where-Object { $blockedSegments -contains $_ }) { throw "Generated or forbidden path in Play source: $repoRelative" }
    $relativeWithinApp = [IO.Path]::GetRelativePath($appPlay, $item.FullName).Replace('\', '/')
    $destination = Join-Path $stage (('app-play/' + $relativeWithinApp).Replace('/', [IO.Path]::DirectorySeparatorChar))
    $parent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Copy-Item -LiteralPath $item.FullName -Destination $destination
  }
}

foreach ($file in $rootFiles) { Copy-StageFile $file }
foreach ($file in $workspaceManifests) { Copy-StageFile $file }
foreach ($file in $appPlayFiles) { Copy-StageFile "app-play/$file" }
foreach ($file in $appPlayAssetFiles) { Copy-StageFile "app-play/$file" }
foreach ($tree in $appPlayTrees) { Copy-StageTree $tree }
foreach ($tree in $optionalAppPlayTrees) {
  if (Test-Path -LiteralPath (Join-Path $appPlay $tree) -PathType Container) { Copy-StageTree $tree }
}
foreach ($leaf in $sharedLeaves) { Copy-StageFile $leaf }

$nativeModuleRoot = Join-Path $appPlay 'play-native-modules/soundboard-device-audio'
if (-not (Test-Path -LiteralPath $nativeModuleRoot -PathType Container)) { throw 'The allowlisted Play device-audio module is missing.' }
$nativeRootItem = Get-Item -LiteralPath $nativeModuleRoot -Force
if (($nativeRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing reparse-point native module root.' }
$nativeItems = @(Get-ChildItem -LiteralPath $nativeModuleRoot -Recurse -Force)
foreach ($item in $nativeItems) {
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse point in device-audio module: $($item.FullName)" }
}
$actualNativeFiles = @($nativeItems | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
  [IO.Path]::GetRelativePath($nativeModuleRoot, $_.FullName).Replace('\', '/')
})
$unexpectedNativeFiles = @($actualNativeFiles | Where-Object { $_ -notin $deviceAudioNativeFiles })
if ($unexpectedNativeFiles.Count -gt 0) { throw "Unallowlisted native module file found: $($unexpectedNativeFiles[0])" }
foreach ($file in $deviceAudioNativeFiles) { Copy-StageFile "app-play/play-native-modules/soundboard-device-audio/$file" }

$files = @(Get-ChildItem -LiteralPath $stage -File -Recurse -Force)
if ($files.Count -eq 0) { throw 'The Play stage is empty.' }
foreach ($item in $files) {
  $relative = [IO.Path]::GetRelativePath($stage, $item.FullName).Replace('\', '/')
  if ($relative -match $blockedFile) { throw "A forbidden environment or key file entered the Play stage: $relative" }
  if ($relative -match $forbiddenText) { throw "Extractor/YouTube marker found in staged source path: $relative" }
  if ($item.Extension -in @('.js', '.jsx', '.ts', '.tsx', '.json', '.gradle', '.xml', '.kt') -and $relative -ne 'app-play/package.json' -and $relative -notin $workspaceManifests) {
    $content = Get-Content -LiteralPath $item.FullName -Raw
    if ($content -match $forbiddenText) { throw "Extractor/YouTube marker found in staged source: $relative" }
  }
}

$inventory = foreach ($item in $files | Sort-Object FullName) {
  $relative = [IO.Path]::GetRelativePath($stage, $item.FullName).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{ path = $relative; sizeBytes = $item.Length; sha256 = $hash }
}
$record = [ordered]@{
  profile = 'play'
  stageOnly = [bool]$StageOnly
  deviceAudioCaptureEnabled = [bool]$deviceAudioCaptureEnabled
  analyticsEnabled = [bool]$analyticsEnabled
  analyticsHost = $postHogHost
  productAnalyticsSdk = '@posthog/core'
  productAnalyticsSdkVersion = $postHogSdkVersion
  stagedAtUtc = [DateTime]::UtcNow.ToString('o')
  sourceRoot = $repo
  sourceCommit = $sourceCommit
  workingTreeDirty = $workingTreeDirty
  files = @($inventory)
}
if ($analyticsEnabled) { $record['productAnalyticsDiagnosticsEnabled'] = [bool]$analyticsDiagnosticsEnabled }
$inventoryPath = Join-Path $stage 'play-stage-inventory.json'
$record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $inventoryPath -Encoding utf8

$verify = Join-Path $repo 'scripts/verify-play-stage.mjs'
if (Get-Command node -ErrorAction SilentlyContinue) {
  & node $verify $stage
} else {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found on the host, and Docker is unavailable to verify the Play stage.'
  }
  & docker image inspect soundboard-android:local *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Node.js was not found on the host, and soundboard-android:local is unavailable for Play stage verification.'
  }
  $verifyArgs = @(
    'run', '--rm',
    '-v', "${stage}:/input:ro",
    '-v', "${verify}:/verify.mjs:ro",
    'soundboard-android:local', 'node', '/verify.mjs', '/input'
  )
  & docker @verifyArgs
}
if ($LASTEXITCODE -ne 0) { throw "Play stage verification failed. Stage preserved at $stage" }

if ($StageOnly) {
  Write-Host "Verified Play source stage: $stage"
  Write-Host "Inventory: $inventoryPath"
  return
}

$buildImageId = (& docker image inspect --format='{{.Id}}' soundboard-android:local).Trim()
if ($LASTEXITCODE -ne 0 -or -not $buildImageId) { throw 'Could not record the Android build image ID.' }
& docker image inspect soundboard-android:local *> $null
if ($LASTEXITCODE -ne 0) { throw 'Build the soundboard-android:local image first with .\sb.ps1 apk.' }
foreach ($volume in @('soundboard_gradle', 'soundboard_yarn-cache')) {
  & docker volume inspect $volume *> $null
  if ($LASTEXITCODE -ne 0) { throw "The $volume Docker volume was not found; run the normal Android build first." }
}

$artifactDirectory = Join-Path $stage 'artifacts'
New-Item -ItemType Directory -Path $artifactDirectory | Out-Null
$containerBuild = @'
set -euo pipefail
mkdir -p /tmp/play-project
cp -a /workspace/. /tmp/play-project/
cd /tmp/play-project
corepack yarn install --immutable --mode=skip-build
ANDROID_NDK_HOME=/opt/android-sdk/ndk/27.1.12297006 HOST_CC=clang JOBS=2 bash scripts/native-ffmpeg/build-android.sh \
  --output-root /workspace/artifacts/native-ffmpeg \
  --install-root /tmp/play-project/node_modules/react-native-audio-api/android/src/main/jniLibs \
  --abis "$SOUNDBOARD_RN_ARCH"
cd /tmp/play-project/app-play
../node_modules/.bin/expo prebuild --platform android --no-install
cd android
  ./gradlew :app:dependencies --configuration releaseRuntimeClasspath --no-daemon > /workspace/artifacts/gradle-release-runtime-dependencies.txt 2>&1
  test -s /workspace/artifacts/gradle-release-runtime-dependencies.txt
  node /tmp/play-project/scripts/assert-play-gradle-security-versions.cjs /workspace/artifacts/gradle-release-runtime-dependencies.txt
  echo "Release runtime dependency inventory saved before assemble."
./gradlew :app:assembleRelease :app:bundleRelease --no-daemon "-PreactNativeArchitectures=$SOUNDBOARD_RN_ARCH"
apk="/tmp/play-project/app-play/android/app/build/outputs/apk/release/app-release-unsigned.apk"
aab="/tmp/play-project/app-play/android/app/build/outputs/bundle/release/app-release.aab"
test -s "$apk"
test -s "$aab"
expected_application_id="$(node -e "const a=require('/tmp/play-project/app-play/app.json').expo; if(a.android.package!=='dev.sarunas.soundboard.play') process.exit(2); process.stdout.write(a.android.package)")"
expected_version_name="$(node -e "const a=require('/tmp/play-project/app-play/app.json').expo; process.stdout.write(a.version)")"
expected_version_code="$(node -e "const a=require('/tmp/play-project/app-play/app.json').expo; if(!Number.isInteger(a.android.versionCode)||a.android.versionCode<1) process.exit(2); process.stdout.write(String(a.android.versionCode))")"
expected_min_sdk="$(node -e "process.stdout.write(String(require('/tmp/play-project/app-play/app.json').expo.android.minSdkVersion))")"
expected_target_sdk="$(node -e "process.stdout.write(String(require('/tmp/play-project/app-play/app.json').expo.android.targetSdkVersion))")"
capture_enabled="$EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED"
mkdir -p /workspace/artifacts
if [ "$capture_enabled" = true ]; then
  apk_filename='soundboard-play-testing-capture-unsigned.apk'
else
  apk_filename='soundboard-play-testing-unsigned.apk'
fi
cp "$apk" "/workspace/artifacts/$apk_filename.unverified"
cp "$aab" /workspace/artifacts/soundboard-play-unsigned.aab.unverified
badging="$(/opt/android-sdk/build-tools/36.0.0/aapt dump badging "$apk")"
printf '%s\n' "$badging" > /workspace/artifacts/apk-badging.txt
printf '%s\n' "$badging" | grep -F "package: name='$expected_application_id' versionCode='$expected_version_code' versionName='$expected_version_name'"
manifest="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest print "$apk")"
printf '%s\n' "$manifest" > /workspace/artifacts/merged-AndroidManifest.xml
printf '%s\n' "$manifest" | grep -F 'android:allowBackup="false"'
printf '%s\n' "$manifest" | grep -F 'android:usesCleartextTraffic="false"'
debuggable="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest debuggable "$apk")"
if [ "$debuggable" != 'false' ]; then echo "Play release APK debuggable must be false, found: $debuggable" >&2; exit 1; fi
application_id="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest application-id "$apk")"
test "$application_id" = "$expected_application_id"
manifest_version_name="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest version-name "$apk")"
manifest_version_code="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest version-code "$apk")"
test "$manifest_version_name" = "$expected_version_name"
test "$manifest_version_code" = "$expected_version_code"
permissions="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest permissions "$apk")"
printf '%s\n' "$permissions" > /workspace/artifacts/permissions.txt
printf '%s\n' "$badging" | grep -F "sdkVersion:'$expected_min_sdk'"
printf '%s\n' "$badging" | grep -F "targetSdkVersion:'$expected_target_sdk'"
printf '%s\n' "$badging" | grep -F "sdkVersion:'$expected_min_sdk'"
printf '%s\n' "$badging" | grep -F "targetSdkVersion:'$expected_target_sdk'"
for blocked in android.permission.READ_EXTERNAL_STORAGE android.permission.WRITE_EXTERNAL_STORAGE android.permission.MANAGE_EXTERNAL_STORAGE android.permission.READ_MEDIA_IMAGES android.permission.READ_MEDIA_VIDEO android.permission.READ_MEDIA_AUDIO android.permission.READ_MEDIA_VISUAL_USER_SELECTED; do
  if printf '%s\n' "$permissions" | grep -Fxq "$blocked"; then echo "Blocked permission is present: $blocked" >&2; exit 1; fi
done
if printf '%s\n' "$permissions" | grep -Fxq 'android.permission.SYSTEM_ALERT_WINDOW'; then echo 'Overlay permission must remain absent from the Play artifact.' >&2; exit 1; fi
if ! printf '%s\n' "$permissions" | grep -Fxq 'android.permission.RECORD_AUDIO'; then echo 'Recording permission is missing from the Play artifact.' >&2; exit 1; fi
if [ "$capture_enabled" = true ]; then
  for required in android.permission.FOREGROUND_SERVICE android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION android.permission.POST_NOTIFICATIONS; do
    if ! printf '%s\n' "$permissions" | grep -Fxq "$required"; then echo "Required capture permission is missing: $required" >&2; exit 1; fi
  done
else
  for forbidden in android.permission.FOREGROUND_SERVICE android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION android.permission.POST_NOTIFICATIONS; do
    if printf '%s\n' "$permissions" | grep -Fxq "$forbidden"; then echo "Production-default artifact must omit projection permission: $forbidden" >&2; exit 1; fi
  done
fi
for forbidden in android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK android.permission.FOREGROUND_SERVICE_MICROPHONE; do
  if printf '%s\n' "$permissions" | grep -Fxq "$forbidden"; then echo "Foreground soundboard must omit background service permission: $forbidden" >&2; exit 1; fi
done
printf '%s\n' "$manifest" > /tmp/play-merged-manifest.xml
python3 - /tmp/play-merged-manifest.xml "$capture_enabled" <<'PY'
import sys
import xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
capture_enabled = sys.argv[2]
android = '{http://schemas.android.com/apk/res/android}'
services = [item for item in root.findall('./application/service') if item.get(android + 'name') == 'dev.sarunas.soundboard.deviceaudio.DeviceAudioCaptureService']
activities = [item for item in root.findall('./application/activity') if item.get(android + 'name') == 'dev.sarunas.soundboard.deviceaudio.DeviceAudioConsentActivity']
audio_api_services = [item for item in root.findall('./application/service') if item.get(android + 'name') == 'com.swmansion.audioapi.system.CentralizedForegroundService']
assert not audio_api_services, 'Play must omit the react-native-audio-api background foreground service.'
if capture_enabled == 'true':
  assert len(services) == 1, 'Test build device-audio service must be merged exactly once'
  assert services[0].get(android + 'exported') == 'false', 'Device-audio service must be non-exported'
  raw_types = (services[0].get(android + 'foregroundServiceType') or '').split('|')
  type_names = {'mediaProjection': 'mediaProjection', '0x20': 'mediaProjection', '32': 'mediaProjection'}
  types = {type_names.get(value.strip(), value.strip()) for value in raw_types}
  assert types == {'mediaProjection'}, f'Unexpected device-audio service types: {types}'
  assert 'microphone' not in types, 'Device-audio capture must not use the microphone service type'
  assert len(activities) == 1 and activities[0].get(android + 'exported') == 'false', 'Consent activity must be present and non-exported'
else:
  assert not services, 'Production-default artifact must omit the device-audio service'
  assert not activities, 'Production-default artifact must omit the device-audio consent activity'
for tag in ('activity', 'service', 'receiver', 'provider'):
  for component in root.findall(f'./application/{tag}'):
    assert component.get(android + 'exported') in ('true', 'false'), f'{tag} {component.get(android + "name")} must declare android:exported'
PY
if [ "$?" -ne 0 ]; then echo 'Play merged manifest validation failed.' >&2; exit 1; fi
for artifact in "$apk" "$aab"; do
  audit="$(mktemp -d /tmp/play-artifact-audit.XXXXXX)"
  paths="$audit/archive-paths.txt"
  unzip -Z -1 "$artifact" > "$paths"
  if grep -Eiq 'soundboard-youtube|SoundboardYoutube|soundboard[/.$]youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|libpython|quickjs|youtubedl' "$paths"; then echo "Forbidden extractor path is present in $artifact" >&2; exit 1; fi
  unzip -qq "$artifact" -d "$audit"
  if [[ "$artifact" == *.apk ]]; then
    artifact_kind=APK
    package_lib_root="$audit/lib"
  else
    artifact_kind=AAB
    package_lib_root="$audit/base/lib"
  fi
  IFS=, read -r -a expected_ffmpeg_abis <<< "$SOUNDBOARD_RN_ARCH"
  for abi in "${expected_ffmpeg_abis[@]}"; do
    for library in libavcodec.so libavformat.so libavutil.so libswresample.so; do
      built_library="/workspace/artifacts/native-ffmpeg/jniLibs/$abi/$library"
      packaged_library="$package_lib_root/$abi/$library"
      test -s "$built_library"
      test -s "$packaged_library"
      built_hash="$(sha256sum "$built_library" | awk '{print $1}')"
      packaged_hash="$(sha256sum "$packaged_library" | awk '{print $1}')"
      if [ "$built_hash" != "$packaged_hash" ]; then
        echo "$artifact_kind FFmpeg library hash mismatch for $abi/$library: built=$built_hash packaged=$packaged_hash" >&2
        exit 1
      fi
      printf '%s abi=%s library=%s sha256=%s\n' "$artifact_kind" "$abi" "$library" "$packaged_hash" >> /workspace/artifacts/packaged-native-ffmpeg-sha256.txt
    done
  done
  if [[ "$artifact" == *.apk ]]; then elf_report=/workspace/artifacts/apk-elf-page-alignment.txt; else elf_report=/workspace/artifacts/aab-elf-page-alignment.txt; fi
  python3 /workspace/scripts/check-elf-page-alignment.py "$audit" | tee "$elf_report"
  matches="$audit/forbidden-payload-matches.txt"
  if grep -RaiIlE 'soundboard-youtube|SoundboardYoutube|soundboard[/.$]youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|youtube\.com|youtu\.be|com[./]yausername|libpython|quickjs|youtubedl' "$audit" > "$matches"; then
    echo "Forbidden extractor marker is present in $artifact" >&2
    exit 1
  fi
  signatures="$audit/signature-files.txt"
  find "$audit" -type f -path '*/META-INF/*' > "$signatures"
  if grep -Eiq '\.(RSA|EC|DSA|SF)$' "$signatures"; then echo "Signature entry found in unsigned artifact $artifact" >&2; exit 1; fi
  rm -rf "$audit"
done
find . -path '*/build/generated/autolinking/*' -type f -print | sort > /workspace/artifacts/native-autolinking-files.txt
expo_modules_list=/tmp/play-project/node_modules/expo/android/build/generated/expo/src/main/java/expo/modules/ExpoModulesPackageList.kt
test -s "$expo_modules_list"
printf '%s\n' "$expo_modules_list" >> /workspace/artifacts/native-autolinking-files.txt
sort -u -o /workspace/artifacts/native-autolinking-files.txt /workspace/artifacts/native-autolinking-files.txt
test -s /workspace/artifacts/native-autolinking-files.txt
while IFS= read -r generated; do sha256sum "$generated"; done < /workspace/artifacts/native-autolinking-files.txt > /workspace/artifacts/native-autolinking-sha256.txt
while IFS= read -r generated; do
  if grep -aiE 'soundboard-youtube|SoundboardYoutube|soundboard[/.$]youtube|yt-dlp|youtube-dl|YoutubeExtractor|NativeYoutube|com[./]yausername|libpython|quickjs|youtubedl' "$generated"; then echo 'Forbidden downloader dependency is present in generated native autolinking graph.' >&2; exit 1; fi
done < /workspace/artifacts/native-autolinking-files.txt
module_registered=false
while IFS= read -r generated; do
  if grep -aiE 'SoundboardDeviceAudioModule|SoundboardDeviceAudio' "$generated" >/dev/null; then module_registered=true; break; fi
done < /workspace/artifacts/native-autolinking-files.txt
if [ "$module_registered" != true ]; then
  echo 'The isolated SoundboardDeviceAudio Expo module is missing from native autolinking.' >&2
  exit 1
fi
mapping_file=/tmp/play-project/app-play/android/app/build/outputs/mapping/release/mapping.txt
test -s "$mapping_file"
cp "$mapping_file" /workspace/artifacts/mapping.txt
if /opt/android-sdk/build-tools/36.0.0/apksigner verify "$apk" >/dev/null 2>&1; then echo 'Play testing APK must be unsigned.' >&2; exit 1; fi
/opt/android-sdk/build-tools/36.0.0/zipalign -c -P 16 -v 4 "$apk" > /workspace/artifacts/zipalign-report.txt
mv "/workspace/artifacts/$apk_filename.unverified" "/workspace/artifacts/$apk_filename"
mv /workspace/artifacts/soundboard-play-unsigned.aab.unverified /workspace/artifacts/soundboard-play-unsigned.aab
sha256sum "/workspace/artifacts/$apk_filename" /workspace/artifacts/soundboard-play-unsigned.aab > /workspace/artifacts/SHA256SUMS
stat -c 'sizeBytes=%s' "/workspace/artifacts/$apk_filename" > /workspace/artifacts/release-info.txt
printf 'applicationId=%s\nversionName=%s\nversionCode=%s\nminSdk=%s\ntargetSdk=%s\narchitectures=%s\nminifyEnabled=true\nshrinkResources=true\nmappingFile=mapping.txt\nsigned=false\nallowBackup=false\nusesCleartextTraffic=false\nrecordAudioPermission=true\nprojectionCaptureEnabled=%s\nproductAnalyticsEnabled=%s\nproductAnalyticsHost=https://eu.i.posthog.com\nproductAnalyticsSdk=@posthog/core\nproductAnalyticsSdkVersion=%s\nsourceCommit=%s\nworkingTreeDirty=%s\nbuildImageId=%s\nnodeVersion=%s\nyarnVersion=%s\n' "$expected_application_id" "$manifest_version_name" "$manifest_version_code" "$expected_min_sdk" "$expected_target_sdk" "$SOUNDBOARD_RN_ARCH" "$capture_enabled" "$EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED" "$SOUNDBOARD_POSTHOG_SDK_VERSION" "$SOUNDBOARD_SOURCE_COMMIT" "$SOUNDBOARD_SOURCE_DIRTY" "$SOUNDBOARD_BUILD_IMAGE_ID" "$(node --version)" "$(yarn --version)" >> /workspace/artifacts/release-info.txt
if [ "$EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED" = true ]; then printf 'productAnalyticsDiagnosticsEnabled=%s\n' "${EXPO_PUBLIC_PRODUCT_ANALYTICS_DIAGNOSTICS:-false}" >> /workspace/artifacts/release-info.txt; fi
printf 'sourceStageVerified=true\nextractorSourceOrBinaryMarkers=absent\nnativeModuleAutolinking=device-audio-only\n' >> /workspace/artifacts/release-info.txt
sha256sum /workspace/artifacts/apk-badging.txt /workspace/artifacts/permissions.txt /workspace/artifacts/merged-AndroidManifest.xml /workspace/artifacts/apk-elf-page-alignment.txt /workspace/artifacts/aab-elf-page-alignment.txt /workspace/artifacts/zipalign-report.txt /workspace/artifacts/native-autolinking-files.txt /workspace/artifacts/native-autolinking-sha256.txt /workspace/artifacts/release-info.txt /workspace/artifacts/mapping.txt /workspace/artifacts/gradle-release-runtime-dependencies.txt /workspace/artifacts/packaged-native-ffmpeg-sha256.txt >> /workspace/artifacts/SHA256SUMS
find /workspace/artifacts/native-ffmpeg -type f -print0 | sort -z | xargs -0 sha256sum >> /workspace/artifacts/SHA256SUMS
'@
$containerBuild = [regex]::Replace($containerBuild, "`r`n?", "`n")
$dockerArgs = @(
  'run', '--rm',
  '-e', 'EXPO_NO_DOTENV=1',
  '-e', ('EXPO_PUBLIC_DEVICE_AUDIO_CAPTURE_ENABLED=' + ($(if ($deviceAudioCaptureEnabled) { 'true' } else { 'false' }))),
  '-e', ('EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=' + ($(if ($analyticsEnabled) { 'true' } else { 'false' }))),
  '-e', 'EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com',
  '-e', 'EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN',
  '-e', 'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
  '-e', "SOUNDBOARD_BUILD_IMAGE_ID=$buildImageId",
  '-e', "SOUNDBOARD_SOURCE_COMMIT=$sourceCommit",
  '-e', "SOUNDBOARD_SOURCE_DIRTY=$workingTreeDirty",
  '-e', "SOUNDBOARD_RN_ARCH=$ReactNativeArchitectures",
  '-e', "SOUNDBOARD_POSTHOG_SDK_VERSION=$postHogSdkVersion",
  '-v', "${stage}:/workspace",
  '-v', 'soundboard_gradle:/gradle',
  '-v', 'soundboard_yarn-cache:/root/.yarn/berry/cache',
  '-w', '/workspace'
)
if ($analyticsDiagnosticsEnabled) { $dockerArgs += @('-e', 'EXPO_PUBLIC_PRODUCT_ANALYTICS_DIAGNOSTICS=true') }
$dockerArgs += @('soundboard-android:local', 'bash', '-lc', $containerBuild)
$priorPostHogToken = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN', 'Process')
$hadPriorPostHogToken = Test-Path Env:EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN
try {
  if ($analyticsEnabled) { $env:EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN = $PostHogProjectToken }
  else { $env:EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN = '' }
  & docker @dockerArgs
} finally {
  if ($hadPriorPostHogToken) { $env:EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN = $priorPostHogToken }
  else { Remove-Item Env:EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN -ErrorAction SilentlyContinue }
}
if ($LASTEXITCODE -ne 0) { throw "Play build or artifact checks failed. Staged sources are preserved at $stage" }

$apkFilename = if ($deviceAudioCaptureEnabled) { 'soundboard-play-testing-capture-unsigned.apk' } else { 'soundboard-play-testing-unsigned.apk' }
Write-Host "Unsigned Play testing APK: $(Join-Path $artifactDirectory $apkFilename)"
Write-Host "Unsigned Play AAB: $(Join-Path $artifactDirectory 'soundboard-play-unsigned.aab')"
Write-Host "Build record: $(Join-Path $artifactDirectory 'release-info.txt')"
