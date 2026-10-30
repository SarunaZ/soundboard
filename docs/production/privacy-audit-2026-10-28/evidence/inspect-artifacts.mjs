import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve('data/play-creation-fix-build-20261026/artifacts');
const outDir = path.resolve('data/privacy-audit-20261028');
mkdirSync(outDir, { recursive: true });
const artifacts = [
  'soundboard-play-testing-capture-unsigned.apk',
  'soundboard-play-unsigned.aab',
  'stimmyz-1.0.29-testing.apk',
];
const telemetry = [
  /com\/google\/firebase\/analytics/i, /com\/google\/firebase\/crashlytics/i,
  /com\/google\/android\/gms\/measurement/i, /io\/sentry/i, /com\/sentry/i,
  /com\/posthog/i, /io\/posthog/i, /com\/amplitude/i, /com\/segment\/analytics/i,
  /com\/adjust\/sdk/i, /com\/appsflyer/i, /com\/google\/android\/gms\/ads/i,
  /com\/facebook\/ads/i, /com\/unity3d\/ads/i, /com\/ironsource/i,
];
const report = [];
function emit(...values) { const line = values.join(' '); report.push(line); console.log(line); }

function need(ok, message) { if (!ok) throw new Error(message); }
function u16(b, o) { need(o + 2 <= b.length, `truncated u16 at ${o}`); return b.readUInt16LE(o); }
function u32(b, o) { need(o + 4 <= b.length, `truncated u32 at ${o}`); return b.readUInt32LE(o); }

function zipEntries(filePath) {
  const bytes = readFileSync(filePath);
  const min = Math.max(0, bytes.length - 0xffff - 22);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= min; p--) if (u32(bytes, p) === 0x06054b50) { eocd = p; break; }
  need(eocd >= 0, `${filePath}: ZIP EOCD not found`);
  need(u16(bytes, eocd + 4) === 0 && u16(bytes, eocd + 6) === 0, `${filePath}: multi-disk ZIP unsupported`);
  const count = u16(bytes, eocd + 10), centralSize = u32(bytes, eocd + 12), centralOffset = u32(bytes, eocd + 16);
  need(count !== 0xffff && centralOffset !== 0xffffffff, `${filePath}: ZIP64 unsupported`);
  need(centralOffset + centralSize <= eocd, `${filePath}: invalid central directory bounds`);
  const entries = new Map(); let cursor = centralOffset;
  for (let i = 0; i < count; i++) {
    need(u32(bytes, cursor) === 0x02014b50, `${filePath}: malformed central entry ${i}`);
    const flags = u16(bytes, cursor + 8), method = u16(bytes, cursor + 10), crc = u32(bytes, cursor + 16);
    const compressedSize = u32(bytes, cursor + 20), size = u32(bytes, cursor + 24);
    const nameLen = u16(bytes, cursor + 28), extraLen = u16(bytes, cursor + 30), commentLen = u16(bytes, cursor + 32), localOffset = u32(bytes, cursor + 42);
    need(!(flags & 1), `${filePath}: encrypted ZIP entry unsupported`);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    need(!entries.has(name), `${filePath}: duplicate ZIP path ${name}`);
    entries.set(name, { name, flags, method, crc, compressedSize, size, localOffset });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  need(cursor === centralOffset + centralSize, `${filePath}: central directory size mismatch`);
  function read(entry) {
    const o = entry.localOffset;
    need(u32(bytes, o) === 0x04034b50, `${filePath}: missing local header for ${entry.name}`);
    const nl = u16(bytes, o + 26), el = u16(bytes, o + 28), start = o + 30 + nl + el;
    const end = start + entry.compressedSize;
    need(end <= bytes.length, `${filePath}: truncated ${entry.name}`);
    const payload = bytes.subarray(start, end);
    const result = entry.method === 0 ? Buffer.from(payload) : entry.method === 8 ? inflateRawSync(payload) : null;
    need(result, `${filePath}: unsupported compression ${entry.method} for ${entry.name}`);
    need(result.length === entry.size, `${filePath}: size mismatch for ${entry.name}`);
    return result;
  }
  return { bytes, entries, read };
}

function binaryXml(buffer, label) {
  if (buffer.subarray(0, 5).toString('ascii') === '<?xml') return { raw: buffer.toString('utf8'), tree: null };
  need(u16(buffer, 0) === 0x0003, `${label}: unsupported XML root type`);
  need(u16(buffer, 2) === 8 && u32(buffer, 4) === buffer.length, `${label}: invalid XML root header`);
  let pos = 8; const strings = []; const nodes = []; const stack = [];
  const str = (index) => { need(index >= 0 && index < strings.length, `${label}: bad string index ${index}`); return strings[index]; };
  while (pos < buffer.length) {
    need(pos + 8 <= buffer.length, `${label}: truncated chunk header`);
    const type = u16(buffer, pos), headerSize = u16(buffer, pos + 2), size = u32(buffer, pos + 4);
    need(headerSize >= 8 && size >= headerSize && pos + size <= buffer.length, `${label}: invalid chunk bounds at ${pos}`);
    if (type === 0x0001) {
      need(headerSize >= 28, `${label}: short string-pool header`);
      const stringCount = u32(buffer, pos + 8), flags = u32(buffer, pos + 16), stringsStart = u32(buffer, pos + 20);
      need(stringCount < 100000 && pos + stringsStart <= pos + size, `${label}: invalid string pool`);
      for (let i = 0; i < stringCount; i++) {
        const offset = u32(buffer, pos + headerSize + 4 * i); let p = pos + stringsStart + offset;
        if (flags & 0x100) {
          const readLen8 = () => { const a = buffer[p++]; if (a & 0x80) return ((a & 0x7f) << 8) | buffer[p++]; return a; };
          readLen8(); const byteLen = readLen8(); need(p + byteLen < pos + size, `${label}: bad UTF-8 string`);
          strings.push(buffer.subarray(p, p + byteLen).toString('utf8'));
        } else {
          let len = u16(buffer, p); p += 2;
          if (len & 0x8000) { len = ((len & 0x7fff) << 16) | u16(buffer, p); p += 2; }
          need(p + len * 2 + 2 <= pos + size, `${label}: bad UTF-16 string`);
          strings.push(buffer.subarray(p, p + len * 2).toString('utf16le'));
        }
      }
    } else if (type === 0x0180) {
      need((size - headerSize) % 4 === 0, `${label}: malformed resource map`);
    } else if ([0x0100, 0x0101].includes(type)) {
      need(headerSize >= 16, `${label}: short namespace node`);
    } else if (type === 0x0102) {
      need(headerSize >= 16 && size >= 36, `${label}: short start-element node`);
      const ext = pos + 16, nameIndex = u32(buffer, ext + 4), attrStart = u16(buffer, ext + 8), attrSize = u16(buffer, ext + 10), attrCount = u16(buffer, ext + 12);
      need(attrSize >= 20 && attrCount < 10000, `${label}: unsupported attribute layout`);
      const attrs = {};
      for (let i = 0; i < attrCount; i++) {
        const a = ext + attrStart + i * attrSize; need(a + 20 <= pos + size, `${label}: truncated attribute`);
        const key = str(u32(buffer, a + 4)), raw = u32(buffer, a + 8), dataType = buffer[a + 15], data = u32(buffer, a + 16);
        let value;
        if (raw !== 0xffffffff) value = str(raw);
        else if (dataType === 0x03) value = str(data);
        else if (dataType === 0x12) value = data !== 0;
        else if ([0x10, 0x11].includes(dataType)) value = data;
        else if (dataType === 0x01 || dataType === 0x02) value = `@0x${data.toString(16)}`;
        else if (dataType === 0x00) value = null;
        else throw new Error(`${label}: unsupported typed attribute value 0x${dataType.toString(16)} for ${key}`);
        attrs[key.replace(/^android:/, '')] = value;
      }
      const node = { name: str(nameIndex), attrs, children: [] };
      if (stack.length) stack.at(-1).children.push(node); else nodes.push(node);
      stack.push(node);
    } else if (type === 0x0103) {
      need(headerSize >= 16 && stack.length > 0, `${label}: unmatched end-element node`);
      const ext = pos + 16, name = str(u32(buffer, ext + 4));
      need(stack.at(-1).name === name, `${label}: mismatched end tag ${name}`); stack.pop();
    } else if (type === 0x0104) {
      need(headerSize >= 16 && size >= 28, `${label}: short CDATA node`);
      const index = u32(buffer, pos + 16); if (index !== 0xffffffff) stack.at(-1)?.children.push({ text: str(index) });
    } else {
      throw new Error(`${label}: unsupported XML chunk type 0x${type.toString(16)}`);
    }
    pos += size;
  }
  need(stack.length === 0 && nodes.length > 0, `${label}: incomplete XML tree`);
  return { raw: null, tree: nodes };
}

function findNodes(nodes, name, found = []) { for (const n of nodes ?? []) { if (n.name === name) found.push(n); findNodes(n.children, name, found); } return found; }
function escapeXml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
function toXml(node, depth = 0) {
  if (node.text !== undefined) return `${'  '.repeat(depth)}${escapeXml(node.text)}\n`;
  const attrs = Object.entries(node.attrs ?? {}).map(([k,v]) => ` ${k}="${escapeXml(v)}"`).join('');
  if (!node.children?.length) return `${'  '.repeat(depth)}<${node.name}${attrs}/>` + '\n';
  return `${'  '.repeat(depth)}<${node.name}${attrs}>\n${node.children.map(c => toXml(c, depth + 1)).join('')}${'  '.repeat(depth)}</${node.name}>\n`;
}
function summary(xml, label) {
  const parsed = binaryXml(xml, label);
  if (parsed.raw !== null) throw new Error(`${label}: expected compiled Android binary XML`);
  const nodes = parsed.tree;
  const permissions = [...findNodes(nodes, 'uses-permission'), ...findNodes(nodes, 'uses-permission-sdk-23'), ...findNodes(nodes, 'uses-permission-sdk-m')]
    .map(n => n.attrs.name).filter(Boolean).sort();
  const application = findNodes(nodes, 'application')[0];
  const componentTags = ['activity', 'activity-alias', 'service', 'receiver', 'provider'];
  const components = componentTags.flatMap(tag => findNodes(nodes, tag).map(n => ({ type: tag, name: n.attrs.name ?? null, exported: n.attrs.exported ?? null, permission: n.attrs.permission ?? null, authorities: n.attrs.authorities ?? null })));
  return { permissions, appFlags: application?.attrs ?? {}, components, tree: nodes };
}

function resourceTable(zip, label) {
  const entry = zip.entries.get('resources.arsc');
  need(entry, `${label}: resources.arsc missing`);
  const b = zip.read(entry);
  const pool = (start, end) => {
    need(u16(b, start) === 1, `${label}: expected resource string pool`);
    const headerSize = u16(b, start + 2), size = u32(b, start + 4), count = u32(b, start + 8), flags = u32(b, start + 16), stringsStart = u32(b, start + 20);
    need(headerSize >= 28 && start + size <= end && count < 200000, `${label}: malformed resource string pool`);
    const values = [];
    for (let i = 0; i < count; i++) {
      const offset = u32(b, start + headerSize + 4 * i); let p = start + stringsStart + offset;
      if (flags & 0x100) {
        const readLen8 = () => { const a = b[p++]; if (a & 0x80) return ((a & 0x7f) << 8) | b[p++]; return a; };
        readLen8(); const length = readLen8(); need(p + length <= start + size, `${label}: malformed UTF-8 resource string`);
        values.push(b.subarray(p, p + length).toString('utf8'));
      } else {
        let length = u16(b, p); p += 2;
        if (length & 0x8000) { length = ((length & 0x7fff) << 16) | u16(b, p); p += 2; }
        need(p + length * 2 <= start + size, `${label}: malformed UTF-16 resource string`);
        values.push(b.subarray(p, p + length * 2).toString('utf16le'));
      }
    }
    return { values, size };
  };
  need(u16(b, 0) === 2, `${label}: resources.arsc has wrong root type`);
  const rootHeader = u16(b, 2), rootSize = u32(b, 4); need(rootSize === b.length, `${label}: resources.arsc size mismatch`);
  let cursor = rootHeader, globalStrings = null; const found = new Map();
  while (cursor < rootSize) {
    const type = u16(b, cursor), header = u16(b, cursor + 2), size = u32(b, cursor + 4); need(size >= header && cursor + size <= rootSize, `${label}: malformed resource table chunk`);
    if (type === 1 && !globalStrings) globalStrings = pool(cursor, cursor + size).values;
    if (type === 0x0200) {
      need(header >= 284, `${label}: short resource package header`);
      const packageId = u32(b, cursor + 8), typeStringsOffset = u32(b, cursor + 268), typeIdOffset = header >= 288 ? u32(b, cursor + 284) : 0;
      const typeNames = pool(cursor + typeStringsOffset, cursor + size).values;
      let child = cursor + header;
      while (child < cursor + size) {
        const childType = u16(b, child), childHeader = u16(b, child + 2), childSize = u32(b, child + 4); need(childSize >= childHeader && child + childSize <= cursor + size, `${label}: malformed package resource chunk`);
        if (childType === 0x0201) {
          need(childHeader >= 20, `${label}: short resource type chunk`);
          const typeId = b[child + 8], entryCount = u32(b, child + 12), entriesStart = u32(b, child + 16), entryOffsets = child + childHeader;
          need(typeId > 0 && entryCount < 200000 && entryOffsets + 4 * entryCount <= child + childSize, `${label}: invalid resource entry offsets`);
          for (let i = 0; i < entryCount; i++) {
            const offset = u32(b, entryOffsets + i * 4); if (offset === 0xffffffff) continue;
            const ep = child + entriesStart + offset; need(ep + 8 <= child + childSize, `${label}: invalid resource entry`);
            const entrySize = u16(b, ep), flags = u16(b, ep + 2); if (flags & 1) continue;
            const vp = ep + entrySize; need(vp + 8 <= child + childSize, `${label}: invalid resource value`);
            const valueType = b[vp + 3], valueData = u32(b, vp + 4);
            {
              const id = `0x${((packageId << 24) | ((typeId + typeIdOffset) << 16) | i).toString(16)}`;
              found.set(id, { id, type: typeNames[typeId - 1] ?? `type-${typeId}`, valueType, valueData });
            }
          }
        } else if (![1, 0x0202, 0x0203, 0x0204].includes(childType)) throw new Error(`${label}: unsupported resource package chunk 0x${childType.toString(16)}`);
        child += childSize;
      }
    } else if (![1, 0x0100, 0x0200].includes(type)) throw new Error(`${label}: unsupported resources.arsc chunk 0x${type.toString(16)}`);
    cursor += size;
  }
  need(globalStrings, `${label}: global resource strings missing`);
  for (const resource of found.values()) {
    if (resource.valueType === 3) resource.file = globalStrings[resource.valueData];
    else if (resource.valueType === 1) resource.reference = found.get(`0x${resource.valueData.toString(16)}`)?.file ?? null;
  }
  return { files: found };
}

function protoFields(bytes, label) {
  const fields = []; let p = 0;
  const varint = () => {
    let value = 0n, shift = 0n;
    for (let i = 0; i < 10; i++) { need(p < bytes.length, `${label}: truncated protobuf varint`); const b = bytes[p++]; value |= BigInt(b & 0x7f) << shift; if (!(b & 0x80)) return value; shift += 7n; }
    throw new Error(`${label}: oversized protobuf varint`);
  };
  while (p < bytes.length) {
    const tag = Number(varint()), field = tag >>> 3, wire = tag & 7;
    need(field > 0, `${label}: invalid protobuf field number`);
    if (wire === 0) fields.push({ field, wire, value: varint() });
    else if (wire === 2) { const length = Number(varint()); need(Number.isSafeInteger(length) && p + length <= bytes.length, `${label}: truncated protobuf bytes`); fields.push({ field, wire, value: bytes.subarray(p, p + length) }); p += length; }
    else if (wire === 1 || wire === 5) { const length = wire === 1 ? 8 : 4; need(p + length <= bytes.length, `${label}: truncated protobuf fixed field`); p += length; }
    else throw new Error(`${label}: unsupported protobuf wire type ${wire}`);
  }
  return fields;
}
function bundleXmlElement(bytes, label, depth = 0) {
  need(depth < 64, `${label}: XML nesting too deep`);
  const fields = protoFields(bytes, label), names = fields.filter(f => f.field === 3 && f.wire === 2).map(f => f.value.toString('utf8'));
  need(names.length === 1, `${label}: unsupported bundle XML node shape`);
  const attrs = {};
  for (const f of fields.filter(f => f.field === 4 && f.wire === 2)) {
    const inner = protoFields(f.value, `${label}:attribute`);
    const key = inner.find(x => x.field === 2 && x.wire === 2)?.value.toString('utf8');
    const value = inner.find(x => x.field === 3 && x.wire === 2)?.value.toString('utf8');
    need(key && value !== undefined, `${label}: unsupported bundle XML attribute`);
    attrs[key] = value;
  }
  const children = fields.filter(f => f.field === 5 && f.wire === 2).map(f => {
    const node = protoFields(f.value, `${label}:child`), element = node.find(x => x.field === 1 && x.wire === 2);
    need(element && node.every(x => x.field === 1 || (x.field === 3 && x.wire === 2 && x.value.length === 4)), `${label}: unsupported bundle XML child node`);
    return bundleXmlElement(element.value, label, depth + 1);
  });
  for (const f of fields) need([1,3,4,5].includes(f.field), `${label}: unsupported bundle XML node field ${f.field}`);
  return { name: names[0], attrs, children };
}

function printRules(zip, names, label, apkResourceFiles, resourceIds = []) {
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    let actualName = name;
    let entry = zip.entries.get(actualName);
    if (!entry && apkResourceFiles) {
      const resource = apkResourceFiles.get(resourceIds[index]);
      if (resource?.type === 'xml' && resource.file) { actualName = resource.file; entry = zip.entries.get(actualName); }
    }
    if (!entry) { emit(`  ${name}: absent`); continue; }
    const data = zip.read(entry);
    let parsed;
    if (name.startsWith('base/')) {
      const document = protoFields(data, `${label}:${name}`);
      const root = document.find(f => f.field === 1 && f.wire === 2);
      need(root && document.every(f => f.field === 1 || (f.field === 3 && f.wire === 2 && f.value.length === 4)), `${label}:${name}: unsupported bundle XML document wrapper`);
      parsed = { raw: null, tree: [bundleXmlElement(root.value, `${label}:${name}`)] };
    } else parsed = binaryXml(data, `${label}:${name}`);
    emit(`  ${name}${actualName !== name ? ` [APK path ${actualName}]` : ''}:`);
    emit((parsed.raw ?? parsed.tree.map(n => toXml(n)).join('')).trimEnd().split('\n').map(s => `    ${s}`).join('\n'));
  }
}
function telemetryHits(zip) {
  const hits = new Set(); let dexCount = 0;
  for (const entry of zip.entries.values()) {
    if (!/^([^/]+\/)?classes\d*\.dex$/.test(entry.name) && !/\/classes\d*\.dex$/.test(entry.name)) continue;
    dexCount++;
    const data = zip.read(entry);
    const ascii = data.toString('latin1');
    for (const pattern of telemetry) {
      pattern.lastIndex = 0;
      for (const match of ascii.matchAll(new RegExp(pattern.source, 'ig'))) hits.add(match[0]);
    }
  }
  return { dexCount, hits: [...hits].sort() };
}
function libs(zip) { return [...zip.entries.keys()].filter(n => n.endsWith('.so')).sort(); }

for (const name of artifacts) {
  const filePath = path.join(root, name);
  const zip = zipEntries(filePath);
  const sha = createHash('sha256').update(zip.bytes).digest('hex');
  const manifestCandidates = name.endsWith('.aab')
    ? ['base/manifest/AndroidManifest.xml', 'AndroidManifest.xml']
    : ['AndroidManifest.xml'];
  const manifestName = manifestCandidates.find(n => zip.entries.has(n));
  need(manifestName, `${name}: manifest not found`);
  const isAab = name.endsWith('.aab');
  const manifest = isAab ? null : summary(zip.read(zip.entries.get(manifestName)), `${name}:${manifestName}`);
  const xmlRules = name.endsWith('.aab') ? ['base/res/xml/backup_rules.xml', 'base/res/xml/data_extraction_rules.xml'] : ['res/xml/backup_rules.xml', 'res/xml/data_extraction_rules.xml'];
  const resources = isAab ? null : resourceTable(zip, name).files;
  const dex = telemetryHits(zip), native = libs(zip);
  const block = [];
  block.push(`ARTIFACT ${name}`, `SHA256 ${sha}`, `BYTES ${zip.bytes.length}`, `MANIFEST ${manifestName}`);
  if (isAab) block.push('MANIFEST_FORMAT protobuf-bundle (manifest decode not implemented; APK is authoritative for binary AndroidManifest)');
  else {
    block.push(`PERMISSIONS ${JSON.stringify(manifest.permissions)}`);
    block.push(`APPLICATION_FLAGS ${JSON.stringify(Object.fromEntries(Object.entries(manifest.appFlags).filter(([k]) => /allowBackup|fullBackupContent|dataExtractionRules|debuggable|usesCleartextTraffic|label|name/.test(k))))}`);
    block.push(`COMPONENTS ${JSON.stringify(manifest.components)}`);
  }
  block.push(`DEX_COUNT ${dex.dexCount}`, `TELEMETRY_NAMESPACE_HITS ${JSON.stringify(dex.hits)}`, `NATIVE_LIBS ${JSON.stringify(native)}`);
  for (const line of block) emit(line);
  const resourceIds = manifest ? [manifest.appFlags.fullBackupContent, manifest.appFlags.dataExtractionRules].map(value => typeof value === 'string' && value.startsWith('@0x') ? value.slice(1).toLowerCase() : '') : [];
  printRules(zip, xmlRules, name, resources, resourceIds);
}

const unsignedPath = path.join(root, artifacts[0]);
const bundlePath = path.join(root, artifacts[1]);
const signedPath = path.join(root, artifacts[2]);
const unsignedZip = zipEntries(unsignedPath), bundleZip = zipEntries(bundlePath), signedZip = zipEntries(signedPath);
const payloadHash = (zip, name) => createHash('sha256').update(zip.read(zip.entries.get(name))).digest('hex');
const ignoredSignatures = (name) => /^META-INF\//i.test(name) && (/(?:^|\/)(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$/i.test(name));
const comparable = [...unsignedZip.entries.keys()].filter(n => signedZip.entries.has(n) && !ignoredSignatures(n));
const changed = comparable.filter(n => payloadHash(unsignedZip, n) !== payloadHash(signedZip, n));
const missingFromSigned = [...unsignedZip.entries.keys()].filter(n => !signedZip.entries.has(n) && !ignoredSignatures(n));
const extraInSigned = [...signedZip.entries.keys()].filter(n => !unsignedZip.entries.has(n) && !ignoredSignatures(n));
emit(`SIGNED_UNSIGNED_ENTRY_COMPARISON comparable=${comparable.length} identical=${comparable.length - changed.length} changed=${changed.length} missingFromSigned=${missingFromSigned.length} extraInSigned=${extraInSigned.length}`);
if (changed.length) emit(`SIGNED_UNSIGNED_CHANGED ${JSON.stringify(changed)}`);
if (missingFromSigned.length) emit(`SIGNED_UNSIGNED_MISSING ${JSON.stringify(missingFromSigned)}`);
if (extraInSigned.length) emit(`SIGNED_UNSIGNED_EXTRA ${JSON.stringify(extraInSigned)}`);
const compareMapped = (label, bundleName, apkName, apkZip = unsignedZip) => {
  const a = bundleZip.entries.has(bundleName), b = apkZip.entries.has(apkName);
  if (!a || !b) { emit(`${label} AAB=${a ? 'present' : 'absent'} APK=${b ? 'present' : 'absent'}`); return; }
  const ah = payloadHash(bundleZip, bundleName), bh = payloadHash(apkZip, apkName);
  emit(`${label} identical=${ah === bh} AAB_SHA256=${ah} APK_SHA256=${bh}`);
};
compareMapped('AAB_APK_BUNDLE', 'base/assets/index.android.bundle', 'assets/index.android.bundle');
compareMapped('AAB_SIGNED_APK_BUNDLE', 'base/assets/index.android.bundle', 'assets/index.android.bundle', signedZip);
for (const name of [...bundleZip.entries.keys()].filter(n => /^base\/dex\/classes\d*\.dex$/.test(n)).sort()) {
  const apkName = name.replace(/^base\/dex\//, '');
  compareMapped(`AAB_APK_DEX ${name}`, name, apkName);
  compareMapped(`AAB_SIGNED_APK_DEX ${name}`, name, apkName, signedZip);
}

const mergedPath = path.join(root, 'merged-AndroidManifest.xml');
const merged = readFileSync(mergedPath, 'utf8');
const mergedPermissions = [...merged.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].map(m => m[1]).sort();
emit(`MERGED_MANIFEST ${path.basename(mergedPath)}`);
emit(`MERGED_PERMISSIONS ${JSON.stringify(mergedPermissions)}`);
for (const match of merged.matchAll(/<application\b[^>]*>/g)) emit(`MERGED_APPLICATION ${match[0]}`);
const outPath = path.join(outDir, 'artifact-inspection.txt');
writeFileSync(outPath, report.join('\n') + `\n`);
console.log(`REPORT ${outPath}`);
