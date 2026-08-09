/*
 * Vite config.
 *
 * Named .mjs on purpose: package.json says "type": "commonjs" (the engine, the
 * test and the scripts are plain CommonJS for Node), so a bare vite.config.js
 * would be read as CommonJS and `export default` would be a syntax error.
 * The .mjs extension pins this one file to ESM without touching the rest.
 */
import { resolve } from 'node:path';

const here = new URL('.', import.meta.url).pathname;

export default {
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'es2020',
    /*
     * Four entry points, four separate instruments.
     *
     *   index.html      the bot playground — the engine's window
     *   walk.html       the movement workbench — the character controller's window
     *   play.html       the square — the first human-playable match
     *   asset-lab.html  the art review instrument — fixed cameras and moods
     *
     * Vite only walks the HTML files it is told about, so without this a page
     * would work in dev (where every file is served on demand) and silently
     * vanish from a production build. The playground and the workbench share no
     * code beyond three; play.html is the first page that pulls both the engine
     * and the controller in, which is exactly what Step 4 is; asset-lab.html
     * pulls in neither, on purpose (Gate 2 — see docs/BLENDER_PIPELINE.md).
     */
    rollupOptions: {
      input: {
        playground: resolve(here, 'index.html'),
        walk: resolve(here, 'walk.html'),
        play: resolve(here, 'play.html'),
        lab: resolve(here, 'asset-lab.html')
      }
    }
  }
};
