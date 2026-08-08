/*
 * The interaction system: one contract, one key, no per-object input code.
 *
 * An interactable is a plain object:
 *
 *   {
 *     id:            'lectern',
 *     position:      { x, y, z },              // world space, or a function
 *     radius:        2.2,                      // optional, overrides the default
 *     canInteract(ctx) -> boolean,             // is it live right now?
 *     getPrompt(ctx)   -> string,              // what the player is offered
 *     interact(ctx)    -> any                  // do it
 *   }
 *
 * `ctx` is whatever the page passes to update() — for the match page that is
 * the player-safe view model and the session's pending decision, never `G`.
 *
 * Why one contract instead of three handlers
 * ------------------------------------------
 * Three objects with three key listeners is the same amount of code on day one
 * and a different amount on day ten. Every object added afterwards has to
 * re-answer questions that are nothing to do with what it does: how close is
 * close enough, does the player have to be facing it, what happens when two are
 * in range at once, does the prompt hide while a panel is open, is E swallowed
 * or does it also walk. Answered per object, those answers drift, and the drift
 * is felt as "sometimes E doesn't work".
 *
 * So targeting, prompting and the key live here once, and an interactable
 * contributes only the three things that are genuinely its own: whether it is
 * live, what it says, and what it does. The proof that the seam is in the right
 * place is that the three objects the match page registers — one that opens
 * whichever decision panel the rules are waiting on, one that only
 * acknowledges, and one with no effect on the rules whatsoever — share every
 * line of this file and no line of each other. This file has never heard of any
 * of them, and test/interact.test.js greps it to keep that true.
 *
 * Pure: no three.js, no DOM, no clock, no randomness. That is what lets
 * test/interact.test.js drive the whole targeting rule in node.
 */

const DEFAULT_RADIUS = 2.4;

/* cos 60 degrees. The player must be facing roughly at the thing, so standing
 * with your back to a thing does not put you in a conversation with it. A
 * full hemisphere (0) makes two adjacent objects fight; a narrow cone is
 * infuriating at close range, which is exactly where you always are. */
const DEFAULT_FACING_DOT = 0.5;

/* Inside this distance, facing stops mattering — at half a metre you are
 * standing on the thing and a small turn should not drop the prompt. */
const FACING_FREE_RADIUS = 0.9;

export function createInteractions(options = {}) {
  const radius = options.radius ?? DEFAULT_RADIUS;
  const facingDot = options.facingDot ?? DEFAULT_FACING_DOT;
  const items = [];
  let current = null;
  let prompt = '';

  function positionOf(item) {
    return typeof item.position === 'function' ? item.position() : item.position;
  }

  function add(item) {
    if (!item || !item.id) throw new Error('an interactable needs an id');
    for (const fn of ['canInteract', 'getPrompt', 'interact']) {
      if (typeof item[fn] !== 'function') {
        throw new Error(`interactable "${item.id}" is missing ${fn}()`);
      }
    }
    if (items.some((i) => i.id === item.id)) {
      throw new Error(`duplicate interactable id: ${item.id}`);
    }
    items.push(item);
    return item;
  }

  /**
   * Choose what the player is offered, if anything.
   *
   * @param {{x:number,y:number,z:number}} playerPos  the character's foot
   * @param {number} facing  yaw in radians, atan2(vx, vz) — the controller's
   *                         convention, so +Z is 0 and the forward vector is
   *                         (sin, cos). Getting this wrong is the A/D bug from
   *                         Step 3 wearing a different hat, which is why
   *                         test/interact.test.js checks it against compass
   *                         directions rather than against itself.
   * @param {object} ctx     passed straight through to the interactables
   * @returns {object|null}  the targeted item
   */
  function update(playerPos, facing, ctx) {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);

    let best = null;
    let bestScore = -Infinity;

    for (const item of items) {
      if (!item.canInteract(ctx)) continue;
      const p = positionOf(item);
      const dx = p.x - playerPos.x;
      const dz = p.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      const reach = item.radius ?? radius;
      if (dist > reach) continue;

      let dot = 1;
      if (dist > FACING_FREE_RADIUS) {
        dot = (dx * fx + dz * fz) / dist;
        if (dot < (item.facingDot ?? facingDot)) continue;
      }

      /* Nearest wins, with facing as the tie-break: two things a metre apart
       * should hand over as you turn, not as you shuffle. */
      const score = -dist + dot * 0.35;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    current = best;
    prompt = best ? best.getPrompt(ctx) : '';
    return current;
  }

  /** The one key. Returns whatever the interactable returned, or null. */
  function activate(ctx) {
    if (!current) return null;
    /* Re-checked rather than trusted: update() may have run a frame ago and the
     * match moves on its own timer. */
    if (!current.canInteract(ctx)) return null;
    return current.interact(ctx);
  }

  return {
    add,
    update,
    activate,
    get items() { return items.slice(); },
    get current() { return current; },
    get prompt() { return prompt; },
    get radius() { return radius; },
    byId: (id) => items.find((i) => i.id === id) || null,
    clear() { items.length = 0; current = null; prompt = ''; }
  };
}
