import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const source = resolve(process.argv[2] || '.');
const output = process.argv[3] || 'design/reviews/baseline-v2/contract.json';
const A = await import(pathToFileURL(source + '/src/play/assets.js'));
const { defaultTuning } = await import(pathToFileURL(source + '/src/walk/controller.js'));
const square = await import(pathToFileURL(source + '/src/play/square.js'));
const { createRequire } = await import('node:module');
const require = createRequire(source + '/package.json');
const SD = require('./src/engine/engine.js');
const AI = require('./src/engine/ai.js');
const Human = require('./src/engine/human-driver.js');
const names = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita'];
const G = SD.createGame({ names, humanIndex: 0, seed: 1000 });
const session = Human.createSession({ G, minds: AI.create(G), humanId: 0 });
let guard = 0;
while (!session.over && guard++ < 4000) {
  const w = session.waitingFor();
  if (w) session.submit(w.options[0]);
  else if (!session.advanceBots()) break;
}
if (!session.over) throw new Error('Fingerprint did not terminate');
const replayBytes = JSON.stringify({ steps: session.steps, winner: G.winner, events: session.events, actions: session.actions }) + '\n';
const report = { method: 'GLTFLoader world vertex bounds and every socket; controller tuning; complete deterministic replay. This is not a walk.html visual acceptance.',
  tuning: defaultTuning(), placements: [], replaySha256: createHash('sha256').update(replayBytes).digest('hex') };
for (const spec of A.ENVIRONMENT) {
  const bytes = readFileSync(source + '/public' + A.assetUrl(spec));
  const gltf = await new Promise((ok, fail) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', ok, fail));
  const built = A.buildEnvironment(gltf.scene, spec);
  if (!built.ok) throw new Error(spec.id + ': ' + built.reason);
  const colliders = built.colliderParts.map((g) => {
    g.computeBoundingBox();
    return { name: g.name, min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray(),
      vertexSha256: createHash('sha256').update(Buffer.from(g.attributes.position.array.buffer)).digest('hex') };
  });
  const sockets = [];
  built.visual.traverse((n) => {
    if (n.name.startsWith('SOCKET_')) sockets.push({ name: n.name, position: n.getWorldPosition(new THREE.Vector3()).toArray() });
  });
  report.placements.push({ id: spec.id, place: spec.place, colliders, sockets });
}
report.squareConstants = Object.fromEntries(Object.entries(square).filter(([, value]) => typeof value !== 'function'));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
writeFileSync(output.replace(/\.json$/, '-replay.json'), replayBytes);
console.log(JSON.stringify({ placements: report.placements.length, replaySha256: report.replaySha256, output }));
