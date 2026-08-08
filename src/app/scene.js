/*
 * The scene: a pure function of game state, expressed as three.js objects.
 *
 * Nothing here decides anything. `build()` creates geometry for a roster,
 * `apply(G, ev)` reads the game object and the driver's last event and pushes
 * both into materials, positions and labels. The scene never calls the engine,
 * never calls the AI, and — this is the one that would break the seed — never
 * draws from the game's random stream.
 *
 * Labels are CSS2DRenderer objects rather than sprites: they are ordinary DOM
 * nodes, so they stay crisp at any zoom, cost no texture memory, and can be
 * styled in style.css instead of being redrawn into a canvas whenever a name or
 * a vote badge changes.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const COLOR = {
  ground: 0x1b1e24,
  grid: 0x333945,
  citizen: 0x8d96a8,
  dead: 0x40444d,
  speaker: 0xffb454,
  nominee: 0x54c8ff,
  deputy: 0x6ddd8c,
  reform: 0x4a90d9,
  seize: 0xd9524a,
  /* Empty slots are dim versions of their own track colour rather than one
   * neutral grey: at a glance "dim = empty, bright = enacted" reads without
   * having to count which row is which. */
  reformEmpty: 0x22323f,
  seizeEmpty: 0x3d2622,
  chaos: 0xd9a441,
  chaosEmpty: 0x3a3428
};

/* The debug panel covers the left of the window, so the rendered image is slid
 * right by this many pixels (a projection offset, not a camera move — orbiting
 * still turns around the board). */
const PANEL_SHIFT = 175;

export class Playground {
  /**
   * @param {HTMLElement} mount    element the canvas is appended to
   * @param {HTMLElement} labelDiv element the CSS2D labels are appended to
   */
  constructor(mount, labelDiv) {
    this.mount = mount;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer({ element: labelDiv });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1014);
    this.scene.fog = new THREE.Fog(0x0e1014, 22, 46);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(0, 8.5, 13);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 40;

    this._buildStage();

    /* Everything roster-shaped lives under here so a restart can throw it all
     * away without disturbing the ground, the lights or the camera. */
    this.cast = new THREE.Group();
    this.scene.add(this.cast);
    this.citizens = [];

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  /* ------------------------------------------------------------ static set */

  _buildStage() {
    this.scene.add(new THREE.HemisphereLight(0x9fb6d6, 0x20232a, 1.0));

    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(7, 13, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshStandardMaterial({ color: COLOR.ground, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(36, 36, COLOR.grid, COLOR.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.position.y = 0.002;
    this.scene.add(grid);

    this._buildBoard();
  }

  /* The two tracks and the Chaos Track, rendered in the middle of the circle.
   * The overlay carries the same numbers in text; this is so the shape of the
   * game is readable from the scene alone. */
  _buildBoard() {
    this.board = new THREE.Group();
    this.board.position.y = 0.12;
    this.scene.add(this.board);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 2.05, 0.24, 48),
      new THREE.MeshStandardMaterial({ color: 0x272b33, roughness: 0.8 })
    );
    plinth.position.y = 0;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    this.board.add(plinth);

    const slot = (total, z, onColor, offColor) => {
      const out = [];
      const w = 0.34;
      const gap = 0.1;
      const span = total * w + (total - 1) * gap;
      for (let i = 0; i < total; i++) {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(w, 0.1, 0.44),
          new THREE.MeshStandardMaterial({ color: offColor, roughness: 0.55 })
        );
        m.position.set(-span / 2 + w / 2 + i * (w + gap), 0.16, z);
        m.castShadow = true;
        m.userData.onColor = onColor;
        m.userData.offColor = offColor;
        this.board.add(m);
        out.push(m);
      }
      return out;
    };

    this.reformSlots = slot(5, -0.62, COLOR.reform, COLOR.reformEmpty);
    this.seizeSlots = slot(6, 0.1, COLOR.seize, COLOR.seizeEmpty);

    this.chaosPips = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 16, 12),
        new THREE.MeshStandardMaterial({ color: COLOR.chaosEmpty, roughness: 0.5 })
      );
      p.position.set(-0.34 + i * 0.34, 0.21, 0.85);
      this.board.add(p);
      this.chaosPips.push(p);
    }
  }

  /* ---------------------------------------------------------------- roster */

  /** Tear down the previous roster and build one capsule per player in `G`. */
  setRoster(G) {
    for (const c of this.citizens) {
      c.group.traverse((o) => {
        if (o.isCSS2DObject && o.element && o.element.parentNode) {
          o.element.parentNode.removeChild(o.element);
        }
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.cast.clear();
    this.citizens = [];

    const n = G.players.length;
    const radius = 3.6 + n * 0.28;

    /* Re-frame for the roster size, or a ten-citizen circle runs off the
     * bottom of the window. This resets the camera on every restart, which is
     * the behaviour you want from a debug tool. */
    this.controls.target.set(0, 1, 0);
    this.camera.position.set(0, radius * 1.15 + 3.5, radius * 1.9 + 4.5);
    this.controls.update();

    for (let i = 0; i < n; i++) {
      const p = G.players[i];
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const group = new THREE.Group();
      group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      group.lookAt(0, 0, 0); // a mesh's +Z faces the lookAt target, so +Z is "front"

      /* Body and nose live in their own node so a purged citizen can topple
       * without taking the name label over with them. */
      const pose = new THREE.Group();
      group.add(pose);

      const material = new THREE.MeshStandardMaterial({
        color: COLOR.citizen, roughness: 0.65, metalness: 0.05,
        emissive: new THREE.Color(0x000000)
      });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.86, 6, 16), material);
      body.position.y = 0.85;
      body.castShadow = true;
      pose.add(body);

      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.24, 12),
        new THREE.MeshStandardMaterial({ color: 0xe8ecf4, roughness: 0.5 })
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 1.05, 0.33);
      nose.castShadow = true;
      pose.add(nose);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.52, 0.72, 40),
        new THREE.MeshBasicMaterial({
          color: COLOR.speaker, transparent: true, opacity: 0.9, side: THREE.DoubleSide
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      ring.visible = false;
      group.add(ring);

      const nameEl = document.createElement('div');
      nameEl.className = 'tag';
      nameEl.textContent = p.name;
      const nameLabel = new CSS2DObject(nameEl);
      nameLabel.position.set(0, 1.95, 0);
      group.add(nameLabel);

      const badgeEl = document.createElement('div');
      badgeEl.className = 'badge hidden';
      const badgeLabel = new CSS2DObject(badgeEl);
      badgeLabel.position.set(0, 2.35, 0);
      group.add(badgeLabel);

      this.cast.add(group);
      this.citizens.push({
        id: p.id, group, pose, body, nose, ring, material,
        nameEl, badgeEl, toppled: false
      });
    }
  }

  /* ------------------------------------------------- state -> presentation */

  /**
   * Push game state into the scene. Read-only in `G`.
   * @param {object} G   the live game object
   * @param {object|null} ev the driver event that produced this state
   */
  apply(G, ev) {
    const phase = G.phase;
    const showNominee = phase === 'vote' || phase === 'vote_result' ||
      (ev && (ev.action === 'nominate' || ev.action === 'vote'));

    for (const c of this.citizens) {
      const p = G.players[c.id];

      if (!p.alive) {
        if (!c.toppled) {
          c.pose.rotation.x = -Math.PI / 2;
          c.pose.position.y = 0.34;
          c.toppled = true;
        }
        c.material.color.setHex(COLOR.dead);
        c.material.emissive.setHex(0x000000);
        c.ring.visible = false;
        c.nameEl.classList.add('dead');
        c.badgeEl.classList.add('hidden');
        continue;
      }

      c.nameEl.classList.remove('dead');
      c.material.color.setHex(COLOR.citizen);

      let ringColor = null;
      if (c.id === G.speaker && phase !== 'game_over') ringColor = COLOR.speaker;
      if (showNominee && G.nominee === c.id) ringColor = COLOR.nominee;
      else if (G.deputy === c.id && (phase === 'legislative_speaker' ||
        phase === 'legislative_deputy' || phase === 'block_response')) ringColor = COLOR.deputy;

      if (ringColor === null) {
        c.ring.visible = false;
        c.material.emissive.setHex(0x000000);
      } else {
        c.ring.visible = true;
        c.ring.material.color.setHex(ringColor);
        c.material.emissive.setHex(ringColor);
        c.material.emissiveIntensity = 0.18;
      }

      /* Badges are per-event, not per-state: they flash for the step that
       * produced them and are cleared by the next one. */
      c.badgeEl.className = 'badge hidden';
      c.badgeEl.textContent = '';
    }

    if (ev && ev.action === 'vote' && ev.detail && ev.detail.ballots) {
      for (const b of ev.detail.ballots) {
        const c = this.citizens[b.id];
        if (!c) continue;
        c.badgeEl.textContent = b.aye ? 'AYE' : 'NAY';
        c.badgeEl.className = 'badge ' + (b.aye ? 'aye' : 'nay');
      }
    }
    if (ev && ev.action === 'power' && ev.detail && ev.detail.target != null) {
      const c = this.citizens[ev.detail.target];
      if (c) {
        c.badgeEl.textContent = (ev.detail.label || ev.detail.kind).toUpperCase();
        c.badgeEl.className = 'badge power';
      }
    }

    const paintSlots = (slots, filled) => slots.forEach((m, i) => {
      const on = i < filled;
      m.material.color.setHex(on ? m.userData.onColor : m.userData.offColor);
      m.material.emissive.setHex(on ? m.userData.onColor : 0x000000);
      m.material.emissiveIntensity = on ? 0.35 : 0;
      m.position.y = on ? 0.2 : 0.16;
    });
    paintSlots(this.reformSlots, G.reform);
    paintSlots(this.seizeSlots, G.seize);
    this.chaosPips.forEach((m, i) => {
      m.material.color.setHex(i < G.chaos ? COLOR.chaos : COLOR.chaosEmpty);
    });
  }

  /* ----------------------------------------------------------- render loop */

  resize() {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    /* Slide the image clear of the panel on wide windows; on narrow ones the
     * panel is the bigger problem and centring wins. */
    if (w > 900) this.camera.setViewOffset(w, h, -PANEL_SHIFT, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  /**
   * One frame. Called from requestAnimationFrame and from nowhere else — the
   * match loop is a separate timer, so the frame rate cannot change the game.
   * @param {number} t milliseconds since page load
   */
  render(t) {
    /* The only thing on screen that moves without a game step: a slow pulse on
     * whichever rings are lit, so it is obvious the app is alive while paused. */
    const pulse = 1 + Math.sin(t * 0.004) * 0.08;
    for (const c of this.citizens) {
      if (c.ring.visible) c.ring.scale.setScalar(pulse);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
