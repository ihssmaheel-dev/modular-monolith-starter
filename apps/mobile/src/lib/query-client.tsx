import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let client: QueryClient | null = null;

// Inactive queries are garbage-collected after 30 minutes. Server state is
// refetched on demand and invalidated by mutations, so a day-long cache only
// costs device memory without buying freshness.
const GC_TIME_MS = 30 * 60 * 1000;

export function getQueryClient() {
  if (!client) {
    client = new QueryClient({
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
  }
  return client;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => getQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
