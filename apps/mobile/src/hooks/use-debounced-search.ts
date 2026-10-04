import * as React from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Search-box state with a debounced value for server queries.
 * Mirrors the web hook of the same name: the raw `query` drives the input;
 * `debouncedQuery` (updated 300ms after the last keystroke) drives the
 * network request. Pending work cancels on unmount.
 */
export function useDebouncedSearch(initialValue = "", wait = SEARCH_DEBOUNCE_MS) {
  const [query, setQuery] = React.useState(initialValue);
  const [debouncedQuery] = useDebouncedValue(query, { wait });
  return { query, debouncedQuery, setQuery };
}
