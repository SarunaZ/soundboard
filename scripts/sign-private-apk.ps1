param(
  [switch] $CreateKey,
  [string] $SignUnsignedApk
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($CreateKey -eq [bool]$SignUnsignedApk) {
  throw 'Choose exactly one action: -CreateKey or -SignUnsignedApk <path>.'
}

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
$dataRoot = [IO.Path]::GetFullPath((Join-Path $repo 'data'))
$keyDirectory = [IO.Path]::GetFullPath((Join-Path $dataRoot 'signing'))
$keyPath = Join-Path $keyDirectory 'soundboard-private-release.jks'
if (-not $dataRoot.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    -not $keyDirectory.StartsWith($dataRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The signing key path escaped the ignored data directory.'
}
foreach ($protectedDirectory in @($dataRoot, $keyDirectory)) {
  if (Test-Path -LiteralPath $protectedDirectory) {
    $directoryItem = Get-Item -LiteralPath $protectedDirectory -Force
    if (($directoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to use a reparse-point signing directory: $protectedDirectory"
    }
  }
}

& docker image inspect soundboard-android:local *> $null
if ($LASTEXITCODE -ne 0) { throw 'Build the soundboard-android:local image first with .\sb.ps1 apk.' }

if ($CreateKey) {
  if (Test-Path -LiteralPath $keyPath) {
    $existingKey = Get-Item -LiteralPath $keyPath -Force
    if (($existingKey.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Refusing to overwrite or follow a reparse-point signing key.'
    }
    throw "Refusing to overwrite the existing signing key at $keyPath. Preserve and back it up before continuing."
  }
  New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
  Write-Warning 'Keytool will prompt inside Docker. Enter a strong, unique password; do not send it in chat or save it beside the key.'
  $dockerArgs = @(
    'run', '--rm', '-it', '--network', 'none',
    '-v', "${keyDirectory}:/keys",
    'soundboard-android:local',
    'keytool', '-genkeypair', '-v', '-keystore', '/keys/soundboard-private-release.jks',
    '-alias', 'soundboard-private', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000'
  )
  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) { throw 'Key generation did not complete. Any created file was preserved; inspect it before retrying.' }
  if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw 'Keytool returned success without creating the expected key file.' }
  Write-Host "Signing key created: $keyPath"
  Write-Warning 'Back this key up now to encrypted off-device storage. Keep the password separately in a password manager. Losing either prevents signed updates to this package.'
  exit 0
}

if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) {
  throw "Signing key is missing. Create it first with .\scripts\sign-private-apk.ps1 -CreateKey"
}
$keyItem = Get-Item -LiteralPath $keyPath -Force
if (($keyItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Refusing to follow a reparse-point signing key.'
}

$inputPath = [IO.Path]::GetFullPath($SignUnsignedApk)
$releaseParent = Split-Path -Parent (Split-Path -Parent $inputPath)
if (-not $releaseParent.StartsWith($dataRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $inputPath) -ne 'soundboard-private-unsigned.apk' -or
    (Split-Path -Leaf (Split-Path -Parent $inputPath)) -ne 'artifacts' -or
    (Split-Path -Leaf $releaseParent) -notmatch '^private-release-') {
  throw 'Input must be the unsigned artifact in a private-release-*\artifacts directory under data.'
}
if (-not (Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "Unsigned APK not found: $inputPath" }
$artifactDirectory = Split-Path -Parent $inputPath
foreach ($protectedPath in @($releaseParent, $artifactDirectory, $inputPath)) {
  $pathItem = Get-Item -LiteralPath $protectedPath -Force
  if (($pathItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to use a reparse point in the release artifact path: $protectedPath"
  }
}
$hashFile = Join-Path $artifactDirectory 'SHA256SUMS'
if (-not (Test-Path -LiteralPath $hashFile -PathType Leaf)) { throw 'The unsigned artifact SHA256SUMS record is missing.' }
$expectedHashLine = Get-Content -LiteralPath $hashFile | Where-Object { $_ -match '\s+(?:/workspace/artifacts/)?soundboard-private-unsigned\.apk$' }
if (@($expectedHashLine).Count -ne 1 -or $expectedHashLine -notmatch '^([0-9a-fA-F]{64})\s+(?:/workspace/artifacts/)?soundboard-private-unsigned\.apk$') {
  throw 'The unsigned artifact SHA256SUMS record is malformed or ambiguous.'
}
$expectedHash = $Matches[1].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'The unsigned APK does not match its recorded SHA-256. Refusing to sign.' }
$outputPath = Join-Path $artifactDirectory 'soundboard-private.apk'
if (Test-Path -LiteralPath $outputPath) { throw "Refusing to overwrite an existing signed artifact: $outputPath" }
$candidateName = '.soundboard-private-candidate-{0}.apk' -f [guid]::NewGuid().ToString('N')

$dockerBuild = @'
set -euo pipefail
unsigned=/artifacts/soundboard-private-unsigned.apk
candidate="/artifacts/$CANDIDATE_NAME"
/opt/android-sdk/build-tools/36.0.0/zipalign -c -P 16 4 "$unsigned"
/opt/android-sdk/build-tools/36.0.0/apksigner sign \
  --ks /keys/soundboard-private-release.jks \
  --ks-key-alias soundboard-private \
  --out "$candidate" "$unsigned"
/opt/android-sdk/build-tools/36.0.0/apksigner verify --verbose --print-certs "$candidate" | tee /artifacts/signing-verification.txt
if grep -Eiq 'CN=Android Debug|androiddebugkey|fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c' /artifacts/signing-verification.txt; then
  echo 'The signed APK uses an Android debug certificate.' >&2
  exit 1
fi
badging="$(/opt/android-sdk/build-tools/36.0.0/aapt dump badging "$candidate")"
printf '%s\n' "$badging" | grep -F "package: name='dev.sarunas.soundboard.sideload' versionCode='2' versionName='1.0.1'"
native_code="$(printf '%s\n' "$badging" | sed -n 's/^native-code: //p')"
if [ "$native_code" != "'arm64-v8a'" ]; then
  echo "Expected an arm64-only APK, found native-code: ${native_code:-<none>}" >&2
  exit 1
fi
archive_abis="$(unzip -Z -1 "$candidate" | awk -F/ '$1 == "lib" { print $2 }' | sort -u)"
if [ "$archive_abis" != 'arm64-v8a' ]; then
  echo "Expected only lib/arm64-v8a entries in the APK, found: ${archive_abis:-<none>}" >&2
  exit 1
fi
debuggable="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest debuggable "$candidate")"
if printf '%s\n' "$debuggable" | grep -qi '^true$'; then
  echo 'The signed APK is debuggable.' >&2
  exit 1
fi
manifest="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest print "$candidate")"
printf '%s\n' "$manifest" | grep -F 'android:allowBackup="false"'
printf '%s\n' "$manifest" | grep -F 'android:usesCleartextTraffic="false"'
permissions="$(/opt/android-sdk/cmdline-tools/latest/bin/apkanalyzer manifest permissions "$candidate")"
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
/opt/android-sdk/build-tools/36.0.0/zipalign -c -P 16 4 "$candidate"
test ! -e /artifacts/soundboard-private.apk
mv "$candidate" /artifacts/soundboard-private.apk
sha256sum /artifacts/soundboard-private.apk | tee /artifacts/SHA256-SIGNED.txt
stat -c 'signedSizeBytes=%s' /artifacts/soundboard-private.apk >> /artifacts/release-info.txt
printf 'signed=true\n' >> /artifacts/release-info.txt
'@
$dockerBuild = $dockerBuild.Replace('$CANDIDATE_NAME', $candidateName)

Write-Host 'Docker will prompt for the keystore and key passwords. They are not passed in arguments or environment variables.'
$dockerArgs = @(
  'run', '--rm', '-it', '--network', 'none',
  '-v', "${keyDirectory}:/keys:ro",
  '-v', "${artifactDirectory}:/artifacts",
  'soundboard-android:local', 'bash', '-lc', $dockerBuild
)
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw "APK signing or post-sign checks failed. Any generated output is preserved at $artifactDirectory" }

Write-Host "Signed private APK: $outputPath"
Write-Host "SHA-256: $((Get-Content -LiteralPath (Join-Path $artifactDirectory 'SHA256-SIGNED.txt') -Raw).Trim())"
Write-Warning 'This signs the APK for private sideloading only. Review the key backup and physical-device checks before relying on it as a release.'
