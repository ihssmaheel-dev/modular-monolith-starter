export const STORAGE_PROVIDERS = [
  "minio",
  "r2",
  "wasabi",
  "s3",
  "b2",
  "digitalocean-spaces",
  "linode",
  "vultr",
  "scaleway",
  "gcs",
  "oracle-oci",
  "ibm-cos",
  "alibaba-oss",
  "tencent-cos",
  "idrive-e2",
  "storj",
  "supabase",
  "cloudian",
  "other",
] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/**
 * Host-matching rules, checked in order. Each `test` receives the lowercased,
 * already-parsed hostname (never the raw endpoint string), so matches can't be
 * fooled by a provider name appearing in a path, query string, or unrelated
 * subdomain (e.g. "terminio.example.com" must NOT match "minio").
 *
 * Order matters: more specific / less ambiguous hosts are checked first where
 * there's any chance of overlap.
 */
const PROVIDER_HOST_RULES: Array<{
  provider: Exclude<StorageProvider, "other">;
  test: (hostname: string) => boolean;
}> = [
  {
    provider: "r2",
    test: (h) => h === "r2.cloudflarestorage.com" || h.endsWith(".r2.cloudflarestorage.com"),
  },
  {
    provider: "wasabi",
    test: (h) => h === "wasabisys.com" || h.endsWith(".wasabisys.com"),
  },
  {
    provider: "b2",
    test: (h) => h === "backblazeb2.com" || h.endsWith(".backblazeb2.com"),
  },
  {
    // DigitalOcean Spaces: <space>.<region>.digitaloceanspaces.com
    provider: "digitalocean-spaces",
    test: (h) => h === "digitaloceanspaces.com" || h.endsWith(".digitaloceanspaces.com"),
  },
  {
    // Linode/Akamai Object Storage: <bucket>.<region>.linodeobjects.com
    provider: "linode",
    test: (h) => h === "linodeobjects.com" || h.endsWith(".linodeobjects.com"),
  },
  {
    // Vultr Object Storage: <bucket>.<region>.vultrobjects.com
    provider: "vultr",
    test: (h) => h === "vultrobjects.com" || h.endsWith(".vultrobjects.com"),
  },
  {
    // Scaleway Object Storage: s3.<region>.scw.cloud
    provider: "scaleway",
    test: (h) => h === "scw.cloud" || h.endsWith(".scw.cloud"),
  },
  {
    // Google Cloud Storage S3-compatible endpoint
    provider: "gcs",
    test: (h) => h === "storage.googleapis.com" || h.endsWith(".storage.googleapis.com"),
  },
  {
    // Oracle Cloud Infrastructure Object Storage
    provider: "oracle-oci",
    test: (h) => h.endsWith(".oraclecloud.com"),
  },
  {
    // IBM Cloud Object Storage
    provider: "ibm-cos",
    test: (h) => h.endsWith(".cloud-object-storage.appdomain.cloud"),
  },
  {
    // Alibaba Cloud OSS
    provider: "alibaba-oss",
    test: (h) => h.endsWith(".aliyuncs.com"),
  },
  {
    // Tencent Cloud COS
    provider: "tencent-cos",
    test: (h) => h.endsWith(".myqcloud.com"),
  },
  {
    // IDrive e2
    provider: "idrive-e2",
    test: (h) => h.includes(".idrivee2") || /\.idrivee2-\d+\.com$/.test(h),
  },
  {
    // Storj (decentralized, S3-compatible gateway)
    provider: "storj",
    test: (h) => h === "gateway.storjshare.io" || h.endsWith(".storjshare.io"),
  },
  {
    // Supabase Storage S3-compatible endpoint
    provider: "supabase",
    test: (h) => h.endsWith(".supabase.co") || h.endsWith(".supabase.in"),
  },
  {
    // Cloudian HyperStore
    provider: "cloudian",
    test: (h) => h.includes("cloudian"),
  },
  {
    provider: "minio",
    test: (h) =>
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h === "minio" ||
      h === "minio.local" ||
      h.startsWith("minio.") ||
      h.endsWith(".minio"),
  },
];

/**
 * Safely extracts a lowercased hostname from an endpoint string, whether or
 * not it includes a protocol (e.g. both "minio:9000" and "http://minio:9000"
 * work). Returns null if the string can't be parsed as a URL at all.
 */
function extractHostname(rawEndpoint: string): string | null {
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawEndpoint);
  const candidate = hasProtocol ? rawEndpoint : `http://${rawEndpoint}`;

  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pure function to detect the active storage provider.
 *
 * Rules:
 * 1. An explicit STORAGE_PROVIDER env value always wins if it's a recognized value.
 * 2. Otherwise, parse S3_ENDPOINT into a hostname and match it against known
 *    provider domains. Matching is done on the hostname only — never on the
 *    raw string — to avoid false positives from paths, query params, or
 *    coincidental substrings.
 * 3. Any other custom endpoint, an unparsable endpoint, or an unset endpoint
 *    defaults to "s3".
 */
export function detectStorageProvider(
  explicitProvider?: string,
  endpoint?: string,
): StorageProvider {
  if (explicitProvider && (STORAGE_PROVIDERS as readonly string[]).includes(explicitProvider)) {
    return explicitProvider as StorageProvider;
  }

  const trimmed = endpoint?.trim();
  if (!trimmed) {
    return "s3";
  }

  const hostname = extractHostname(trimmed);
  if (!hostname) {
    return "s3";
  }

  for (const { provider, test } of PROVIDER_HOST_RULES) {
    if (test(hostname)) return provider;
  }

  return "s3";
}
