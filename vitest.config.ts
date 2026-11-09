import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: [
            "node_modules/**",
            "**/*.test.tsx",
            "**/renderReactFlowToPng.test.ts",
            "**/observability.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "**/*.test.tsx",
            "**/renderReactFlowToPng.test.ts",
            "**/observability.test.ts",
          ],
          exclude: ["node_modules/**"],
        },
      },
    ],
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    testTimeout: 30_000,
    typecheck: {
      tsconfig: "./tsconfig.vitest.json",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/serverOnlyMock.ts"),
    },
  },
});
