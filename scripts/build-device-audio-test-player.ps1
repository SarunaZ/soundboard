$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
$fixture = [IO.Path]::GetFullPath((Join-Path $repo 'tools/device-audio-test-player'))
$outputDirectory = [IO.Path]::GetFullPath((Join-Path $repo 'data/device-audio-test-player'))
if (-not $fixture.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Fixture project path escaped the repository root.'
}
if (-not $outputDirectory.StartsWith((Join-Path $repo 'data') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'APK output must remain under the ignored data/ directory.'
}
& docker image inspect soundboard-android:local *> $null
if ($LASTEXITCODE -ne 0) { throw 'Build the soundboard-android:local image first with .\sb.ps1 apk.' }
& docker volume inspect soundboard_gradle *> $null
if ($LASTEXITCODE -ne 0) { throw 'The soundboard_gradle Docker volume was not found; run .\sb.ps1 apk first.' }

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$containerBuild = @'
set -euo pipefail
gradle_version=8.14.3
gradle_home="/gradle/distributions/gradle-${gradle_version}"
if [ ! -x "${gradle_home}/bin/gradle" ]; then
  mkdir -p /gradle/distributions
  archive="/gradle/distributions/gradle-${gradle_version}-bin.zip"
  checksum="${archive}.sha256"
  curl -fsSL "https://services.gradle.org/distributions/gradle-${gradle_version}-bin.zip" -o "${archive}.partial"
  curl -fsSL "https://services.gradle.org/distributions/gradle-${gradle_version}-bin.zip.sha256" -o "${checksum}.partial"
  mv "${checksum}.partial" "${checksum}"
  expected="$(tr -d '[:space:]' < "${checksum}")"
  actual="$(sha256sum "${archive}.partial" | cut -d ' ' -f 1)"
  if [ "$actual" != "$expected" ]; then echo 'Gradle distribution checksum mismatch.' >&2; exit 1; fi
  mv "${archive}.partial" "${archive}"
  unzip -q "${archive}" -d /gradle/distributions
fi
cd /workspace
"${gradle_home}/bin/gradle" --no-daemon --stacktrace :app:assembleDebug
install -D -m 0644 app/build/outputs/apk/debug/app-debug.apk /artifacts/capture-fixture-debug.apk
'@
& docker run --rm `
  -e 'GRADLE_USER_HOME=/gradle' `
  -v "${fixture}:/workspace" `
  -v 'soundboard_gradle:/gradle' `
  -v "${outputDirectory}:/artifacts" `
  -w /workspace `
  soundboard-android:local bash -lc $containerBuild
if ($LASTEXITCODE -ne 0) { throw 'Fixture build failed.' }
$apkPath = Join-Path $outputDirectory 'capture-fixture-debug.apk'
$sha256 = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Fixture APK: $apkPath"
Write-Host "SHA-256: $sha256"
