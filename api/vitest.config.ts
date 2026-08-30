import { defineConfig } from "vitest/config";

// Pins the project root to this directory. Without this, Vitest's config
// search climbs up and finds the frontend's vite.config.ts at the repo
// root -- which needs `vite` resolvable from the *root* node_modules, not
// installed in a CI job that only ran `npm ci` inside api/. Reproduced in
// CI (a fresh checkout) even though it worked locally, where the root
// node_modules happened to already exist from unrelated frontend work.
//
// `root` alone isn't enough, though: Vite's PostCSS resolution does its
// own independent directory climb (via postcss-load-config), separate
// from Vite's own config search, and still finds the frontend's
// postcss.config.js one level up -- which needs `tailwindcss`, also never
// installed here. Supplying an inline (empty) postcss config stops that
// file-based search from ever happening, since none of this package's
// tests touch CSS.
export default defineConfig({
  test: {
    root: __dirname,
  },
  css: {
    postcss: { plugins: [] },
  },
});
