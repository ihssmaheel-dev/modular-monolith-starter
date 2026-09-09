import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        semicolons: false,
        quoteStyle: "single",
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
  server: {
    port: 5155,
  },
});
