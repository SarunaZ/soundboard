import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, 'run.ps1');
const powershell = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', timeout: 10_000 });

test('FaultChecks switch does not collide with runner result storage', async () => {
  const source = await readFile(runner, 'utf8');
  assert.match(source, /^\s*\[switch\]\$FaultChecks\s*$/m);
  assert.match(source, /^\$faultCheckResults\s*=\s*\[System\.Collections\.Generic\.List/m);
  assert.doesNotMatch(source, /^\$faultChecks\s*=/im);
  assert.match(source, /try\s*\{\s*\$composeEnvFile\s*=\s*\[System\.IO\.Path\]::GetTempFileName\(\)/);
  assert.match(source, /if \(\$FaultChecks -and \$harnessExit -eq 0 -and \$report\['passed'\]\)/);
  assert.match(source, /'exec', \$gatewayId\) \+ \$CommandArguments/);
  assert.match(source, /'curl', '--silent'.*http:\/\/127\.0\.0\.1:4000\$Path/);
  assert.doesNotMatch(source, /Invoke-WebRequest -Uri "\$baseUrl/);
  assert.match(source, /function Send-WorkerSignal[\s\S]*process\.kill\(Number\(process\.argv\[1\]\),process\.argv\[2\]\)/);
  assert.match(source, /function Test-WorkerStopped[\s\S]*\/proc\/.*\/status/);
  assert.match(source, /function Wait-NewWorkerPid[\s\S]*\$currentPid -ne \$OldPid/);
  assert.doesNotMatch(source, /docker exec \$gatewayId kill -(?:STOP|CONT|KILL)/);
  assert.match(source, /faultChecksSkipped[\s\S]*Get-ContainerMemory \$gatewayId\s+\$inspect =/);
  assert.match(source, /Overall release integration/);
});

test('32 MiB boundary fixture IDs satisfy the service 11-character URL contract', async () => {
  const source = await readFile(path.join(here, 'integration.mjs'), 'utf8');
  const fixtures = Object.fromEntries([...source.matchAll(/createSession\('([^']+)', '(exact-32-mib|over-32-mib)'\)/g)]
    .map(([, id, label]) => [label, id]));
  assert.deepEqual(fixtures, { 'exact-32-mib': 'exact32MiBx', 'over-32-mib': 'over32MiBx1' });
  for (const id of Object.values(fixtures)) assert.match(id, /^[A-Za-z0-9_-]{11}$/);
});

for (const value of [29, 1801]) {
  test(`run.ps1 rejects -SoakSeconds ${value} before touching Docker`, t => {
    if (powershell.error?.code === 'ENOENT') return t.skip('PowerShell 7 is not installed on this host.');
    assert.equal(powershell.status, 0, powershell.stderr || powershell.error?.message);
    const result = spawnSync('pwsh', ['-NoProfile', '-File', runner, '-SoakSeconds', String(value)], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(result.status, 0, `${value} unexpectedly passed parameter validation`);
    assert.match(`${result.stdout}\n${result.stderr}`, /SoakSeconds|ValidateRange|out of range/i);
  });
}
