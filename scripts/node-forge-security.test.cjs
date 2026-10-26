const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const forge = require('node-forge');
const sha256Oid = Buffer.from('608648016503040201', 'hex');

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  for (let value = length; value > 0; value >>>= 8) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function sequence(...values) {
  return der(0x30, Buffer.concat(values));
}

function digestInfo(digest, algorithmParameters) {
  const algorithm = sequence(der(0x06, sha256Oid), ...algorithmParameters);
  return sequence(algorithm, der(0x04, digest));
}

function signEncodedDigestInfo(privateKey, encoded, modulusBytes) {
  const paddingLength = modulusBytes - encoded.length - 3;
  assert.ok(paddingLength >= 8, 'DigestInfo must fit in a PKCS#1 v1.5 block');
  const encodedMessage = Buffer.concat([
    Buffer.from([0, 1]),
    Buffer.alloc(paddingLength, 0xff),
    Buffer.from([0]),
    encoded,
  ]);
  return crypto.privateEncrypt({
    key: privateKey,
    padding: crypto.constants.RSA_NO_PADDING,
  }, encodedMessage);
}

function verify(forgeKey, digest, signature, scheme) {
  return forgeKey.verify(digest.toString('latin1'), signature.toString('latin1'), scheme);
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 0x10001,
});
const forgeKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
const digest = crypto.createHash('sha256').update('node-forge ASN.1 regression').digest();
const message = Buffer.from('node-forge ASN.1 regression');
const modulusBytes = Math.ceil(publicKey.asymmetricKeyDetails.modulusLength / 8);

const malformedWithNullExtra = signEncodedDigestInfo(
  privateKey,
  digestInfo(digest, [der(0x05, Buffer.alloc(0)), der(0x05, Buffer.alloc(0))]),
  modulusBytes,
);
const malformedWithoutNullExtra = signEncodedDigestInfo(
  privateKey,
  digestInfo(digest, [der(0x04, Buffer.from([0x7f]))]),
  modulusBytes,
);
const sha256WithNull = crypto.sign('sha256', message, privateKey);
const sha256WithoutNull = signEncodedDigestInfo(
  privateKey,
  digestInfo(digest, []),
  modulusBytes,
);
const pssSignature = crypto.sign('sha256', message, {
  key: privateKey,
  padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
  saltLength: 32,
});
const pssScheme = forge.pss.create({
  md: forge.md.sha256.create(),
  mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
  saltLength: 32,
});

function loadUnpatchedForge() {
  const sourceRoot = path.dirname(require.resolve('node-forge/package.json'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'node-forge-unpatched-'));
  fs.cpSync(sourceRoot, tempRoot, { recursive: true });
  const rsaPath = path.join(tempRoot, 'lib', 'rsa.js');
  let rsaSource = fs.readFileSync(rsaPath, 'utf8');
  const patchedCheck = `obj.value.length !== 2 ||
            obj.value[0].value.length !==
              (('parameters' in capture) ? 2 : 1)`;
  assert.ok(rsaSource.includes(patchedCheck), 'installed node-forge must include the nested-count patch');
  rsaSource = rsaSource.replace(patchedCheck, 'obj.value.length !== 2');
  fs.writeFileSync(rsaPath, rsaSource);
  return { forge: require(tempRoot), cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }) };
}

test('the malformed signature fixture demonstrates the original verifier gap', (t) => {
  const unpatched = loadUnpatchedForge();
  t.after(unpatched.cleanup);
  const key = unpatched.forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
  assert.equal(verify(key, digest, malformedWithNullExtra), true);
});

test('PKCS#1 v1.5 rejects unconsumed DigestAlgorithm elements', () => {
  assert.throws(() => verify(forgeKey, digest, malformedWithNullExtra));
  assert.throws(() => verify(forgeKey, digest, malformedWithoutNullExtra));
});

test('valid SHA-256 DigestInfo forms and RSA-PSS verification still work', () => {
  assert.equal(verify(forgeKey, digest, sha256WithNull), true);
  assert.equal(verify(forgeKey, digest, sha256WithoutNull), true);
  assert.equal(verify(forgeKey, digest, pssSignature, pssScheme), true);
});
