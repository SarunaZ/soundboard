import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeForgeResolution = 'patch:node-forge@npm%3A1.4.0#./.yarn/patches/node-forge-npm-1.4.0-security.patch';
const nodeForgeResolutionKey = 'node-forge@npm:^1.3.3';
const nodeForgePatchPath = '.yarn/patches/node-forge-npm-1.4.0-security.patch';
const nodeForgePatchSha256 = '61370a7c0f2ee74e29b3b60ee14a1645270f914b584f1f1c59d3e693cf736280';
const patchedRsaSha256 = '1cce9099aa521a2bd01ecf2cb3a28ea704b525ca0884411c9509fbbd059b15d5';
const acceptedForgeAdvisory = {
  packageName: 'node-forge',
  id: 1240912,
  issue: 'node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements',
  url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
  severity: 'high',
  vulnerableVersions: '<=1.4.0',
  version: '1.4.0',
  dependentName: '@expo/cli',
  dependentVersion: '57.0.15',
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function parseAuditJsonLines(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`npm audit emitted invalid JSON on line ${index + 1}: ${error.message}`);
    }
    if (!record || typeof record !== 'object' || typeof record.value !== 'string' || !record.children || typeof record.children !== 'object') {
      throw new Error(`npm audit emitted an unexpected record on line ${index + 1}.`);
    }
    return record;
  });
}

function isExactForgeAdvisory(record) {
  const issue = record.children;
  const versions = issue['Tree Versions'];
  const dependents = issue.Dependents;
  return record.value === acceptedForgeAdvisory.packageName
    && issue.ID === acceptedForgeAdvisory.id
    && issue.Issue === acceptedForgeAdvisory.issue
    && issue.URL === acceptedForgeAdvisory.url
    && issue.Severity === acceptedForgeAdvisory.severity
    && issue['Vulnerable Versions'] === acceptedForgeAdvisory.vulnerableVersions
    && Array.isArray(versions) && versions.length === 1 && versions[0] === acceptedForgeAdvisory.version
    && Array.isArray(dependents) && dependents.length === 1
    && typeof dependents[0] === 'string'
    && dependents[0].startsWith(`${acceptedForgeAdvisory.dependentName}@virtual:`)
    && dependents[0].endsWith(`#npm:${acceptedForgeAdvisory.dependentVersion}`);
}

export function evaluateAuditRecords(records, evidence) {
  validateNodeForgeEvidence(evidence);
  const unexpected = records.filter((record) => !isExactForgeAdvisory(record));
  if (unexpected.length) {
    const labels = unexpected.map((record) => `${record.value} ${record.children?.URL ?? 'unknown advisory'}`).join(', ');
    throw new Error(`npm audit found unapproved vulnerabilities: ${labels}`);
  }
  if (records.length > 1) throw new Error('npm audit returned duplicate locally mitigated node-forge findings.');
  return { localMitigations: records.length };
}

export function validateAuditCommandResult(status, records) {
  if (status !== 0 && status !== 1) {
    throw new Error(`yarn npm audit failed with exit code ${status ?? 'unknown'}.`);
  }
  if (status === 1 && records.length === 0) {
    throw new Error('yarn npm audit exited with findings but returned no machine-readable audit records.');
  }
  if (status === 0 && records.length > 0) {
    throw new Error('yarn npm audit returned vulnerability records with a success exit code.');
  }
}

export function validateNodeForgeEvidence(evidence) {
  if (!evidence || evidence.resolution !== nodeForgeResolution || evidence.lockfileHasPatchedLocator !== true) {
    throw new Error('node-forge is not pinned to the exact reviewed Yarn patch locator.');
  }
  if (evidence.patchExists !== true || evidence.patchSha256 !== nodeForgePatchSha256) {
    throw new Error('The reviewed node-forge patch is missing or has changed.');
  }
  if (evidence.instances?.length !== 1) {
    throw new Error(`Expected exactly one installed node-forge instance; found ${evidence.instances?.length ?? 0}.`);
  }
  for (const instance of evidence.instances) {
    if (instance.version !== acceptedForgeAdvisory.version || instance.rsaSha256 !== patchedRsaSha256) {
      throw new Error(`Installed node-forge is not the reviewed patched 1.4.0 instance: ${instance.path ?? 'unknown path'}.`);
    }
  }
}

function readPackageJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectNodeForgeInstances(projectRoot) {
  const instances = [];
  const visitedModulesDirectories = new Set();
  let visitedPackages = 0;

  function visitNodeModules(modulesDirectory) {
    if (!fs.existsSync(modulesDirectory)) return;
    let realModulesDirectory;
    try {
      realModulesDirectory = fs.realpathSync(modulesDirectory);
    } catch {
      return;
    }
    if (visitedModulesDirectories.has(realModulesDirectory)) return;
    visitedModulesDirectories.add(realModulesDirectory);
    if (visitedModulesDirectories.size > 10_000) throw new Error('Dependency traversal exceeded the node_modules directory limit.');

    for (const entry of fs.readdirSync(realModulesDirectory, { withFileTypes: true })) {
      if (entry.name === '.bin') continue;
      const entryPath = path.join(realModulesDirectory, entry.name);
      const packageDirectories = entry.name.startsWith('@') && entry.isDirectory()
        ? fs.readdirSync(entryPath, { withFileTypes: true }).map((child) => path.join(entryPath, child.name))
        : [entryPath];

      for (const packageDirectory of packageDirectories) {
        let realPackageDirectory;
        try {
          realPackageDirectory = fs.realpathSync(packageDirectory);
        } catch {
          continue;
        }
        let stat;
        try {
          stat = fs.statSync(realPackageDirectory);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;
        visitedPackages += 1;
        if (visitedPackages > 100_000) throw new Error('Dependency traversal exceeded the installed package limit.');

        const manifestPath = path.join(realPackageDirectory, 'package.json');
        if (fs.existsSync(manifestPath)) {
          let manifest;
          try {
            manifest = readPackageJson(manifestPath);
          } catch (error) {
            throw new Error(`Could not read installed dependency manifest ${manifestPath}: ${error.message}`);
          }
          if (manifest.name === 'node-forge') {
            const rsaPath = path.join(realPackageDirectory, 'lib', 'rsa.js');
            if (!fs.existsSync(rsaPath)) throw new Error(`Installed node-forge is missing lib/rsa.js: ${realPackageDirectory}`);
            instances.push({
              path: realPackageDirectory,
              version: manifest.version,
              rsaSha256: sha256(fs.readFileSync(rsaPath)),
            });
          }
        }

        visitNodeModules(path.join(realPackageDirectory, 'node_modules'));
      }
    }
  }

  visitNodeModules(path.join(projectRoot, 'node_modules'));
  for (const workspace of ['shared', 'service', 'worker', 'app-client', 'app-play']) {
    visitNodeModules(path.join(projectRoot, workspace, 'node_modules'));
  }
  return instances;
}

export function collectNodeForgeEvidence(projectRoot = root) {
  const packageJson = readPackageJson(path.join(projectRoot, 'package.json'));
  const lockfile = fs.readFileSync(path.join(projectRoot, 'yarn.lock'), 'utf8');
  const patchPath = path.join(projectRoot, nodeForgePatchPath);
  const patchExists = fs.existsSync(patchPath);
  const patchSha256 = patchExists ? sha256(fs.readFileSync(patchPath)) : null;
  const patchLocator = 'node-forge@patch:node-forge@npm%3A1.4.0#./.yarn/patches/node-forge-npm-1.4.0-security.patch';
  return {
    resolution: packageJson.resolutions?.[nodeForgeResolutionKey],
    lockfileHasPatchedLocator: lockfile.includes(patchLocator),
    patchExists,
    patchSha256,
    instances: collectNodeForgeInstances(projectRoot),
  };
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result;
}

export function runAuditGate(projectRoot = root) {
  const evidence = collectNodeForgeEvidence(projectRoot);
  validateNodeForgeEvidence(evidence);

  const regression = run(process.execPath, ['--test', 'scripts/node-forge-security.test.cjs'], projectRoot);
  if (regression.stdout) process.stdout.write(regression.stdout);
  if (regression.stderr) process.stderr.write(regression.stderr);
  if (regression.status !== 0) throw new Error('The node-forge security regression test did not pass.');

  const audit = run('yarn', ['npm', 'audit', '--all', '--recursive', '--json'], projectRoot);
  if (audit.stderr) process.stderr.write(audit.stderr);
  if (audit.stdout) process.stdout.write(audit.stdout);
  const records = parseAuditJsonLines(audit.stdout ?? '');
  validateAuditCommandResult(audit.status, records);
  const result = evaluateAuditRecords(records, evidence);
  if (result.localMitigations > 0) {
    process.stdout.write('npm audit reported the locally patched GHSA-86w9-cpqp-85rv finding for node-forge 1.4.0; installed patch and regression prerequisites are verified.\n');
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runAuditGate();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
