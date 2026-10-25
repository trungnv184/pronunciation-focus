import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    // Agent worktrees live under .claude/; never pick up their copies of the tests.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
