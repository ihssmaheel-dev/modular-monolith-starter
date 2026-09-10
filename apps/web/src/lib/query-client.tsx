import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let client: QueryClient | null = null;

// Inactive queries are garbage-collected after 30 minutes. Server state is
// refetched on demand and invalidated by mutations, so a day-long cache only
// costs memory (acute on mobile) without buying freshness.
const GC_TIME_MS = 30 * 60 * 1000;

function makeQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        gcTime: GC_TIME_MS,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  return qc;
}

export function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!client) client = makeQueryClient();
  return client;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => getQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
