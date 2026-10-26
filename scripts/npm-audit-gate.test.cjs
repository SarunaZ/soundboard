const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  evaluateAuditRecords,
  parseAuditJsonLines,
  validateAuditCommandResult,
  validateNodeForgeEvidence,
} = require('./npm-audit-gate.mjs');

const evidence = () => ({
  resolution: 'patch:node-forge@npm%3A1.4.0#./.yarn/patches/node-forge-npm-1.4.0-security.patch',
  lockfileHasPatchedLocator: true,
  patchExists: true,
  patchSha256: '61370a7c0f2ee74e29b3b60ee14a1645270f914b584f1f1c59d3e693cf736280',
  instances: [{
    path: '/repo/node_modules/node-forge',
    version: '1.4.0',
    rsaSha256: '1cce9099aa521a2bd01ecf2cb3a28ea704b525ca0884411c9509fbbd059b15d5',
  }],
});

const forgeFinding = () => ({
  value: 'node-forge',
  children: {
    ID: 1240912,
    Issue: 'node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements',
    URL: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
    Severity: 'high',
    'Vulnerable Versions': '<=1.4.0',
    'Tree Versions': ['1.4.0'],
    Dependents: ['@expo/cli@virtual:abc123#npm:57.0.15'],
  },
});

test('audit JSONL parser accepts Yarn records and rejects unrecognized output', () => {
  const finding = forgeFinding();
  assert.deepEqual(parseAuditJsonLines(`${JSON.stringify(finding)}\n`), [finding]);
  assert.deepEqual(parseAuditJsonLines(''), []);
  assert.throws(() => parseAuditJsonLines('Yarn audit failed'), /invalid JSON/);
  assert.throws(() => parseAuditJsonLines('{"auditReportVersion":2}'), /unexpected record/);
});

test('audit command status must agree with returned machine-readable findings', () => {
  assert.doesNotThrow(() => validateAuditCommandResult(0, []));
  assert.doesNotThrow(() => validateAuditCommandResult(1, [forgeFinding()]));
  assert.throws(() => validateAuditCommandResult(1, []), /findings but returned no machine-readable/);
  assert.throws(() => validateAuditCommandResult(0, [forgeFinding()]), /records with a success exit code/);
  assert.throws(() => validateAuditCommandResult(2, []), /failed with exit code 2/);
  assert.throws(() => validateAuditCommandResult(null, []), /failed with exit code unknown/);
});

test('the single exact locally patched node-forge advisory is accepted', () => {
  assert.deepEqual(evaluateAuditRecords([forgeFinding()], evidence()), { localMitigations: 1 });
  assert.deepEqual(evaluateAuditRecords([], evidence()), { localMitigations: 0 });
});

test('unknown advisories and mismatched IDs or dependents fail', () => {
  const unknown = { value: 'zod', children: { ID: 1243066, URL: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5' } };
  assert.throws(() => evaluateAuditRecords([unknown], evidence()), /unapproved vulnerabilities/);
  const wrongId = forgeFinding();
  wrongId.children.ID += 1;
  assert.throws(() => evaluateAuditRecords([wrongId], evidence()), /unapproved vulnerabilities/);
  const changedTitle = forgeFinding();
  changedTitle.children.Issue = 'changed advisory title';
  assert.throws(() => evaluateAuditRecords([changedTitle], evidence()), /unapproved vulnerabilities/);
  const changedRange = forgeFinding();
  changedRange.children['Vulnerable Versions'] = '<1.4.0';
  assert.throws(() => evaluateAuditRecords([changedRange], evidence()), /unapproved vulnerabilities/);
  const extraDependent = forgeFinding();
  extraDependent.children.Dependents.push('new-consumer@npm:1.0.0');
  assert.throws(() => evaluateAuditRecords([extraDependent], evidence()), /unapproved vulnerabilities/);
});

test('missing or edited patches, unexpected installed versions, or unexpected copies fail', () => {
  const missing = evidence();
  missing.patchExists = false;
  assert.throws(() => validateNodeForgeEvidence(missing), /missing or has changed/);
  const edited = evidence();
  edited.patchSha256 = '0'.repeat(64);
  assert.throws(() => validateNodeForgeEvidence(edited), /missing or has changed/);
  const wrongVersion = evidence();
  wrongVersion.instances[0].version = '1.4.1';
  assert.throws(() => validateNodeForgeEvidence(wrongVersion), /not the reviewed patched/);
  const unpatchedDuplicate = evidence();
  unpatchedDuplicate.instances.push({ path: '/repo/app-client/node_modules/node-forge', version: '1.4.0', rsaSha256: '0'.repeat(64) });
  assert.throws(() => validateNodeForgeEvidence(unpatchedDuplicate), /exactly one installed/);
});

test('lockfile and exact root resolution must reference the reviewed patch locator', () => {
  const wrongResolution = evidence();
  wrongResolution.resolution = 'npm:1.4.0';
  assert.throws(() => validateNodeForgeEvidence(wrongResolution), /exact reviewed Yarn patch locator/);
  const missingLocator = evidence();
  missingLocator.lockfileHasPatchedLocator = false;
  assert.throws(() => validateNodeForgeEvidence(missingLocator), /exact reviewed Yarn patch locator/);
});
