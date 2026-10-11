#requires -Version 7.0
param(
  [string]$ReportPath = (Join-Path ([System.IO.Path]::GetTempPath()) 'soundboard-imli-shared-container-report.json'),
  [string]$ReleaseImage,
  [switch]$Safeguards,
  [ValidateRange(30, 1800)][int]$SoakSeconds = 300,
  [switch]$FaultChecks
)

$ErrorActionPreference = 'Stop'
$project = 'soundboard-imli-test-' + [guid]::NewGuid().ToString('N')
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$composeFile = Join-Path $repoRoot 'deploy\shared-imli\compose.test.yml'
if ($ReleaseImage) {
  $ReleaseImage = $ReleaseImage.Trim()
  if (-not $ReleaseImage) { throw '-ReleaseImage must not be empty.' }
}
if ($Safeguards -and -not $ReleaseImage) { throw '-Safeguards requires -ReleaseImage.' }
if ($FaultChecks -and -not $ReleaseImage) { throw '-FaultChecks requires -ReleaseImage.' }
$imageToInspect = if ($ReleaseImage) { $ReleaseImage } else { 'soundboard-imli-prototype:local' }
$imageId = (& docker image inspect $imageToInspect --format '{{.Id}}' 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $imageId) {
  if ($ReleaseImage) { throw "Release image '$ReleaseImage' was not found locally; build it first using deploy/shared-imli/release/README.md." }
  throw 'Build soundboard-imli-prototype:local first; see deploy/shared-imli/README.md.'
}

$composeEnvFile = $null
$compose = @('compose', '--env-file', $composeEnvFile, '-p', $project, '-f', $composeFile)
if ($ReleaseImage) {
  $compose += @('-f', (Join-Path $repoRoot 'deploy\shared-imli\compose.release-test.yml'))
}
$sampling = [System.Collections.Generic.List[object]]::new()
$samplingErrors = [System.Collections.Generic.List[string]]::new()
$faultCheckResults = [System.Collections.Generic.List[object]]::new()

$sampleCode = @'
set -eu
read_value() { if [ -r "$1" ]; then cat "$1"; else printf '0'; fi; }
printf 'currentBytes=%s\n' "$(read_value /sys/fs/cgroup/memory.current)"
printf 'lifetimePeakBytes=%s\n' "$(read_value /sys/fs/cgroup/memory.peak)"
printf 'anonBytes=%s\n' "$(awk '$1 == "anon" {print $2}' /sys/fs/cgroup/memory.stat)"
printf 'fileBytes=%s\n' "$(awk '$1 == "file" {print $2}' /sys/fs/cgroup/memory.stat)"
printf 'inactiveFileBytes=%s\n' "$(awk '$1 == "inactive_file" {print $2}' /sys/fs/cgroup/memory.stat)"
while read -r key value; do printf 'event=%s=%s\n' "$key" "$value"; done < /sys/fs/cgroup/memory.events
for status in /proc/[0-9]*/status; do
  [ -r "$status" ] || continue
  awk '/^Name:/ {name=$2} /^VmRSS:/ {if ($2 > 0) print "proc=" name "|" $2}' "$status"
done
'@
$sampleCode = $sampleCode.Replace("`r", '')

function New-DockerComposeStartInfo([string[]]$Arguments) {
  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = 'docker'
  $info.WorkingDirectory = $repoRoot
  foreach ($argument in @($compose) + $Arguments) { [void]$info.ArgumentList.Add($argument) }
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.UseShellExecute = $false
  if ($ReleaseImage) { $info.Environment['SHARED_IMLI_RELEASE_IMAGE'] = $ReleaseImage }
  if ($Safeguards) {
    $info.Environment['SAFEGUARDS'] = '1'
    $info.Environment['SOAK_SECONDS'] = [string]$SoakSeconds
  }
  return $info
}

function Invoke-DockerCompose([string[]]$Arguments, [switch]$Cleanup) {
  $info = New-DockerComposeStartInfo $Arguments
  $command = [System.Diagnostics.Process]::new()
  $command.StartInfo = $info
  [void]$command.Start()
  $stdout = $command.StandardOutput.ReadToEndAsync()
  $stderr = $command.StandardError.ReadToEndAsync()
  $remainingMs = if ($Cleanup) { 60000 } else { [Math]::Max(1, [Math]::Min(300000, ($runnerDeadline - [DateTime]::UtcNow).TotalMilliseconds)) }
  if (-not $command.WaitForExit([int]$remainingMs)) {
    $command.Kill()
    throw "docker compose $($Arguments -join ' ') exceeded its timeout."
  }
  $output = $stdout.GetAwaiter().GetResult()
  $errorOutput = $stderr.GetAwaiter().GetResult()
  if ($command.ExitCode -ne 0) { throw "docker compose $($Arguments -join ' ') failed: $errorOutput`n$output" }
  return $output
}

function Get-ContainerMemory([string]$ContainerId) {
  try {
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = 'docker'
    foreach ($argument in @('exec', $ContainerId, 'sh', '-c', $sampleCode)) { [void]$info.ArgumentList.Add($argument) }
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.UseShellExecute = $false
    $samplerProcess = [System.Diagnostics.Process]::new()
    $samplerProcess.StartInfo = $info
    [void]$samplerProcess.Start()
    $linesTask = $samplerProcess.StandardOutput.ReadToEndAsync()
    $errorTask = $samplerProcess.StandardError.ReadToEndAsync()
    if (-not $samplerProcess.WaitForExit(5000)) {
      $samplerProcess.Kill()
      throw 'docker exec memory sampler exceeded its 5-second timeout.'
    }
    $lines = $linesTask.GetAwaiter().GetResult() -split "`r?`n"
    $samplerError = $errorTask.GetAwaiter().GetResult()
    if ($samplerProcess.ExitCode -ne 0 -or -not $lines) { throw "docker exec sampler failed: $samplerError" }
    $numbers = @{}
    $events = @{}
    $processRss = [System.Collections.Generic.List[object]]::new()
    foreach ($line in $lines) {
      if ($line -match '^event=([^=]+)=(\d+)$') { $events[$Matches[1]] = [long]$Matches[2] }
      elseif ($line -match '^proc=([^|]+)\|(\d+)$') { $processRss.Add([pscustomobject]@{ name = $Matches[1]; rssKiB = [long]$Matches[2] }) }
      elseif ($line -match '^([^=]+)=(\d+)$') { $numbers[$Matches[1]] = [long]$Matches[2] }
    }
    foreach ($required in @('currentBytes', 'lifetimePeakBytes', 'anonBytes', 'fileBytes', 'inactiveFileBytes')) {
      if (-not $numbers.ContainsKey($required)) { throw "Sampler omitted $required." }
    }
    $workingSet = [Math]::Max(0, $numbers.currentBytes - $numbers.inactiveFileBytes)
    $sampling.Add([pscustomobject]@{
      sampledAt = [DateTime]::UtcNow.ToString('o')
      currentBytes = $numbers.currentBytes
      anonBytes = $numbers.anonBytes
      fileBytes = $numbers.fileBytes
      inactiveFileBytes = $numbers.inactiveFileBytes
      workingSetBytes = $workingSet
      lifetimePeakBytes = $numbers.lifetimePeakBytes
      events = $events
      topProcesses = @($processRss | Sort-Object rssKiB -Descending | Select-Object -First 12)
    })
  } catch {
    $samplingErrors.Add($_.Exception.Message)
  }
}

$harnessExit = 1
$stdout = ''
$stderr = ''
$runnerMinutes = if ($Safeguards) { [Math]::Min(25, [Math]::Max(10, [Math]::Ceiling($SoakSeconds / 60) + 7)) } else { 10 }
$runnerDeadline = [DateTime]::UtcNow.AddMinutes($runnerMinutes)
try {
  $composeEnvFile = [System.IO.Path]::GetTempFileName()
  $compose[2] = $composeEnvFile
  Invoke-DockerCompose @('up', '-d', '--wait', 'mongo', 'gateway')
  Invoke-DockerCompose @('run', '--rm', 'mongo-seed')
  $gatewayId = (Invoke-DockerCompose @('ps', '-q', 'gateway') | Out-String).Trim()
  if (-not $gatewayId) { throw 'Could not resolve the isolated gateway container ID.' }

  $startInfo = New-DockerComposeStartInfo @('run', '--rm', '--no-deps', 'harness')
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  while (-not $process.HasExited) {
    if ([DateTime]::UtcNow -ge $runnerDeadline) {
      $process.Kill()
      throw "The integration run exceeded its $runnerMinutes-minute runner deadline."
    }
    Get-ContainerMemory $gatewayId
    Start-Sleep -Milliseconds 500
  }
  Get-ContainerMemory $gatewayId
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $harnessExit = $process.ExitCode

  $line = ($stdout -split "`r?`n" | Where-Object { $_ -like 'REPORT_JSON=*' } | Select-Object -Last 1)
  if (-not $line) { throw "Harness did not emit REPORT_JSON. Output: $stdout`n$stderr" }
  $report = $line.Substring('REPORT_JSON='.Length) | ConvertFrom-Json -AsHashtable
  $report['memorySamples'] = @($sampling)
  if ($Safeguards -and $report.safeguards.exactSourceSessionId -match '^[0-9a-f-]{36}$') {
    $sourceId = $report.safeguards.exactSourceSessionId
    $sourceBytesText = (& docker exec $gatewayId stat -c '%s' "/var/tmp/soundboard/editor/$sourceId/source.wav" 2>$null | Out-String).Trim()
    $sourceBytes = 0L
    $sourceMeasured = [long]::TryParse($sourceBytesText, [ref]$sourceBytes)
    $sizeCheck = [pscustomobject]@{ name = 'fixture source file is exactly 32 MiB'; passed = $sourceMeasured -and $sourceBytes -eq 33554432; detail = "bytes=$sourceBytesText" }
    $report['checks'] = @($report['checks']) + $sizeCheck
    $report['safeguards']['measuredSourceBytes'] = if ($sourceMeasured) { $sourceBytes } else { $null }
    if (-not $sizeCheck.passed) { $report['passed'] = $false; $harnessExit = 1 }
  } elseif ($Safeguards) {
    $sizeCheck = [pscustomobject]@{ name = 'fixture source file is exactly 32 MiB'; passed = $false; detail = 'Harness report did not include a valid exact-boundary session ID.' }
    $report['checks'] = @($report['checks']) + $sizeCheck
    if ($report['safeguards']) { $report['safeguards']['measuredSourceBytes'] = $null }
    else { $report['safeguards'] = @{ measuredSourceBytes = $null } }
    $report['passed'] = $false
    $harnessExit = 1
  }

  if ($FaultChecks -and $harnessExit -eq 0 -and $report['passed']) {
    function Invoke-DockerExec([string[]]$CommandArguments, [int]$TimeoutMilliseconds = 10000) {
      $info = [System.Diagnostics.ProcessStartInfo]::new()
      $info.FileName = 'docker'
      foreach ($argument in @('exec', $gatewayId) + $CommandArguments) { [void]$info.ArgumentList.Add($argument) }
      $info.RedirectStandardOutput = $true
      $info.RedirectStandardError = $true
      $info.UseShellExecute = $false
      $probe = [System.Diagnostics.Process]::new()
      $probe.StartInfo = $info
      try {
        [void]$probe.Start()
        $stdoutTask = $probe.StandardOutput.ReadToEndAsync()
        $stderrTask = $probe.StandardError.ReadToEndAsync()
        if (-not $probe.WaitForExit($TimeoutMilliseconds)) {
          $probe.Kill()
          return [pscustomobject]@{ succeeded = $false; exitCode = -1; stdout = ''; stderr = 'docker exec timed out' }
        }
        return [pscustomobject]@{
          succeeded = $probe.ExitCode -eq 0
          exitCode = $probe.ExitCode
          stdout = $stdoutTask.GetAwaiter().GetResult().Trim()
          stderr = $stderrTask.GetAwaiter().GetResult().Trim()
        }
      } catch { return [pscustomobject]@{ succeeded = $false; exitCode = -1; stdout = ''; stderr = $_.Exception.Message } }
    }
    function Send-WorkerSignal([int]$PidValue, [ValidateSet('SIGSTOP', 'SIGCONT', 'SIGKILL')][string]$Signal) {
      $signalCode = "process.kill(Number(process.argv[1]),process.argv[2])"
      return Invoke-DockerExec @('node', '-e', $signalCode, [string]$PidValue, $Signal) 10000
    }
    function Get-WorkerPid {
      $selector = "const fs=require('node:fs');const hits=[];for(const d of fs.readdirSync('/proc')){if(!/^\d+$/.test(d))continue;try{const a=fs.readFileSync('/proc/'+d+'/cmdline','utf8').split('\0');if(a.some(x=>x.endsWith('/app/service/dist/worker/index.js')||x==='service/dist/worker/index.js'))hits.push(Number(d));}catch{}}if(hits.length!==1)process.exit(21);console.log(hits[0]);"
      $result = Invoke-DockerExec @('node', '-e', $selector) 10000
      $pidResult = 0
      if ($result.succeeded -and [int]::TryParse($result.stdout, [ref]$pidResult) -and $pidResult -gt 1) { return $pidResult }
      return 0
    }
    function Test-WorkerStopped([int]$PidValue) {
      $stateCode = "const s=require('node:fs').readFileSync('/proc/'+process.argv[1]+'/status','utf8');console.log(/^State:\s+[Tt]/m.test(s))"
      $result = Invoke-DockerExec @('node', '-e', $stateCode, [string]$PidValue) 10000
      return $result.succeeded -and $result.stdout -eq 'true'
    }
    function Wait-WorkerStopped([int]$PidValue, [int]$TimeoutSeconds = 5) {
      $until = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
      do {
        if (Test-WorkerStopped $PidValue) { return $true }
        Start-Sleep -Milliseconds 100
      } while ([DateTime]::UtcNow -lt $until)
      return $false
    }
    function Wait-NewWorkerPid([int]$OldPid, [int]$TimeoutSeconds = 20) {
      $until = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
      do {
        $currentPid = Get-WorkerPid
        if ($currentPid -gt 1 -and $currentPid -ne $OldPid) { return $currentPid }
        Start-Sleep -Milliseconds 100
      } while ([DateTime]::UtcNow -lt $until)
      return 0
    }
    function Get-HttpStatus([string]$Path) {
      $result = Invoke-DockerExec @('curl', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}', '--max-time', '2', "http://127.0.0.1:4000$Path") 5000
      $status = 0
      if ($result.succeeded -and [int]::TryParse($result.stdout, [ref]$status)) { return $status }
      return 0
    }
    function Wait-HttpStatus([string]$Path, [int]$Expected, [int]$TimeoutSeconds = 12) {
      $until = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
      do {
        $status = Get-HttpStatus $Path
        if ($status -eq $Expected) { return $status }
        Start-Sleep -Milliseconds 100
      } while ([DateTime]::UtcNow -lt $until)
      return $status
    }
    $initialReady = Get-HttpStatus '/__shared/ready'
    $workerPid = Get-WorkerPid
    if ($initialReady -eq 200 -and $workerPid -gt 1) {
      $stopSignal = Send-WorkerSignal $workerPid 'SIGSTOP'
      if (-not $stopSignal.succeeded) {
        $faultCheckResults.Add([pscustomobject]@{ name = 'SIGSTOP delivered to the isolated worker'; passed = $false; detail = "pid=$workerPid exitCode=$($stopSignal.exitCode) error=$($stopSignal.stderr)" })
      } else {
        $workerStopped = Wait-WorkerStopped $workerPid
        $faultCheckResults.Add([pscustomobject]@{ name = 'SIGSTOP delivered and worker is stopped'; passed = $workerStopped; detail = "pid=$workerPid stateStopped=$workerStopped" })
        try {
          if ($workerStopped) {
            $readyDuringStop = Wait-HttpStatus '/__shared/ready' 503 12
            $healthDuringStop = Get-HttpStatus '/health'
            Start-Sleep -Seconds 1
            $readyAfterStale = Get-HttpStatus '/__shared/ready'
            $faultCheckResults.Add([pscustomobject]@{ name = 'worker stop makes shared readiness fail while Imli health stays 200'; passed = $readyDuringStop -eq 503 -and $healthDuringStop -eq 200; detail = "ready=$readyDuringStop health=$healthDuringStop" })
            $faultCheckResults.Add([pscustomobject]@{ name = 'stale worker heartbeat does not remain ready'; passed = $readyAfterStale -eq 503; detail = "ready=$readyAfterStale after 1s" })
          }
        } finally {
          $continueSignal = Send-WorkerSignal $workerPid 'SIGCONT'
          $faultCheckResults.Add([pscustomobject]@{ name = 'SIGCONT delivered to the isolated worker'; passed = $continueSignal.succeeded; detail = "pid=$workerPid exitCode=$($continueSignal.exitCode) error=$($continueSignal.stderr)" })
        }
        $resumed = Wait-HttpStatus '/__shared/ready' 200 15
        $faultCheckResults.Add([pscustomobject]@{ name = 'worker resume restores readiness'; passed = $continueSignal.succeeded -and $resumed -eq 200; detail = "ready=$resumed" })
        $killSignal = Send-WorkerSignal $workerPid 'SIGKILL'
        $newWorkerPid = if ($killSignal.succeeded) { Wait-NewWorkerPid $workerPid 20 } else { 0 }
        $recovered = if ($newWorkerPid -gt 1) { Wait-HttpStatus '/__shared/ready' 200 25 } else { 0 }
        $faultCheckResults.Add([pscustomobject]@{ name = 'worker crash starts a new worker and restores readiness'; passed = $killSignal.succeeded -and $newWorkerPid -gt 1 -and $recovered -eq 200; detail = "pidBefore=$workerPid pidAfter=$newWorkerPid ready=$recovered killError=$($killSignal.stderr)" })
      }
    } else {
      $faultCheckResults.Add([pscustomobject]@{ name = 'worker process uniquely identified for scoped fault checks'; passed = $false; detail = "initialReady=$initialReady pid=$workerPid" })
    }
    $report['checks'] = @($report['checks']) + @($faultCheckResults)
    if (@($faultCheckResults | Where-Object { -not $_.passed }).Count -gt 0) { $report['passed'] = $false; $harnessExit = 1 }
  } elseif ($FaultChecks) {
    $report['faultChecksSkipped'] = 'The integration harness failed; fault injection was skipped to preserve the original failure.'
  }
  Get-ContainerMemory $gatewayId
  $inspect = (& docker inspect $gatewayId --format '{{json .State}}') | ConvertFrom-Json
  $hostConfig = (& docker inspect $gatewayId --format '{{json .HostConfig}}') | ConvertFrom-Json
  $reportedMemory = [long]$hostConfig.Memory
  $reportedMemorySwap = [long]$hostConfig.MemorySwap
  $reportedNanoCpus = [long]$hostConfig.NanoCpus
  $cpuIsOne = $reportedNanoCpus -eq 1000000000 -or ($hostConfig.CpuQuota -eq 100000 -and $hostConfig.CpuPeriod -eq 100000)
  $limitChecks = @(
    [pscustomobject]@{ name = 'gateway memory limit is 512 MiB'; passed = $reportedMemory -eq 536870912; detail = "configuredBytes=$reportedMemory" },
    [pscustomobject]@{ name = 'gateway memory plus swap limit is 512 MiB'; passed = $reportedMemorySwap -eq 536870912; detail = "configuredBytes=$reportedMemorySwap" },
    [pscustomobject]@{ name = 'gateway CPU limit is one core'; passed = $cpuIsOne; detail = "nanoCpus=$reportedNanoCpus quota=$($hostConfig.CpuQuota) period=$($hostConfig.CpuPeriod)" },
    [pscustomobject]@{ name = 'gateway was not OOM-killed'; passed = -not [bool]$inspect.OOMKilled; detail = "OOMKilled=$($inspect.OOMKilled), exitCode=$($inspect.ExitCode)" },
    [pscustomobject]@{ name = 'gateway memory sampler captured cgroup state'; passed = $sampling.Count -gt 0; detail = "samples=$($sampling.Count), samplingErrors=$($samplingErrors.Count)" },
    [pscustomobject]@{ name = 'gateway cgroup OOM kill count is zero'; passed = $sampling.Count -gt 0 -and [long]$sampling[-1].events.oom_kill -eq 0; detail = if ($sampling.Count) { "oom_kill=$($sampling[-1].events.oom_kill)" } else { 'no cgroup samples' } }
  )
  $report['checks'] = @($report['checks']) + $limitChecks
  if (@($limitChecks | Where-Object { -not $_.passed }).Count -gt 0) {
    $report['passed'] = $false
    $harnessExit = 1
  }
  $report['memorySummary'] = [pscustomobject]@{
    sampleCount = $sampling.Count
    sampledPeakCurrentBytes = if ($sampling.Count) { ($sampling | Measure-Object -Property currentBytes -Maximum).Maximum } else { $null }
    observedPeakWorkingSetBytes = if ($sampling.Count) { ($sampling | Measure-Object -Property workingSetBytes -Maximum).Maximum } else { $null }
    lifetimePeakBytes = if ($sampling.Count) { ($sampling | Measure-Object -Property lifetimePeakBytes -Maximum).Maximum } else { $null }
    latestCurrentBytes = if ($sampling.Count) { $sampling[-1].currentBytes } else { $null }
    latestMemoryEvents = if ($sampling.Count) { $sampling[-1].events } else { $null }
    samplingErrors = @($samplingErrors)
    sampler = 'Host PowerShell polls gateway cgroup memory files and /proc through docker exec sh; memory.current minus inactive_file is the working-set estimate.'
  }
  $report['container'] = [pscustomobject]@{ id = $gatewayId; image = $imageToInspect; imageId = $imageId; oomKilled = [bool]$inspect.OOMKilled; exitCode = [int]$inspect.ExitCode; memoryLimitBytes = $reportedMemory; memorySwapLimitBytes = $reportedMemorySwap; nanoCpus = $reportedNanoCpus }
  $report['checkFailures'] = @($report['checks'] | Where-Object { -not $_.passed }).Count
  $report['passed'] = $harnessExit -eq 0 -and $report['checkFailures'] -eq 0
  if (-not $report['passed']) { $harnessExit = 1 }
  $report | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $ReportPath -Encoding utf8
  Write-Output "JSON report: $ReportPath"
  Write-Output (($stdout -split "`r?`n" | Where-Object { $_ -notlike 'REPORT_JSON=*' }) -join "`n")
  $overallLabel = if ($report['passed']) { 'passed' } else { 'failed' }
  Write-Output "Overall release integration $overallLabel; $($report['checks'].Count) checks; $($report['checkFailures']) failures."
  if ($stderr) {
    if ($harnessExit -eq 0) { Write-Verbose $stderr }
    else { Write-Error $stderr -ErrorAction Continue }
  }
} finally {
  try { Invoke-DockerCompose -Arguments @('down', '--volumes', '--remove-orphans') -Cleanup }
  finally { if ($composeEnvFile) { Remove-Item -LiteralPath $composeEnvFile -Force -ErrorAction SilentlyContinue } }
}

if ($harnessExit -ne 0) { exit $harnessExit }
