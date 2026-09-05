'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Only this policy data is exempt from scanning; comments and test code are scanned.
const BANNED = [
  'swastika', 'hakenkreuz', 'ss runes', 'sig rune', 'eagle and wreath',
  'reichsadler', 'nazi', 'nsdap', 'nationalsozialistische', 'schutzstaffel',
  'hitler', 'goebbels', 'himmler', 'goring', 'göring', 'heil hitler',
  'sieg heil', 'arbeit macht frei', 'soviet flag', 'union jack',
  'stars and stripes', 'hammer and sickle', 'cdu', 'spd', 'kpd', 'sed'
];

const root = path.resolve(__dirname, '..');
const normalize = (s) => s.normalize('NFKC').toLowerCase().replace(/[_–—-]+/g, ' ');
const patterns = BANNED.map((term) => new RegExp('(?<![\\p{L}\\p{N}])' + term + '(?:s)?(?![\\p{L}\\p{N}])', 'u'));
function matches(text) {
  const normalized = normalize(text);
  return patterns.map((pattern, i) => pattern.test(normalized) ? i : -1).filter((i) => i >= 0);
}
for (const term of BANNED) {
  assert(matches(term.toUpperCase()).length > 0);
  assert(matches('VIS_' + term.replaceAll(' ', '-') + '_a').length > 0);
  assert(matches('// ' + term).length > 0);
}
assert.equal(matches('pass class clerk reform seize fictional notice').length, 0);

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : entry.isFile() ? [file] : [];
  });
}
const failures = [];
let textFiles = 0, glbs = 0, paths = 0;
function inspect(label, value) {
  for (const rule of matches(value)) failures.push(`${label}: policy rule ${rule + 1}`);
}
const candidates = ['src', 'test', 'scripts', 'public/assets', 'art/blender', 'design/references']
  .flatMap((dir) => files(path.join(root, dir)))
  .concat(fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(html|js|json)$/.test(entry.name)).map((entry) => path.join(root, entry.name)))
  .concat(path.join(root, 'docs/ASSET_MANIFEST.md'));
for (const file of [...new Set(candidates)].sort()) {
  const relative = path.relative(root, file);
  inspect(relative, relative); paths++;
  if (/\.(js|mjs|cjs|ts|py|html|css|json|md|txt|svg)$/i.test(file)) {
    let source = fs.readFileSync(file, 'utf8');
    if (file === __filename) source = source.replace(/const BANNED = \[[\s\S]*?\];/, 'const BANNED = [];');
    source.split('\n').forEach((line, i) => inspect(`${relative}:${i + 1}`, line));
    textFiles++;
  } else if (/\.glb$/i.test(file)) {
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, relative);
    assert.equal(bytes.readUInt32LE(8), bytes.length, relative);
    let jsonFound = false;
    for (let offset = 12; offset < bytes.length;) {
      const length = bytes.readUInt32LE(offset);
      assert(offset + 8 + length <= bytes.length, relative);
      if (bytes.readUInt32LE(offset + 4) === 0x4e4f534a) {
        const json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8'));
        inspect(relative + ':metadata', JSON.stringify(json));
        jsonFound = true;
      }
      offset += 8 + length;
    }
    assert(jsonFound, relative); glbs++;
  }
}
console.log(`Content grep: ${paths} paths, ${textFiles} text files including comments, ${glbs} GLB metadata chunks, ${BANNED.length} rules, ${failures.length} findings.`);
console.log('Image pixels and editable Blender internals require visual/source review; this grep does not certify them.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
