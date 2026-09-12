/**
 * Quarantine key convention (H09): browsers upload to a quarantine object
 * that is never served. Only the scan worker promotes approved bytes to the
 * final key via server-side copy, so a still-valid presigned upload URL can
 * never overwrite content after approval. The suffix keeps the mapping
 * derivable without an extra column; downloads always use the final key.
 */
export const QUARANTINE_KEY_SUFFIX = ".quarantine";

export function quarantineKeyFor(finalKey: string): string {
  return `${finalKey}${QUARANTINE_KEY_SUFFIX}`;
}
