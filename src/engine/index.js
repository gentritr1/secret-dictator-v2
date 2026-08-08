/*
 * ESM shim over the UMD engine.
 *
 * engine.js, ai.js, driver.js, human-driver.js and view.js are byte-for-byte the
 * same files Node runs, and they are UMD: under Node they take the
 * `module.exports` branch; in a browser there is no `module`, so each one hangs
 * itself off the global object instead
 * (`self.SD`, `self.SDAI`, `self.SDDriver`, `self.SDHuman`, `self.SDView`).
 * They are not ESM and must not be
 * rewritten into ESM — engine.js and ai.js are held byte-identical to v1 so the
 * v1 self-test still proves them.
 *
 * A browser bundler cannot see those globals as exports, so this file is the
 * adapter: three side-effect imports in dependency order, then the globals are
 * re-exported as ordinary ESM bindings. Everything in src/app imports from here
 * and never touches the globals directly.
 *
 * Import order is load-bearing:
 *   engine.js  defines self.SD
 *   ai.js      reads self.SD at load time  (its UMD head calls the factory
 *              immediately with `root.SD`, so SD must already exist)
 *   driver.js  reads self.SD and self.SDAI at load time
 *   human-driver.js / view.js  read self.SDDriver at load time
 * ESM guarantees these run top-to-bottom in the order written, which is exactly
 * the guarantee needed.
 *
 * The `?? namespace.default` fallbacks cover the case where a bundler decides to
 * treat these files as CommonJS (it would then define `module`, the UMD head
 * would take the Node branch, and the API would arrive as a default export
 * instead of a global). Both paths yield the same object.
 *
 * Node must never load this file. package.json is "type": "commonjs", so this
 * ESM .js would be a syntax error under `require`. Node code requires the UMD
 * files by their exact paths (`require('../src/engine/engine.js')`) and never
 * the directory, so `require('../src/engine')` — which would resolve here — is
 * the one import to avoid.
 */
import * as engineModule from './engine.js';
import * as aiModule from './ai.js';
import * as driverModule from './driver.js';
import * as humanModule from './human-driver.js';
import * as viewModule from './view.js';

const g = /** @type {any} */ (globalThis);

export const SD = g.SD || engineModule.default || engineModule;
export const AI = g.SDAI || aiModule.default || aiModule;
export const Driver = g.SDDriver || driverModule.default || driverModule;
export const Human = g.SDHuman || humanModule.default || humanModule;
export const View = g.SDView || viewModule.default || viewModule;

/* Fail loudly and early rather than throwing "undefined is not a function"
 * somewhere deep in the first step. */
for (const [name, api, probe] of [
  ['SD', SD, 'createGame'],
  ['AI', AI, 'chooseNominee'],
  ['Driver', Driver, 'step'],
  ['Human', Human, 'createSession'],
  ['View', View, 'viewFor']
]) {
  if (!api || typeof api[probe] !== 'function') {
    throw new Error(
      'engine shim: ' + name + ' did not load (missing ' + probe + '). ' +
      'Check that every UMD file under src/engine/ ran and that the import ' +
      'order in src/engine/index.js is engine → ai → driver → human-driver → view.'
    );
  }
}
