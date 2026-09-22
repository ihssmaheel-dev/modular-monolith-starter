import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getQueryClient } from "./lib/query-client";

const NONCE_BYTES = 16;

const getSsrOptions = createIsomorphicFn().server(() => {
  const randomBytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(randomBytes);
  const nonce = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { nonce };
});

export function getRouter() {
  const queryClient = getQueryClient();

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
    defaultPreload: "intent",
    scrollRestoration: true,
    ssr: getSsrOptions(),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
