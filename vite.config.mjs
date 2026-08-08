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
     * Two entry points, two separate apps.
     *
     *   index.html  the bot playground — the engine's window
     *   walk.html   the movement workbench — the character controller's window
     *
     * Vite only walks the HTML files it is told about, so without this the
     * workbench would work in dev (where every file is served on demand) and
     * silently vanish from a production build. They share no code beyond three,
     * and keeping them as separate inputs keeps it that way.
     */
    rollupOptions: {
      input: {
        playground: resolve(here, 'index.html'),
        walk: resolve(here, 'walk.html')
      }
    }
  }
};
