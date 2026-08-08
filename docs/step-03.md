# Step 03 — a body you can steer: kinematic capsule + follow camera

A second entry point, `walk.html`, on a purpose-built obstacle course. Still a
capsule — no mesh, no rig, no animation — because this step is about one thing
only: **how it feels to move, and whether that feeling is the same on every
machine.**

```
npm run dev             # http://localhost:5173/walk.html
npm run test:controller # the controller's own node tests
npm test                # the engine suite, untouched
```

The bot playground at `index.html` is unchanged. The only edit outside
`src/walk/` is `vite.config.mjs`, which now names both HTML files as build
inputs — Vite only walks the entries it is told about, so without it the
workbench would work in dev and silently vanish from a production build.

## Why kinematic, not physics-driven

A rigid body in a physics engine is *simulated*: you apply forces and the
solver decides where the body ends up. A kinematic controller is *scripted*:
you decide where the body should be and use the collision geometry only to
answer "can I be there". The brief for this game is "controlled physicality,
not realistic physics", and the difference is not a matter of taste:

- **Feel is a number, not an emergent property.** "Walk speed 3.5 m/s, stop in
  0.15 s" is directly settable in a kinematic controller. Under a physics
  solver it is friction, mass, a drag coefficient and a max-force clamp
  interacting, and every one of them shifts when any other changes. You cannot
  hand a slider labelled "stop time" to somebody if the slider does not
  actually control stop time.
- **A social-deduction game must not have slapstick.** Rigid bodies get
  shoved, tip over, slide down slopes with momentum, and vibrate in corners.
  None of that is desirable when the player's job is to watch faces and read
  the room.
- **Determinism.** A scripted input list has to replay identically, in node
  and in the browser, this week and next. Most physics solvers are iterative
  and order-dependent, and several are not deterministic across platforms at
  all. The whole review method for this step — drive `window.__walk` and check
  the numbers — depends on that not being true here.
- **The step already has a hard physics dependency it does not want.** A solver
  is ~1 MB of code deciding things that must not be decided by anything except
  `src/walk/controller.js`.

What is used instead is a *query* structure: `three-mesh-bvh`. It answers
questions about geometry; it moves nothing and decides nothing.

The cost of the choice is honest: everything that a solver would give for free
— pushing objects, being pushed, ragdolls, anything dynamic — has to be built
by hand if it is ever wanted. Nothing in the game's design asks for it.

## The two clocks, and why the sim has its own

```
render loop   requestAnimationFrame     display refresh (60, 120, 144, throttled…)
sim           fixed 1/60 accumulator    always 1/60, whatever the display does
```

`controller.advance(dt, input, world)` adds real frame time to an accumulator
and runs whole fixed steps out of it:

```js
accumulator += dt;
while (accumulator >= fixedDt && n < maxSubsteps) {
  step(fixedDt, input);
  accumulator -= fixedDt;
  n++;
}
if (accumulator >= fixedDt) accumulator = 0;   // a stall, not a slow frame
```

If movement integrated raw frame time instead, the frame rate would become an
input to the game. Concretely, and none of these are hypothetical:

- Collision resolution is iterative and per-step. A 144 Hz machine resolves
  contacts 2.4× more often than a 60 Hz one, so a capsule pressed into a corner
  settles to a different place.
- Step-up, ground snap and slope handling all trigger on per-step distances. At
  a low frame rate a single step's displacement can exceed the step height and
  the character clips a stair it would have climbed at 144 Hz.
- Gravity under plain Euler accumulates error proportional to dt, so a jump-off
  distance differs by frame rate even with no collision involved at all.

The last line of the loop matters as much as the loop. A frame long enough to
need more than `maxSubsteps` is a stall — the tab was backgrounded, or the GPU
hiccupped. Trying to catch up produces a spiral where each catch-up frame is
longer than the last. Dropping the remainder loses a moment of simulated time,
which is the cheaper failure.

Left over in the accumulator is the gap between the last simulated step and
what the display wants to show, exposed as `alpha()`. `main.js` interpolates
between the previous and current positions with it, so a 144 Hz display looks
smooth even though the body only moves 60 times a second.

The unit test compares a scripted 4 s of input at dt = 1/30 against dt = 1/120:
**0.0000 mm apart, and the same substep count.** Both are exact multiples of
1/60, so the accumulator makes them bit-identical — which is the point, but it
is also a test that would pass if the accumulator were the *only* thing that
worked. So two more comparisons run beside it: 1/45 vs 1/144, where the
accumulator phase differs and the honest tolerance is one substep of travel
(measured 46.7 mm against a 58.3 mm bound), and `step()` called 240 times
directly with no accumulator at all, which reproduces `advance(1/30)` × 120 to
0.0000 mm. The same 1/30-vs-1/144 comparison over the real course geometry in
the browser came out 58.3 mm apart — again exactly one substep of travel.

## Integrating the response exactly

Every smoothing in the controller is an exponential approach, and every time
constant is stated as *time to cover 95% of the gap*:

```js
const tau = accelTime / Math.log(20);       // ln(20) -> 95%
const blend = 1 - Math.exp(-h / tau);
```

So `accelTime: 0.25` means literally "0.25 s to reach 95% of walk speed", and
the test measures exactly that (observed: 250.0 ms, at a 16.7 ms measurement
resolution).

The displacement over a step is *not* `newVelocity * h`. It is the closed-form
integral of the exponential:

```js
disp = target * h + (v - target) * tau * blend;
```

This looks fussy and buys something specific. Summed over a deceleration, that
expression totals exactly `v0 * tau` — the same distance the continuous
solution covers, at any `h`. Plain Euler with the post-step velocity undershoots
it by about 16% at 60 Hz and by a different amount at every other rate, so
"stop in 0.15 s" would be a claim about the integrator rather than about metres
of floor. Measured stop distance: **0.1744 m against a predicted 0.1752 m.**

Gravity gets the same treatment with a trapezoid, which is exact for a constant
acceleration. Free fall from 5 m took 0.6833 s against the textbook
`sqrt(2h/g)` = 0.6742 s; the 9 ms gap is the substep at which "grounded" is
noticed, not integration error.

Air control lengthens the time constant rather than scaling the blend, so the
response stays a true exponential in the air and the closed form above stays
valid there too.

## Collision: capsule, slide, and the two things that are not obvious

The controller asks the world exactly two questions, both injected:

```
world.deepestContact(ax,ay,az, bx,by,bz, radius, out) -> boolean
world.raycastDown(x, y, z, maxDist, out)              -> boolean
```

`src/walk/bvh-world.js` answers them against a merged triangle mesh through
three-mesh-bvh; `test/controller.test.js` answers them with closed-form maths
over half-spaces and axis-aligned boxes. The controller cannot tell them apart.
That is the whole reason a node assertion says anything about the browser, and
it is worth defending in review: the moment collision logic starts living in
the three.js layer, the node tests stop testing the thing that ships.

**Resolution is deepest-contact-first, then re-query.** Resolving every contact
in one batch over-pushes in a corner — both walls move you the full depth, so
you pop out diagonally and get shoved back next frame, which is precisely the
jitter the 1.2 m passage exists to catch. One at a time converges, because each
push is measured against the position the previous push produced. Measured:
walking the passage pressed into the east wall, x sat at 0.249900 with a
**0.0000 mm spread** across the run, and wedging into the free-standing right
angle settled at exactly (6.35, 3.50) with speed 0.

**Velocity is projected on the horizontal wall plane, not the full plane.** For
a vertical wall these are the same thing. For a 35° face they are not:
projecting the full 3-vector turns a forward push into an upward one, and the
capsule strolls up a slope it was supposed to be refused by. Horizontal
projection removes the into-wall component and nothing else — so the tangential
component is untouched. Test: input at 45° into a wall settles at velocity
(0.000000, 0, 2.474874), against a target tangential of 3.5 / √2 = 2.474874,
and it does not decay over another 2 s of pressing.

### The 35° ramp: push out sideways, never along the normal

The single line that makes a slope unclimbable:

```js
// contact normal is steeper than maxSlope -> it is a wall, not ground
const hl = Math.hypot(contact.nx, contact.nz);
p.x += (contact.nx / hl) * (depth / hl);
p.z += (contact.nz / hl) * (depth / hl);
// p.y is not touched
```

Pushing out along the normal would raise the capsule by `depth·cos θ` every time
it walked into the slope. That is not being blocked; it is a very slow
staircase, and it is the classic way a "too steep" rule turns out not to hold
after ten seconds of walking. A horizontal push removes exactly the same
overlap with zero height gain, so walking uphill into a steep face makes no
progress at all — the forward move and the push-out cancel to the metre.

The same geometry makes the *downhill* slide correct for free: descending by δ
creates a penetration of `δ·cos θ`, which the horizontal push-out converts into
`δ·cos θ / sin θ = δ / tan θ` of downhill travel — exactly following the
surface. The only thing added is a cap on the fall speed while touching a steep
face (`slideFallSpeed`, 4 m/s), so a slide stays a slide instead of accelerating
without limit.

Measured: standing on a 35° plane and holding uphill input for 2 s moved the
capsule 11.95 m *downhill* and its peak height never exceeded its starting
height. Walking into the foot of the course's 35° ramp from flat ground stalls
at x = 1.889 — which is where a 0.35 m capsule is tangent to that plane, to
three decimals — with y pinned at 0.000000.

### Steps: probe ahead, not underneath

This is the part that does not work the way the textbook says, and it took
being wrong first to find out.

The textbook step-up is: notice the move was blocked, lift the capsule by
`stepHeight`, redo the move, drop a ray from the new centre, accept if it lands
on something walkable no higher than `stepHeight`.

It fails on the exact case it exists for. A 1.7 m / 0.35 m capsule walking at a
0.17 m step is stopped **0.30 m before the step**, because its bottom sphere
fouls the step's top edge: the closest point is at (edge, 0.17), the sphere
centre is at 0.35, and contact begins at `sqrt(0.35² − 0.18²) = 0.30`. The
normal at that contact points 59° off vertical — not walkable, correctly a
wall. Lift the capsule and move it one substep (5.8 cm) forward and its axis is
still 0.24 m short of the step, so a ray straight down finds the floor again,
the "step" is rejected, and the capsule stands there for ever. Traced, not
guessed: the first version of this code walked the character into a stair and
stopped.

What works is probing a whole radius **ahead** of the axis, along the movement
direction, from `stepHeight` above the foot and reaching down exactly that far.
By construction the ray can only find surfaces that are legal to step onto —
anything lower is out of reach, anything higher is above the origin — so the
height gate is the geometry rather than a comparison. The 35° ramp still fails
the same probe, because the ray hits it with a 0.819 normal against a
cos 30° = 0.866 threshold.

Two further details, both learned by watching a trace:

- **A step is attempted on first contact, not once the move is badly blocked.**
  The substep in which the bottom sphere first grazes the edge is barely slowed
  — but it is the substep whose wall normal projects the forward velocity to
  nothing. Noticing one substep later cost the entire approach speed on every
  stair and the character re-accelerated for 0.17 s after each one. The test
  now watches the minimum speed across the climb (3.4472 m/s of 3.5) so that
  cannot come back quietly.
- **The ground snap is suppressed while a ledge is under the toes.** After a
  step-up the axis has not caught up with the ledge, so the downward ray still
  sees the lower floor and would undo the step immediately — a perfect
  oscillation, one step up and one step down per substep, for ever.

The result climbs the three 0.17 m risers to y = 0.510 without losing speed, and
refuses the 0.40 m block, stopping at x = 1.6499 where 2.00 − 0.35 says it
should.

### One more that is easy to get wrong: the foot on a slope

`position` is the foot — the axis point one radius below the lower sphere's
centre. That is the surface height *only on level ground*. On a slope the sphere
touches off to one side, and the axis floats `radius·(1/nᵧ − 1)` above whatever
is directly underneath: 1.3 cm on a 15° ramp. Snapping the foot to the raw
height under the axis buries the capsule by that much every substep, and the
push-out then costs it about 5% of its speed for no visible reason. The first
version did exactly that and the 15° ramp measured 3.313 m/s instead of 3.5.
With the offset applied, 2 s of uphill input covers **7.0000 m** horizontally —
3.5 m/s exactly — rising at precisely tan 15°.

## The camera

`src/walk/camera.js`. Two smoothers, deliberately separate:

- **follow** (0.12 s) — where the boom is anchored; how hard the camera chases.
- **aim** (0.08 s) — where it looks; how hard the view chases.

They are different feelings. A slow follow with a fast aim pins the character in
frame while the world swings; a fast follow with a slow aim glides. The usual
shortcut of one smoothing constant removes the only dial that separates "heavy"
from "floaty", so both are on the overlay.

Rotation smoothing is applied to the *point being looked at*, not to the
camera's quaternion. Smoothing a quaternion drifts off the subject during a fast
orbit; smoothing the target cannot.

Orbit is **drag-to-look with no pointer lock**, and that is a decision, not an
omission. The page is a tuning instrument with sixteen sliders on it; pointer
lock would mean releasing and re-acquiring the pointer for every adjustment.
The game will want pointer lock. The workbench does not.

The camera pulls in when something would come between it and the character: a
ray from the boom anchor along the boom, and the camera sits at the hit minus
0.20 m of padding. No shake, no bob, no FOV kick, no motion blur — this step is
for reading the movement honestly, and every one of those makes it harder.

## Tuning values as shipped

Movement (`defaultTuning()` in `src/walk/controller.js`):

| value | shipped | what it does, in plain language |
| --- | --- | --- |
| `height` | 1.70 m | how tall the body is, foot to crown |
| `radius` | 0.35 m | how fat it is; also how close it can get to a wall |
| `walkSpeed` | 3.5 m/s | flat-ground top speed, and the speed up any walkable slope |
| `accelTime` | 0.25 s | how long from standing still to 95% of that speed |
| `stopTime` | 0.15 s | how long from full speed down to 5% of it. Distance covered while stopping is `walkSpeed × stopTime / 3` ≈ 0.18 m |
| `turnTime` | 0.20 s | how long the body takes to finish 95% of a turn towards where it is going |
| `airControl` | 0.35 | how much steering survives while falling. 1 is full control in mid-air, 0 is none |
| `restSpeed` | 0.02 m/s | below this a stopping body is parked at zero, so it does not creep |
| `gravity` | 22.0 m/s² | more than twice earth, on purpose: falls read as decisive rather than floaty. Lower it for a lighter, more cartoonish drop |
| `maxFallSpeed` | 28 m/s | terminal velocity |
| `slideFallSpeed` | 4.0 m/s | speed cap while sliding down a too-steep face, so a slide stays a slide |
| `maxSlopeDeg` | 30° | steeper than this is not ground. Sits between the course's 15° and 35° ramps on purpose. Raise it and the 35° ramp becomes climbable |
| `stepHeight` | 0.25 m | the tallest ledge walked up instead of walked into. The course's steps rise 0.17 m and its blocker is 0.40 m, so this number is what separates them |
| `toeReach` | 0.06 m | how far past its own radius the foot looks ahead for a ledge. Must stay above the distance at which the bottom sphere fouls a step edge |
| `snapDistance` | 0.30 m | how far down the feet reach to stay glued to ground when walking downhill or down steps. Too small and you go briefly airborne on every stair; too large and you get sucked to floors you meant to step off |
| `resolveIterations` | 6 | how many times per move the capsule is pushed out of things. More is safer in tight geometry and costs queries |

Camera (`defaultCameraTuning()` in `src/walk/camera.js`):

| value | shipped | what it does |
| --- | --- | --- |
| `distance` | 3.5 m | how far behind |
| `height` | 1.8 m | how high above the feet the boom is anchored |
| `pivotHeight` | 1.2 m | how far up the body it aims. The downward tilt you see is this, not a baked-in angle |
| `followTime` | 0.12 s | position smoothing |
| `aimTime` | 0.08 s | rotation smoothing |
| `fov` | 60° | field of view |
| `minPitch` / `maxPitch` | −60° / 35° | how far down and up the orbit goes |
| `orbitSpeed` | 0.28 °/px | drag sensitivity |
| `collisionPad` | 0.20 m | how far the camera keeps off a surface it would otherwise enter |

Presentation-only, in `main.js`: the drawn height chases the simulated height
with a 0.07 s constant. A step-up is a genuine discontinuity in the sim and
should stay one; only the picture is filtered, and `__walk.state()` always
reports the true value.

## The course

`src/walk/course.js`. Every piece is declared once and builds both the visible
mesh and the merged collider, so the two cannot drift apart. Spawn is the
origin, facing +Z; +X is east.

| piece | where | what it tests |
| --- | --- | --- |
| corridor | +Z from z = 4, 1.20 m clear, right-angle turn at z = 12 | no jitter in a narrow passage; slide round both corners |
| free-standing corner | x 3–7 / z 3–7 | the same slide with only two walls |
| steps | −X, three 0.17 m risers on 0.40 m treads, landing at 0.51 m | climbing without losing speed; snapping back down |
| low obstacle | z = −3, 0.40 m tall | must block, not be climbed |
| 15° ramp | x 3.0 → 8.6 at z = −4, rising 1.50 m | walkable at full speed |
| platform | x 8.6 → 13.0, top 1.50 m | three open edges to walk off |
| 35° ramp | x 2.0 → 5.0 at z = −10, rising 2.10 m | refused; slides back down |

The ramps are derived from angle and horizontal run rather than positioned by
eye — there is exactly one box centre that puts the low corner of the top face
on y = 0, so it is computed. A ramp placed by eye is either floating or buried,
and a buried ramp starts with an unwalkable lip, which would quietly invalidate
any "ramps work" claim made against it.

## Driving it from the console

`window.__walk`:

| call | what it does |
| --- | --- |
| `teleport(x, y, z)` | place the body at rest there |
| `setInput(x, z)` | hold a world-space unit input vector |
| `tick(dt, n)` | advance n frames of dt seconds, now, with no wall clock |
| `state()` | position, velocity, speed, facing, grounded, slope, air time |
| `resume()` | hand control back to the keyboard and the clock |
| `run(mark, seconds)` | teleport to a named mark, settle, walk its direction, report |
| `marks`, `facts` | the named spots and the course's derived numbers |
| `tuning`, `camera` | the live tuning objects the sim reads |

`teleport` and `setInput` park the live loop. Without that, the render loop
would keep feeding real frame time into the sim during a scripted run and the
answer would depend on how long the reviewer took to type the next line.
`teleport` also clears the scripted input, so one scenario cannot leak into the
next — an early version did not, and every measurement after the first carried
the previous scenario's direction for half a second.

The input is world-space and camera-independent on purpose: a scripted scenario
must not change meaning because the camera happens to be pointing elsewhere.

## What was verified, and how

Node v20.19.4, macOS. Browser checks were run against `npm run dev` in a real
Chromium tab, driving `window.__walk` and reading the results back.

**The engine is untouched.**

```
$ npm test
OK — 28881 assertions passed.       wins { loyalist: 29, rebel: 21 }
$ node scripts/driver-parity.js
PARITY OK — driver.js reproduces the self-test baseline exactly.
```

**The playground is untouched.** Seed 1000 at seven citizens, run to the end in
the browser: 73 steps, LOYALIST win on the fifth Reform, a 31 365-character
event log. All three numbers are the ones recorded in `docs/step-02.md`.

**The controller's own suite.** `npm run test:controller` → *OK — 50 checks
passed*, with the measured values printed rather than merely asserted.

**No randomness in the movement layer.**
`grep -rn "rng(\|Math.random" src/walk/ walk.html` returns nothing, including
out of comments.

**Scripted scenarios in the browser**, each run through `__walk.run(mark, s)`:

| scenario | observed | expected |
| --- | --- | --- |
| head-on into a wall | stopped at z = 11.650 | 12.00 − 0.35 |
| diagonal into a wall | slid east, speed 3.495 | tangential preserved |
| into a right-angle corner | settled (6.35, 3.50), speed 0 | 6.70 − 0.35, 3.15 + 0.35 |
| 15° ramp | y = 1.501 at x = 9.005, speed 3.5 | climbs at full speed |
| 35° ramp from flat | stalled x = 1.889, y = 0.000000 | tangent point, no climb |
| dropped on the 35° face | slid back to the foot | slides, does not stick |
| three steps | y = 0.510, speed 3.5 | climbs, keeps momentum |
| 0.40 m block | stopped at z = −2.400 | −2.75 + 0.35 |
| off the platform | fell 1.50 m, landed at y = 0.000, vertical 0 | no bounce |
| 1.2 m passage, pressed east | x = 0.249900, spread 0.0000 mm | no jitter |
| 1/30 vs 1/144 over the course | 58.3 mm apart | one substep of travel |

**Seen on screen, not inferred:** the capsule standing on the step landing at
y = 0.51 with the overlay reading grounded / 3.50 m/s; mid-fall off the platform
with grounded "no", vertical −4.03 m/s, airborne 0.20 s and the ground ring
hidden; on the 15° ramp with slope reading 15.0° and speed 3.40 m/s. Live
keyboard input moves the body and steers it up the ramp onto the platform;
mode flips from `scripted` to `live` on the first key. The console carries no
errors.

## Open gaps, stated plainly

- **The feel has not been judged by a human.** Every number above is a
  measurement, and a measurement cannot tell you whether 0.25 s of acceleration
  feels right. That is the point of the sliders and it is the next thing that
  has to happen.
- **Only one browser, one machine, one display.** Everything was run in a
  Chromium tab on this Mac. Frame-rate independence is *argued* by construction
  and *tested* by driving different dt values through the same code — it has
  not been observed on a genuinely different refresh rate or a slow GPU.
- **Camera collision has not been stress-tested.** The pull-back was written
  and reasoned about; the course's only place to actually trap it is the 1.2 m
  passage, and that was checked by walking through, not by a systematic sweep.
- **The 0.17 m step is a single-substep pop in the sim.** It is filtered for
  display and the numbers are correct either way, but if it reads as a jolt on
  a real screen the fix is a rate-limited lift in the controller, not a longer
  display filter.
- **`maxSlopeDeg` at 30° is chosen to straddle the course's two ramps, not
  because 30° is right.** Nobody has decided what the town square's steepest
  walkable surface should be.

## Notes for later steps

- The controller's collision interface is two functions. Keep it that way. The
  moment a query starts taking a `THREE.Mesh`, the node tests stop testing what
  ships.
- `position` is the foot, and on a slope the foot is not the surface height.
  Anything that places an object relative to the character — a footstep effect,
  an interaction volume, an animation root — needs the same
  `radius·(1/nᵧ − 1)` offset or it will float on ramps.
- There is no jump and no sprint, by design. Both would change the ground/air
  handling substantially; neither should be added without revisiting
  `airControl` and `snapDistance`.
- When a character mesh arrives it goes under `avatar` in `main.js` and reads
  `controller.state.facing`. Nothing else should need to change — that is what
  the nose cube is standing in for.
- The workbench is a tool, not a screen of the game. It should keep existing
  after the town square does, because the moment movement is tuned in the real
  level nobody can tell whether a change was the tuning or the geometry.
