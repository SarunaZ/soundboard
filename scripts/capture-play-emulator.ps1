param(
  [string] $Serial = 'emulator-5554',
  [string] $Name = 'capture',
  [string] $OutputDirectory = 'data/emulator-review-2026-10-18',
  [string] $AdbPath = 'C:\Users\Sarunas\AppData\Local\Android\Sdk\platform-tools\adb.exe',
  [switch] $ScreenshotOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Serial -notmatch '^emulator-') { throw 'Serial must identify an emulator (start with "emulator-").' }
if ($Name -notmatch '^[a-z0-9-]+$') { throw 'Name must contain only lowercase letters, digits, and hyphens.' }
if (-not (Test-Path -LiteralPath $AdbPath -PathType Leaf)) { throw "ADB executable was not found: $AdbPath" }

$repo = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repo) { throw 'Run this script from inside the soundboard Git worktree.' }
$repo = [IO.Path]::GetFullPath($repo)
$dataRoot = [IO.Path]::GetFullPath((Join-Path $repo 'data'))
$requestedOutput = if ([IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path $repo $OutputDirectory }
$outputRoot = [IO.Path]::GetFullPath($requestedOutput)
$dataPrefix = $dataRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $outputRoot.Equals($dataRoot, [StringComparison]::OrdinalIgnoreCase) -and
    -not $outputRoot.StartsWith($dataPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputDirectory must resolve inside the repository data/ directory.'
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$pngPath = Join-Path $outputRoot "$Name.png"
$xmlPath = Join-Path $outputRoot "$Name.xml"
$proofPath = Join-Path $outputRoot "$Name.foreground.txt"
$capturePaths = if ($ScreenshotOnly) { @($pngPath, $proofPath) } else { @($pngPath, $xmlPath) }
if ($capturePaths | Where-Object { Test-Path -LiteralPath $_ }) {
  throw "A capture named '$Name' already exists in $outputRoot. Choose another Name."
}

$remotePng = "/sdcard/stimmyz-qa-$Name.png"
$remoteXml = "/sdcard/stimmyz-qa-$Name.xml"
$suffix = [guid]::NewGuid().ToString('N')
$temporaryPng = Join-Path $outputRoot ".$Name.$suffix.png.tmp"
$temporaryXml = Join-Path $outputRoot ".$Name.$suffix.xml.tmp"
$temporaryProof = Join-Path $outputRoot ".$Name.$suffix.foreground.tmp"
$finalPngCreated = $false
$finalXmlCreated = $false
$finalProofCreated = $false
$deviceReady = $false

function Invoke-Adb([string[]] $Arguments) {
  & $AdbPath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "ADB command failed (exit $LASTEXITCODE): $($Arguments -join ' ')" }
}

try {
  Invoke-Adb @('-s', $Serial, 'get-state')
  $deviceReady = $true
  if ($ScreenshotOnly) {
    $activityDump = & $AdbPath -s $Serial shell dumpsys activity activities
    if ($LASTEXITCODE -ne 0) { throw "ADB foreground check failed (exit $LASTEXITCODE)." }
    $activityLines = @($activityDump | Where-Object { $_ -match 'topResumedActivity|mResumedActivity' })
    $expectedActivity = '(?<![\w.])dev\.sarunas\.soundboard\.play/(?:dev\.sarunas\.soundboard\.play\.)?\.?MainActivity(?:\b|(?=\s|$))'
    $foregroundLines = @($activityLines | Where-Object { $_ -match $expectedActivity })
    if ($foregroundLines.Count -eq 0) {
      $observed = if ($activityLines.Count) { $activityLines -join [Environment]::NewLine } else { '(no resumed-activity line found)' }
      throw "Play MainActivity is not the verified foreground activity; refusing screenshot. Observed: $observed"
    }
    Set-Content -LiteralPath $temporaryProof -Value $foregroundLines -Encoding utf8
  } else {
    Invoke-Adb @('-s', $Serial, 'shell', 'uiautomator', 'dump', $remoteXml)
    Invoke-Adb @('-s', $Serial, 'pull', $remoteXml, $temporaryXml)

    [xml] $hierarchy = Get-Content -LiteralPath $temporaryXml -Raw
    $playNodes = @($hierarchy.SelectNodes('//*[@package="dev.sarunas.soundboard.play"]'))
    if ($playNodes.Count -eq 0) {
      throw 'The captured UI hierarchy does not contain dev.sarunas.soundboard.play; refusing to save a capture of another app.'
    }
  }

  Invoke-Adb @('-s', $Serial, 'shell', 'screencap', '-p', $remotePng)
  Invoke-Adb @('-s', $Serial, 'pull', $remotePng, $temporaryPng)

  if ($ScreenshotOnly) {
    Move-Item -LiteralPath $temporaryProof -Destination $proofPath
    $finalProofCreated = $true
  } else {
    Move-Item -LiteralPath $temporaryXml -Destination $xmlPath
    $finalXmlCreated = $true
  }
  Move-Item -LiteralPath $temporaryPng -Destination $pngPath
  $finalPngCreated = $true

  Write-Output "Saved Play emulator capture: $pngPath"
  if ($ScreenshotOnly) {
    foreach ($line in $foregroundLines) { Write-Output "foreground: $($line.Trim())" }
    Write-Output "Foreground proof: $proofPath"
  } else {
    foreach ($node in $playNodes) {
      $textValue = $node.GetAttribute('text')
      $description = $node.GetAttribute('content-desc')
      $bounds = $node.GetAttribute('bounds')
      Write-Output "text='$textValue' content-desc='$description' bounds='$bounds'"
    }
  }
}
catch {
  if ($finalXmlCreated -and (Test-Path -LiteralPath $xmlPath)) { Remove-Item -LiteralPath $xmlPath -Force }
  if ($finalProofCreated -and (Test-Path -LiteralPath $proofPath)) { Remove-Item -LiteralPath $proofPath -Force }
  if ($finalPngCreated -and (Test-Path -LiteralPath $pngPath)) { Remove-Item -LiteralPath $pngPath -Force }
  throw
}
finally {
  foreach ($temporaryPath in @($temporaryXml, $temporaryPng, $temporaryProof)) {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
  }
  if ($deviceReady) {
    if ($ScreenshotOnly) { & $AdbPath -s $Serial shell rm -f $remotePng *> $null }
    else { & $AdbPath -s $Serial shell rm -f $remoteXml $remotePng *> $null }
  }
}
