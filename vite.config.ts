import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",                     // relative URLs: the built app must work from any folder (GitHub Pages subpath)
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",          // UI tests opt in with: // @vitest-environment jsdom
    testTimeout: 30_000,
    reporters: ["dot"],           // quiet output: agents' context fills with test logs otherwise
  },
});
