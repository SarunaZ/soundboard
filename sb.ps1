# Soundboard task runner. Docker is the only prerequisite - no Node, no
# corepack, no Yarn, no JDK, no Android SDK on this machine.
#
# ASCII ONLY, deliberately. Windows PowerShell 5.1 reads a BOM-less .ps1 as
# ANSI, so a UTF-8 character like an arrow decodes into bytes that include a
# smart quote - which PowerShell treats as a string delimiter, producing
# baffling "missing terminator" errors far from the real line.
#
#   .\sb.ps1 <command>
#
# The bash twin is ./sb.sh. Both are thin wrappers over docker compose; nothing
# here is clever, so `docker compose ...` by hand always works too.

param(
  [Parameter(Position = 0)]
  [string] $Command = 'help',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Rest
)

# NOT 'Stop'. Windows PowerShell 5.1 wraps every stderr line from a native exe
# in an ErrorRecord, and docker writes ordinary progress ("Volume Creating") to
# stderr - under 'Stop' that aborts the script on the first status message.
# Native failures are caught by checking $LASTEXITCODE in Invoke-Docker instead.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$APK = 'app-client\android\app\build\outputs\apk\debug\app-debug.apk'

function Invoke-Docker {
  param([string[]] $DockerArgs)
  & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Show-Apk {
  if (Test-Path $APK) {
    $mb = [math]::Round((Get-Item $APK).Length / 1MB, 1)
    Write-Host ""
    Write-Host "OK  $APK  ($mb MB)" -ForegroundColor Green
  } else {
    Write-Host "Build reported success but no APK at $APK" -ForegroundColor Red
    exit 1
  }
}

function Show-Help {
  # Literal here-string: backticks and $ in the text below must not be treated
  # as PowerShell escapes.
  @'
Soundboard - Docker-only task runner

  build          EVERYTHING: dependencies, service image, APK
  install        Install node_modules inside Linux, into the working tree
  apk            Build the debug APK (installs deps first if missing)
                   --all-abis   build all four ABIs, for an x86_64 emulator
                   --clean      gradle clean first
  metro          Start the Metro dev server (needs LAN_IP in .env)
  shell          Bash shell inside the Android toolchain container

  service:up     Build and start the api + worker containers
  service:down   Stop them
  service:logs   Follow their logs
  service:health Print the API's /health

  doctor         Check that Docker is present and the images exist

Everything runs in a container. The first `apk` build takes ~9 min; later ones
about a minute, because Gradle's cache lives in a named volume.
'@ | Write-Host
}

switch ($Command.ToLower()) {

  'install' {
    Invoke-Docker @('compose', '--profile', 'tools', 'run', '--rm', 'deps')
  }

  'apk' {
    if ($Rest -contains '--all-abis') {
      $env:ABIS = 'armeabi-v7a,arm64-v8a,x86,x86_64'
      Write-Host '-> building all four ABIs'
    }
    if ($Rest -contains '--clean') {
      $env:GRADLE_TASK = 'clean'
      Invoke-Docker @('compose', '--profile', 'android', 'run', '--rm', 'apk')
      Remove-Item Env:\GRADLE_TASK
    }
    Invoke-Docker @('compose', '--profile', 'android', 'run', '--rm', 'apk')
    Show-Apk
    Write-Host "Copy it to the phone and tap it to install, then: .\sb.ps1 metro"
  }

  # Everything: dependencies, both service images, and the APK.
  'build' {
    Write-Host "== 1/3  dependencies ==" -ForegroundColor Cyan
    Invoke-Docker @('compose', '--profile', 'tools', 'run', '--rm', 'deps')

    Write-Host "`n== 2/3  service image (api + worker) ==" -ForegroundColor Cyan
    Invoke-Docker @('compose', 'build')

    Write-Host "`n== 3/3  android apk ==" -ForegroundColor Cyan
    Invoke-Docker @('compose', '--profile', 'android', 'run', '--rm', 'apk')
    Show-Apk

    Write-Host "`nAll built. Next: .\sb.ps1 service:up   and   .\sb.ps1 metro"
  }

  'metro' {
    if (-not (Test-Path .env) -or -not (Select-String -Path .env -Pattern '^LAN_IP=\S' -Quiet)) {
      Write-Host "LAN_IP is not set in .env - the phone would be handed a container IP it cannot reach." -ForegroundColor Yellow
      Write-Host "Your LAN addresses:"
      Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
        Select-Object -ExpandProperty IPAddress |
        ForEach-Object { Write-Host "  $_" }
      exit 1
    }
    Invoke-Docker @('compose', '--profile', 'tools', 'up', 'metro')
  }

  'shell' {
    Invoke-Docker @('compose', '--profile', 'android', 'run', '--rm', '--entrypoint', 'bash', 'apk')
  }

  'service:up'     { Invoke-Docker @('compose', 'up', '--build', '-d') }
  'service:down'   { Invoke-Docker @('compose', 'down') }
  'service:logs'   { Invoke-Docker @('compose', 'logs', '-f') }
  'service:health' { Invoke-Docker @('compose', 'exec', 'api', 'curl', '-fsS', 'http://127.0.0.1:8080/health') }

  'doctor' {
    & docker --version
    & docker compose version --short
    Write-Host "`nImages:"
    & docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' |
      Select-String 'soundboard|node:24'
    Write-Host "`nnode_modules present: $(Test-Path node_modules)"
    Write-Host ".env present:          $(Test-Path .env)"
  }

  default { Show-Help }
}
