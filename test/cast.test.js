/*
 * The crowd: seven citizens must be seven people, and none of them a lamp.
 *
 *     node test/cast.test.js            (npm run test:cast)
 *
 * WHY THIS FILE EXISTS. All four citizen GLBs ship the same body material —
 * `CarvedWood` at #917a5c — and `variantForSeat` cycles four silhouettes across
 * up to ten seats. At the table size the game is actually played at, seven,
 * that made seats 0 and 4, 1 and 5, and 2 and 6 the same shape AND the same
 * colour. Three pairs of citizens who could not be told apart across the
 * square, in a game whose entire subject is remembering who said what.
 *
 * `clothForSeat` dyes them. It is four lines long and every one of its three
 * constraints is invisible in the diff, which is exactly the shape of thing
 * this repository asserts rather than trusts:
 *
 *  1. IT IS ARITHMETIC. Same doctrine as `variantForSeat`: stable within a
 *     match, across a reload, across a replay, and identical no matter which
 *     seat the human took. Checked by running it, not by reading it — a
 *     Math.random slipped into that function would still look like a table
 *     lookup in review.
 *
 *  2. IT CANNOT BE A TELL. The only input is the seat index. That is a
 *     property of the SIGNATURE, so it is checked the way the ambience suite
 *     checks the light: hand it a recording proxy and assert what it read.
 *
 *  3. IT CANNOT SPEND THE WARM BUDGET. STYLE_BIBLE reserves the lantern-glow
 *     family for ATTENTION; test/ambience.test.js pins that family to hue
 *     20-65 degrees above 0.25 saturation. Seven lit citizens inside that band
 *     would read as seven lamps and would quietly eat a night budget measured
 *     in single-digit percentages. The predicate below is a COPY of the one in
 *     ambience.test.js on purpose — see the note above it.
 *
 * Plus `bodyPartOf`, which decides who gets dyed, and whose failure mode is a
 * citizen wearing their coat on their cane.
 */

'use strict';

/*
 * src/play/assets.js is an ES module that imports three.js, which this suite
 * has no business loading. The two functions under test are pure arithmetic
 * over numbers and plain objects, so they are read out of the source directly.
 *
 * NOT re-implemented, and that distinction is the whole value of the file: the
 * text below is the shipping text, evaluated. A re-description of the palette
 * would agree with itself forever.
 */
var fs = require('fs');
var path = require('path');

var SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'assets.js'), 'utf8');

function extract(name, kind) {
  var re = kind === 'const'
    ? new RegExp('export const ' + name + ' = \\[[\\s\\S]*?\\n\\];')
    : new RegExp('export function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = SRC.match(re);
  if (!m) throw new Error('could not find ' + name + ' in src/play/assets.js');
  return m[0].replace(/^export /, '');
}

var loaded = (function () {
  var src = [
    extract('CLOTH', 'const'),
    extract('clothForSeat', 'fn'),
    extract('bodyPartOf', 'fn'),
    'return { CLOTH: CLOTH, clothForSeat: clothForSeat, bodyPartOf: bodyPartOf };'
  ].join('\n');
  /* eslint-disable no-new-func */
  return new Function(src)();
})();

var CLOTH = loaded.CLOTH;
var clothForSeat = loaded.clothForSeat;
var bodyPartOf = loaded.bodyPartOf;

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }
function hexs(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }

/* ------------------------------------------------------- the warm predicate */

/*
 * A VERBATIM COPY of isLanternWarm() from test/ambience.test.js, and it is
 * copied rather than shared on purpose.
 *
 * The thing being asserted is "the cloth palette agrees with the rule the
 * ambience suite enforces". If both suites imported one helper, a future edit
 * that widened the band would move BOTH at once and this file would keep
 * passing while the budget it protects quietly changed. Two copies means the
 * band can only move if somebody moves it twice, which is a thing a review
 * notices. The duplication is the assertion.
 */
function hex(n) { return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }

function isLanternWarm(n) {
  var c = hex(n);
  var r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return false;
  var d = max - min;
  var l = (max + min) / 2;
  var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  var h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h >= 20 && h <= 65 && s > 0.25;
}

function hueOf(n) {
  var c = hex(n);
  var r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  var d = max - min;
  var h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}

/* ------------------------------------------------ 1. seven people, not four */

/*
 * The failure this whole feature exists to prevent, stated as the game states
 * it: at a real table size, no two living citizens may share BOTH a silhouette
 * and a coat.
 *
 * Silhouette cycles every 4 (four GLBs); coat cycles every 10. Two seats
 * collide only when they are congruent modulo lcm(4, 10) = 20, so any table up
 * to 20 is safe — but the assertion runs the real functions over the real
 * table sizes rather than trusting that arithmetic, because the two table
 * lengths are things somebody can change independently.
 */
var VARIANTS = 4;      // CHR_CITIZENS.length; see the guard below
function variantIndex(seat) { return ((seat % VARIANTS) + VARIANTS) % VARIANTS; }

check(/export const CHR_CITIZENS = \[[\s\S]*?\n\];/.test(SRC),
  'CHR_CITIZENS is not where this suite expects it');
var castRows = (SRC.match(/export const CHR_CITIZENS = \[([\s\S]*?)\n\];/) || [])[1] || '';
var realVariants = (castRows.match(/\{ id: 'chr-citizen/g) || []).length;
check(realVariants === VARIANTS,
  'CHR_CITIZENS has ' + realVariants + ' variants; this suite assumes ' + VARIANTS +
  ' — update VARIANTS and re-derive the collision arithmetic below');

for (var table = 5; table <= 10; table++) {
  var seen = {};
  for (var seat = 0; seat < table; seat++) {
    var key = variantIndex(seat) + ':' + clothForSeat(seat);
    check(!seen[key],
      'at ' + table + ' citizens, seats ' + seen[key] + ' and ' + seat +
      ' are the same figure in the same colour (' + hexs(clothForSeat(seat)) + ')');
    seen[key] = seat;
  }
}
say('distinct     tables of 5..10: no two seats share a silhouette and a coat');

/* --------------------------------------------------- 2. arithmetic, not chance */

/*
 * Run twice from a cold call and compare. This catches the thing reading the
 * function cannot: a draw from any generator, seeded or not, would return a
 * different table on the second sweep.
 */
var firstSweep = [];
for (var s1 = -3; s1 <= 24; s1++) firstSweep.push(clothForSeat(s1));
var secondSweep = [];
for (var s2 = -3; s2 <= 24; s2++) secondSweep.push(clothForSeat(s2));
check(firstSweep.join(',') === secondSweep.join(','),
  'clothForSeat returned a different palette on the second sweep — it is drawing, not indexing');

/* Wraps, and wraps the same way in both directions. A negative seat is not a
 * real seat, but `-1 % 10` is `-1` in JavaScript and an undefined lookup would
 * hand three.js NaN, which renders as black rather than as an error. */
for (var s3 = 0; s3 < 10; s3++) {
  check(clothForSeat(s3) === clothForSeat(s3 + 10),
    'seat ' + s3 + ' and seat ' + (s3 + 10) + ' disagree; the cycle is not the table length');
  check(clothForSeat(-10 + s3) === clothForSeat(s3),
    'a negative seat index does not wrap onto the same colour');
  check(typeof clothForSeat(s3) === 'number' && !isNaN(clothForSeat(s3)),
    'seat ' + s3 + ' got a non-number colour');
}
/* Junk in, a colour out — never NaN. `Number(undefined)` is NaN and
 * `Math.trunc(NaN)` is NaN, so the `|| 0` in the implementation is doing real
 * work and is worth a test that fails if somebody tidies it away. */
[undefined, null, NaN, 'x', {}].forEach(function (junk) {
  var c = clothForSeat(junk);
  check(typeof c === 'number' && !isNaN(c) && c >= 0 && c <= 0xffffff,
    'clothForSeat(' + String(junk) + ') returned ' + c + ' rather than a colour');
});
say('arithmetic   28 seats twice identical, cycles at ' + CLOTH.length +
  ', wraps negative, never NaN');

/* ------------------------------------------------------- 3. it reads the seat */

/*
 * The anti-tell check, done the way test/ambience.test.js does it rather than
 * by reasoning about the source: hand the function a proxy and assert what it
 * touched. A colour that consulted a role, a team or a game object would be a
 * presentation channel correlated with a hidden fact — the exact thing
 * test/tell.test.js exists to catch, caught here before it can be built.
 */
var touched = [];
var probe = new Proxy({ valueOf: function () { return 3; } }, {
  get: function (t, k) {
    if (typeof k !== 'symbol') touched.push(String(k));
    return t[k];
  }
});
clothForSeat(probe);
var illegal = touched.filter(function (k) {
  return ['valueOf', 'toString', 'then', 'constructor'].indexOf(k) === -1;
});
check(illegal.length === 0,
  'clothForSeat read ' + illegal.join(', ') + ' off its argument; it may only read the seat');
check(clothForSeat.length <= 2,
  'clothForSeat takes ' + clothForSeat.length + ' arguments; the seat and its table, and nothing else');
say('no tell      the colour is a function of the seat index and the table alone');

/* ----------------------------------------------------- 4. nobody is a lantern */

var nearest = 1e9;
CLOTH.forEach(function (c, i) {
  check(!isLanternWarm(c),
    'cloth ' + i + ' (' + hexs(c) + ') is in the lantern-glow family, which STYLE_BIBLE ' +
    'reserves for ATTENTION — a citizen wearing it competes with the lamps');
  check(c !== 0x000000, 'cloth ' + i + ' is pure black, which STYLE_BIBLE reserves for nothing');
  /* Margin, not just compliance. A colour one degree outside the band passes
   * the check above and is still a lamp to anybody looking at it. */
  var h = hueOf(c);
  var gap = h >= 20 && h <= 65 ? 0 : Math.min(Math.abs(h - 20), Math.abs(h - 65), Math.abs(h + 360 - 65));
  nearest = Math.min(nearest, gap);
});
check(nearest >= 5,
  'the closest cloth sits ' + nearest.toFixed(1) + ' degrees from the lantern band; ' +
  'the palette is meant to clear it with margin');

/* All ten distinct, or the table is shorter than it claims and two seats
 * collide sooner than the arithmetic above says. */
var uniq = {};
CLOTH.forEach(function (c) { uniq[c] = 1; });
check(Object.keys(uniq).length === CLOTH.length,
  'CLOTH has ' + Object.keys(uniq).length + ' distinct colours in ' + CLOTH.length + ' slots');
say('palette      ' + CLOTH.length + ' distinct, none lantern-warm, closest ' +
  nearest.toFixed(1) + ' degrees clear of the band');

/* ---------------------------------------------------- 5. the right part is dyed */

/*
 * `bodyPartOf` picks by triangle count rather than by material name. These
 * fixtures are the four real shapes: a big body plus one small accessory, in
 * both orders, since the GLBs disagree about which comes first (chr-citizen-
 * tall lists BrassDull before CarvedWood).
 */
function part(name, tris, indexed) {
  var g = { attributes: { position: { count: indexed ? tris * 3 * 2 : tris * 3 } } };
  if (indexed) g.index = { count: tris * 3 };
  return { name: name, geometry: g };
}

var body = part('CarvedWood', 1272, true);
var cane = part('Leather', 96, true);
check(bodyPartOf([body, cane]) === body, 'the body was not chosen when it came first');
check(bodyPartOf([cane, body]) === body, 'the body was not chosen when the accessory came first');
check(bodyPartOf([part('A', 400, false), body]) === body,
  'an unindexed part beat an indexed body — the triangle count is being read wrong');
check(bodyPartOf([body]) === body, 'a single-part figure has no body');
check(bodyPartOf([]) === null, 'an empty parts list should be null, not a crash');
check(bodyPartOf(null) === null, 'a missing parts list should be null, not a crash');
check(bodyPartOf([{ name: 'no-geometry' }]) === null,
  'a part with no geometry should be skipped, not dyed');
/*
 * THE ONE THAT MATTERS, and the first version of it did not work.
 *
 * It asserted that a body renamed away from `CarvedWood` still gets dyed —
 * which a name-matching implementation also satisfies, because with no
 * CarvedWood anywhere it falls back to size and gets the right answer for the
 * wrong reason. A mutant that switched `bodyPartOf` to match on the name sailed
 * through it.
 *
 * The fixture that actually separates the two: put the privileged name on the
 * SMALL part. Size says the body; the name says the cane. Only one of those
 * implementations dyes a coat.
 */
check(bodyPartOf([part('SomethingElse', 1272, true), part('CarvedWood', 96, true)]).name === 'SomethingElse',
  'bodyPartOf dyed the small part because it was called CarvedWood — it is matching ' +
  'on the material name, not on the size of the mesh');
check(bodyPartOf([part('CarvedWood', 96, true), part('SomethingElse', 1272, true)]).name === 'SomethingElse',
  'same, with the misleadingly-named accessory listed first');
say('body part    chosen by triangle count in both orders, name-independent, ' +
  'null-safe on empty and geometry-less parts');

/* ------------------------------------------------------------------ report */

lines.forEach(function (l) { console.log(l); });
if (failures.length) {
  console.error('\nFAILED — ' + failures.length + ' of ' + checks + ' checks:');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('\nOK — ' + checks + ' checks passed');
