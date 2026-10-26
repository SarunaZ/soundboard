const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

function packageInfoFromFile(filePath) {
  let directory = path.dirname(filePath);
  while (directory !== path.dirname(directory)) {
    const packagePath = path.join(directory, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (packageJson.name && packageJson.version) {
        return packageJson;
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Could not locate package metadata for ${filePath}`);
}

function packageDirectoryFromFile(filePath, packageName) {
  let directory = path.dirname(filePath);
  while (directory !== path.dirname(directory)) {
    const packagePath = path.join(directory, 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (packageJson.name === packageName) {
        return directory;
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Could not locate ${packageName} package root from ${filePath}`);
}

const metroRoot = packageDirectoryFromFile(require.resolve('metro'), 'metro');
const metroAssetsPath = path.join(metroRoot, 'src', 'Assets.js');
const metroAssets = require(metroAssetsPath);
const metroInfo = packageInfoFromFile(metroAssetsPath);
const requireFromMetro = createRequire(metroAssetsPath);
const imageSizeModule = requireFromMetro('image-size');
const imageSizeInfo = packageInfoFromFile(requireFromMetro.resolve('image-size'));
const expoCliSchemaPath = require.resolve(
  '@expo/cli/build/src/start/server/DevToolsPlugin.schema'
);
const expoCliInfo = packageInfoFromFile(expoCliSchemaPath);
const requireFromExpoCli = createRequire(expoCliSchemaPath);
const zodInfo = packageInfoFromFile(requireFromExpoCli.resolve('zod'));
const expoCliSchema = require(expoCliSchemaPath);
const createMcpSchema = require(
  '@expo/cli/build/src/start/server/createMCPDevToolsExtensionSchema'
).createMCPDevToolsExtensionSchema;
const expoMcpExtensions = require(
  '@expo/cli/build/src/start/server/MCPDevToolsPluginCLIExtensions'
);

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nWkAAAAASUVORK5CYII=',
  'base64'
);

test('Metro parses image-size 2 buffers and ordinary asset paths', async (t) => {
  assert.equal(metroInfo.version, '0.84.4');
  assert.equal(typeof imageSizeModule.imageSize, 'function');
  assert.equal(imageSizeInfo.version, '2.0.3');
  assert.deepEqual(metroAssets.getAssetSize('png', onePixelPng, 'pixel.png'), {
    width: 1,
    height: 1,
  });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-asset-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, 'pixel.png');
  fs.writeFileSync(imagePath, onePixelPng);

  const asset = await metroAssets.getAssetData(
    imagePath,
    'assets/pixel.png',
    [],
    null,
    '/assets'
  );
  assert.equal(asset.width, 1);
  assert.equal(asset.height, 1);
  assert.deepEqual(asset.scales, [1]);
});

test('Metro rejects malformed image signatures promptly when the extension says PNG', async (t) => {
  const malformed = [
    ['ICNS', Buffer.from('69636e7300000008', 'hex')],
    ['JXL', Buffer.from('ff0a', 'hex')],
    ['HEIF', Buffer.from('000000186674797068656963000000006865696300000000', 'hex')],
  ];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-malformed-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const metroRequirePath = metroAssetsPath;

  for (const [format, bytes] of malformed) {
    const imagePath = path.join(directory, `mismatched-${format.toLowerCase()}.png`);
    fs.writeFileSync(imagePath, bytes);
    const childSource = `
      const path = process.argv[1];
      const { getAssetData } = require(${JSON.stringify(metroRequirePath)});
      getAssetData(path, 'assets/' + require('node:path').basename(path), [], null, '/assets')
        .then(() => { console.error('malformed input was accepted'); process.exitCode = 1; })
        .catch((error) => { console.log('rejected: ' + error.name); });
    `;
    const result = spawnSync(process.execPath, ['-e', childSource, imagePath], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 3000,
    });
    assert.equal(result.error, undefined, `${format} parsing timed out or failed to start`);
    assert.equal(result.status, 0, `${format} parser did not reject: ${result.stderr}`);
    assert.match(result.stdout, /^rejected:/, `${format} malformed input was not rejected`);
  }
});

test('Expo CLI schemas keep working with Zod 4', async () => {
  assert.equal(expoCliInfo.version, '57.0.15');
  assert.equal(zodInfo.version, '4.6.6');
  const plugin = {
    packageName: '@test/plugin',
    packageRoot: '/tmp/test-plugin',
    bannerTitle: true,
    cliExtensions: {
      description: 'test extension',
      entryPoint: 'index.js',
      commands: [
        {
          name: 'hello',
          title: 'Say hello',
          environments: ['cli', 'mcp'],
          parameters: [{ name: 'who', type: 'text', description: 'Recipient' }],
        },
      ],
    },
  };

  assert.equal(expoCliSchema.PluginSchema.safeParse(plugin).success, true);
  const invalidPlugin = expoCliSchema.PluginSchema.safeParse({
    ...plugin,
    packageName: '',
  });
  assert.equal(invalidPlugin.success, false);
  assert.ok(Array.isArray(invalidPlugin.error.issues));

  assert.equal(
    expoCliSchema.DevToolsPluginOutputSchema.safeParse([
      { type: 'text', text: 'ok', level: 'info' },
    ]).success,
    true
  );
  const invalidOutput = expoCliSchema.DevToolsPluginOutputSchema.safeParse([
    { type: 'text', text: 'bad', level: 'unsupported' },
  ]);
  assert.equal(invalidOutput.success, false);
  assert.ok(Array.isArray(invalidOutput.error.issues));

  const inputSchema = createMcpSchema(plugin);
  assert.equal(inputSchema.safeParse({ command: 'hello', who: 'Sam' }).success, true);
  assert.equal(inputSchema.safeParse({ command: 'other', who: 'Sam' }).success, false);
  assert.equal(
    inputSchema.safeParse({ command: 'hello', who: 'Sam', extra: true }).success,
    false
  );

  let registration;
  await expoMcpExtensions.addMcpCapabilities(
    {
      registerTool(name, metadata, handler) {
        registration = { name, metadata, handler };
      },
    },
    {
      devtoolsPluginManager: {
        async queryPluginsAsync() {
          return [plugin];
        },
      },
    }
  );
  assert.equal(registration.name, plugin.packageName);
  assert.equal(
    registration.metadata.inputSchema.parameters.safeParse({ command: 'hello', who: 'Sam' })
      .success,
    true
  );
  assert.equal(typeof registration.handler, 'function');
});

test('Xcode 3 UUID generation works with uuid 11', () => {
  const xcodePath = require.resolve('xcode');
  assert.equal(packageInfoFromFile(xcodePath).version, '3.0.1');
  const requireFromXcode = createRequire(xcodePath);
  const uuidPath = requireFromXcode.resolve('uuid');
  const uuidInfo = packageInfoFromFile(uuidPath);
  const xcode = requireFromXcode('xcode');
  const project = xcode.project(path.join(os.tmpdir(), 'compatibility.pbxproj'));
  project.hash = { project: { objects: {} } };

  assert.equal(uuidInfo.version, '11.1.1');
  assert.equal(typeof requireFromXcode('uuid').v4, 'function');
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});
