import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: "src",
      router: {
        routeFileIgnorePattern: "\\.test\\.[cm]?[jt]sx?$",
        semicolons: false,
        quoteStyle: "single",
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@repo/contracts": fileURLToPath(
        new URL("../../packages/contracts/src/index.ts", import.meta.url),
      ),
      "@repo/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url)),
      "@repo/authorization": fileURLToPath(
        new URL("../../packages/authorization/src/index.ts", import.meta.url),
      ),
      "@repo/api-client": fileURLToPath(
        new URL("../../packages/api-client/src/index.ts", import.meta.url),
      ),
      "@repo/ui/globals.css": fileURLToPath(
        new URL("../../packages/ui/src/styles/globals.css", import.meta.url),
      ),
      "@repo/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  server: {
    port: 5155,
  },
});
