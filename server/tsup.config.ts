import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Workspace source is TypeScript, so it must be bundled rather than left as an import.
  noExternal: ["@jelly/shared"],
});
