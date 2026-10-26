const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSelectedVersions, selectedVersionsFromReport } = require('./assert-play-gradle-security-versions.cjs');

const secureReport = [
  'releaseRuntimeClasspath - Runtime classpath of compilation \'release\'.',
  '|    +--- commons-io:commons-io:1.4 -> 2.22.0',
  '|    +--- commons-io:commons-io:2.22.0',
  '|    +--- com.google.code.gson:gson:2.8.6 -> 2.14.0',
  '\\--- com.google.code.gson:gson:2.14.0 (*)',
].join('\n');

test('accepts old requested versions when every selected Gradle version is patched', () => {
  assert.deepEqual(assertSelectedVersions(secureReport), {
    'commons-io:commons-io': '2.22.0',
    'com.google.code.gson:gson': '2.14.0',
  });
});

test('fails if a security-sensitive dependency is missing from the graph report', () => {
  assert.throws(() => assertSelectedVersions('|--- commons-io:commons-io:2.22.0'), /gson.*no resolved version/);
});

test('fails closed when a module has multiple selected versions', () => {
  assert.throws(() => assertSelectedVersions(`${secureReport}\n|--- commons-io:commons-io:2.6`), /commons-io.*2.22.0.*2.6/);
});

test('reports only resolved targets after Gradle conflict arrows', () => {
  assert.deepEqual(selectedVersionsFromReport(secureReport), {
    'commons-io:commons-io': ['2.22.0'],
    'com.google.code.gson:gson': ['2.14.0'],
  });
});
