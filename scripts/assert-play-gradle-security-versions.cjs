const fs = require('node:fs');

const EXPECTED = Object.freeze({
  'commons-io:commons-io': '2.22.0',
  'com.google.code.gson:gson': '2.14.0',
});

function selectedVersionsFromReport(report, expected = EXPECTED) {
  const selected = Object.fromEntries(Object.keys(expected).map((coordinate) => [coordinate, new Set()]));
  for (const line of report.split(/\r?\n/)) {
    for (const coordinate of Object.keys(expected)) {
      const marker = `${coordinate}:`;
      const index = line.indexOf(marker);
      if (index === -1) continue;
      const detail = line.slice(index + marker.length).trim();
      const arrow = detail.lastIndexOf(' -> ');
      const version = (arrow === -1 ? detail : detail.slice(arrow + 4)).split(/[\s(]/, 1)[0];
      if (version) selected[coordinate].add(version);
    }
  }
  return Object.fromEntries(Object.entries(selected).map(([coordinate, versions]) => [coordinate, [...versions].sort()]));
}

function assertSelectedVersions(report, expected = EXPECTED) {
  const selected = selectedVersionsFromReport(report, expected);
  for (const [coordinate, expectedVersion] of Object.entries(expected)) {
    const versions = selected[coordinate];
    if (versions.length !== 1 || versions[0] !== expectedVersion) {
      throw new Error(`Expected ${coordinate} to resolve only to ${expectedVersion}; got ${versions.join(', ') || 'no resolved version'}.`);
    }
  }
  return Object.fromEntries(Object.entries(expected));
}

if (require.main === module) {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('Usage: node scripts/assert-play-gradle-security-versions.cjs <gradle-dependencies-report>');
    process.exit(2);
  }
  try {
    const report = fs.readFileSync(reportPath, 'utf8');
    assertSelectedVersions(report);
    console.log('Play Gradle security dependency versions verified: Commons IO 2.22.0, Gson 2.14.0.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { EXPECTED, selectedVersionsFromReport, assertSelectedVersions };
