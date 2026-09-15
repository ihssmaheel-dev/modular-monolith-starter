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
    },
  },
  server: {
    port: 5155,
  },
});
