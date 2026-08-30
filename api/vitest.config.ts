import { defineConfig } from "vitest/config";

// Pins the project root to this directory. Without this, Vitest's config
// search climbs up and finds the frontend's vite.config.ts at the repo
// root -- which needs `vite` resolvable from the *root* node_modules, not
// installed in a CI job that only ran `npm ci` inside api/. Reproduced in
// CI (a fresh checkout) even though it worked locally, where the root
// node_modules happened to already exist from unrelated frontend work.
export default defineConfig({
  test: {
    root: __dirname,
  },
});
