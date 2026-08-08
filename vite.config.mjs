/*
 * Vite config.
 *
 * Named .mjs on purpose: package.json says "type": "commonjs" (the engine, the
 * test and the scripts are plain CommonJS for Node), so a bare vite.config.js
 * would be read as CommonJS and `export default` would be a syntax error.
 * The .mjs extension pins this one file to ESM without touching the rest.
 */
export default {
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'es2020'
  }
};
