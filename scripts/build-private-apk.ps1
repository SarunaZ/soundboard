param(
  [string] $ManifestUrl = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
$dataRoot = [IO.Path]::GetFullPath((Join-Path $repo 'data'))
if (-not $dataRoot.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The artifact parent escaped the repository root.'
}

if ($ManifestUrl) {
  $manifestUri = $null
  if (-not [Uri]::TryCreate($ManifestUrl, [UriKind]::Absolute, [ref] $manifestUri) -or
      $manifestUri.Scheme -ne 'https' -or $manifestUri.UserInfo -or $manifestUri.Query -or $manifestUri.Fragment) {
    throw 'ManifestUrl must be an HTTPS URL without credentials, query parameters, or a fragment.'
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules') -PathType Container)) {
  throw 'Root node_modules is missing. Run .\sb.ps1 install before the private release build.'
}
& docker image inspect soundboard-android:local *> $null
if ($LASTEXITCODE -ne 0) { throw 'Build the soundboard-android:local image first with .\sb.ps1 apk.' }
& docker volume inspect soundboard_gradle *> $null
if ($LASTEXITCODE -ne 0) { throw 'The soundboard_gradle Docker volume was not found; run the normal Android build first.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stage = Join-Path $dataRoot ("private-release-{0}-{1}" -f $stamp, ([guid]::NewGuid().ToString('N').Substring(0, 8)))
if (Test-Path -LiteralPath $stage) { throw 'The unique release staging directory already exists.' }
New-Item -ItemType Directory -Path $stage | Out-Null

$includeRoots = @(
  'package.json', '.yarnrc.yml', 'yarn.lock',
  'shared',
  'app-client/package.json', 'app-client/app.json', 'app-client/app.config.js',
  'app-client/App.tsx', 'app-client/index.ts', 'app-client/tsconfig.json',
  'app-client/assets', 'app-client/src', 'app-client/modules', 'app-client/plugins'
)
$blockedSegments = @('.git', '.expo', 'node_modules', 'ios', 'build', 'dist', 'data')
$blockedFile = '(?i)(^|[\\/])\.env([^\\/]*$|[\\/])|\.(?:keystore|jks|pem|p12|pfx|key|mobileprovision)$'

foreach ($entry in $includeRoots) {
  $source = Join-Path $repo $entry
  if (-not (Test-Path -LiteralPath $source)) { throw "Required private-release input is missing: $entry" }

  $sourceItem = Get-Item -LiteralPath $source -Force
  if (($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing a reparse-point release input: $entry"
  }
  $items = if ($sourceItem.PSIsContainer) {
    Get-ChildItem -LiteralPath $source -Recurse -Force
  } else {
    @($sourceItem)
  }

  foreach ($item in $items) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing a reparse point inside release input: $($item.FullName)"
    }
    $relative = [IO.Path]::GetRelativePath($repo, $item.FullName).Replace('\', '/')
    if ($relative -match $blockedFile) { continue }
    $segments = $relative.Split('/')
    if ($segments | Where-Object { $blockedSegments -contains $_ }) { continue }
    if ($item.PSIsContainer) { continue }
    $resolvedSource = [IO.Path]::GetFullPath($item.FullName)
    if (-not $resolvedSource.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Release input escaped the repository root: $relative"
    }

    $destination = Join-Path $stage ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $resolvedDestination = [IO.Path]::GetFullPath($destination)
    if (-not $resolvedDestination.StartsWith($stage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Release destination escaped its staging directory: $relative"
    }
    $parent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Copy-Item -LiteralPath $item.FullName -Destination $destination
  }
}

$stagedFiles = Get-ChildItem -LiteralPath $stage -File -Recurse -Force
if ($stagedFiles.Count -eq 0) { throw 'The allowlisted release stage is empty.' }
foreach ($item in $stagedFiles) {
  $relative = [IO.Path]::GetRelativePath($stage, $item.FullName).Replace('\', '/')
  if ($relative -match $blockedFile) { throw "A forbidden environment or key file entered the stage: $relative" }
}

$artifactDirectory = Join-Path $stage 'artifacts'
New-Item -ItemType Directory -Path $artifactDirectory | Out-Null
$manifestEnvironment = if ($ManifestUrl) { $ManifestUrl } else { '' }
$containerBuild = @'
set -euo pipefail
ln -s /deps/node_modules /workspace/node_modules
cd /workspace/app-client
../node_modules/.bin/expo prebuild --platform android --no-install
cd android
./gradlew :soundboard-youtube:testReleaseUnitTest :app:assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
apk="/workspace/app-client/android/app/build/outputs/apk/release/app-release-unsigned.apk"
test -s "$apk"
badging="$(/opt/android-sdk/build-tools/36.0.0/aapt dump badging "$apk")"
printf '%s\n' "$badging" | grep -F "package: name='dev.sarunas.soundboard.sideload' versionCode='2' versionName='1.0.1'"
native_code="$(printf '%s\n' "$badging" | sed -n 's/^native-code: //p')"
if [ "$native_code" != "'arm64-v8a'" ]; then
  echo "Expected an arm64-only APK, found native-code: ${native_code:-<none>}" >&2
  exit 1
fi
archive_abis="$(unzip -Z -1 "$apk" | awk -F/ '$1 == "lib" { print $2 }' | sort -u)"
if [ "$archive_abis" != 'arm64-v8a' ]; then
  echo "Expected only lib/arm64-v8a entries in the APK, found: ${archive_abis:-<none>}" >&2
  exit 1
fi
debuggable="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest debuggable "$apk")"
if printf '%s\n' "$debuggable" | grep -qi '^true$'; then
  echo 'The private release APK is debuggable.' >&2
  exit 1
fi
manifest="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest print "$apk")"
printf '%s\n' "$manifest" | grep -F 'android:allowBackup="false"'
printf '%s\n' "$manifest" | grep -F 'android:usesCleartextTraffic="false"'
permissions="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest permissions "$apk")"
for blocked in \
  android.permission.READ_EXTERNAL_STORAGE \
  android.permission.WRITE_EXTERNAL_STORAGE \
  android.permission.MANAGE_EXTERNAL_STORAGE \
  android.permission.READ_MEDIA_IMAGES \
  android.permission.READ_MEDIA_VIDEO \
  android.permission.READ_MEDIA_AUDIO \
  android.permission.READ_MEDIA_VISUAL_USER_SELECTED \
  android.permission.RECORD_AUDIO \
  android.permission.POST_NOTIFICATIONS \
  android.permission.SYSTEM_ALERT_WINDOW; do
  if printf '%s\n' "$permissions" | grep -Fxq "$blocked"; then
    echo "Blocked permission is present: $blocked" >&2
    exit 1
  fi
done
/opt/android-sdk/build-tools/36.0.0/zipalign -c -P 16 4 "$apk"
cp "$apk" /workspace/artifacts/soundboard-private-unsigned.apk
sha256sum /workspace/artifacts/soundboard-private-unsigned.apk | tee /workspace/artifacts/SHA256SUMS
stat -c 'sizeBytes=%s' /workspace/artifacts/soundboard-private-unsigned.apk > /workspace/artifacts/release-info.txt
printf 'applicationId=dev.sarunas.soundboard.sideload\nversionName=1.0.1\nversionCode=2\nsigned=false\n' >> /workspace/artifacts/release-info.txt
'@

$dockerArgs = @(
  'run', '--rm',
  '-e', 'SOUNDBOARD_PRIVATE_RELEASE=1',
  '-e', 'EXPO_NO_DOTENV=1',
  '-e', 'EXPO_PUBLIC_EDITOR_API_URL=',
  '-e', 'EXPO_PUBLIC_EDITOR_TOKEN=',
  '-e', "EXPO_PUBLIC_MANIFEST_URL=$manifestEnvironment",
  '-v', "${stage}:/workspace",
  '-v', "${repo}\node_modules:/deps/node_modules",
  '-v', "${repo}\shared:/deps/shared:ro",
  '-v', 'soundboard_gradle:/gradle',
  '-w', '/workspace',
  'soundboard-android:local', 'bash', '-lc', $containerBuild
)
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw "The private APK build or artifact checks failed. Staged inputs are preserved at $stage" }

Write-Host "Unsigned private APK: $(Join-Path $artifactDirectory 'soundboard-private-unsigned.apk')"
Write-Host "SHA-256: $((Get-Content -LiteralPath (Join-Path $artifactDirectory 'SHA256SUMS') -Raw).Trim())"
Write-Host "Build record: $(Join-Path $artifactDirectory 'release-info.txt')"
Write-Warning 'This artifact is unsigned and is not installable. Use .\scripts\sign-private-apk.ps1 -CreateKey, then -SignUnsignedApk with this exact APK after reviewing and backing up the key.'
