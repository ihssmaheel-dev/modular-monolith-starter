import { describe, it, expect } from "vitest";
import { detectStorageProvider } from "./storage-provider.detector";

describe("detectStorageProvider", () => {
  it("uses explicit provider when specified and valid", () => {
    expect(detectStorageProvider("r2", "http://localhost:9000")).toBe("r2");
    expect(detectStorageProvider("wasabi", "https://s3.amazonaws.com")).toBe("wasabi");
    expect(detectStorageProvider("minio", "https://custom-s3.example.com")).toBe("minio");
    expect(detectStorageProvider("s3", "http://localhost:9000")).toBe("s3");
    expect(detectStorageProvider("b2", undefined)).toBe("b2");
    expect(detectStorageProvider("digitalocean-spaces", undefined)).toBe("digitalocean-spaces");
    expect(detectStorageProvider("linode", undefined)).toBe("linode");
    expect(detectStorageProvider("vultr", undefined)).toBe("vultr");
    expect(detectStorageProvider("scaleway", undefined)).toBe("scaleway");
    expect(detectStorageProvider("gcs", undefined)).toBe("gcs");
    expect(detectStorageProvider("oracle-oci", undefined)).toBe("oracle-oci");
    expect(detectStorageProvider("ibm-cos", undefined)).toBe("ibm-cos");
    expect(detectStorageProvider("alibaba-oss", undefined)).toBe("alibaba-oss");
    expect(detectStorageProvider("tencent-cos", undefined)).toBe("tencent-cos");
    expect(detectStorageProvider("idrive-e2", undefined)).toBe("idrive-e2");
    expect(detectStorageProvider("storj", undefined)).toBe("storj");
    expect(detectStorageProvider("supabase", undefined)).toBe("supabase");
    expect(detectStorageProvider("cloudian", undefined)).toBe("cloudian");
    expect(detectStorageProvider("other", undefined)).toBe("other");
  });

  it("detects Cloudflare R2 from endpoint", () => {
    expect(
      detectStorageProvider(undefined, "https://abc12345.r2.cloudflarestorage.com/uploads"),
    ).toBe("r2");
  });

  it("detects Wasabi from endpoint", () => {
    expect(detectStorageProvider(undefined, "https://s3.us-east-1.wasabisys.com")).toBe("wasabi");
    expect(detectStorageProvider(undefined, "https://s3.eu-central-1.wasabisys.com")).toBe(
      "wasabi",
    );
  });

  it("detects Backblaze B2 from endpoint", () => {
    expect(detectStorageProvider(undefined, "https://s3.us-west-000.backblazeb2.com")).toBe("b2");
  });

  it("detects DigitalOcean Spaces", () => {
    expect(detectStorageProvider(undefined, "https://my-space.nyc3.digitaloceanspaces.com")).toBe(
      "digitalocean-spaces",
    );
  });

  it("detects Linode Object Storage", () => {
    expect(detectStorageProvider(undefined, "https://my-bucket.us-east-1.linodeobjects.com")).toBe(
      "linode",
    );
  });

  it("detects Vultr Object Storage", () => {
    expect(detectStorageProvider(undefined, "https://my-bucket.ewr1.vultrobjects.com")).toBe(
      "vultr",
    );
  });

  it("detects Scaleway Object Storage", () => {
    expect(detectStorageProvider(undefined, "https://s3.fr-par.scw.cloud")).toBe("scaleway");
  });

  it("detects Google Cloud Storage (S3-compatible endpoint)", () => {
    expect(detectStorageProvider(undefined, "https://storage.googleapis.com")).toBe("gcs");
    expect(detectStorageProvider(undefined, "https://my-bucket.storage.googleapis.com")).toBe(
      "gcs",
    );
  });

  it("detects Oracle Cloud Infrastructure Object Storage", () => {
    expect(
      detectStorageProvider(
        undefined,
        "https://namespace.compat.objectstorage.us-ashburn-1.oraclecloud.com",
      ),
    ).toBe("oracle-oci");
  });

  it("detects IBM Cloud Object Storage", () => {
    expect(
      detectStorageProvider(undefined, "https://s3.us-south.cloud-object-storage.appdomain.cloud"),
    ).toBe("ibm-cos");
  });

  it("detects Alibaba Cloud OSS", () => {
    expect(detectStorageProvider(undefined, "https://my-bucket.oss-cn-hangzhou.aliyuncs.com")).toBe(
      "alibaba-oss",
    );
  });

  it("detects Tencent Cloud COS", () => {
    expect(
      detectStorageProvider(undefined, "https://my-bucket.cos.ap-guangzhou.myqcloud.com"),
    ).toBe("tencent-cos");
  });

  it("detects IDrive e2", () => {
    expect(detectStorageProvider(undefined, "https://my-bucket.abc1.idrivee2-12.com")).toBe(
      "idrive-e2",
    );
  });

  it("detects Storj", () => {
    expect(detectStorageProvider(undefined, "https://gateway.storjshare.io")).toBe("storj");
  });

  it("detects Supabase Storage", () => {
    expect(detectStorageProvider(undefined, "https://xyzcompany.supabase.co/storage/v1/s3")).toBe(
      "supabase",
    );
  });

  it("detects Cloudian HyperStore", () => {
    expect(detectStorageProvider(undefined, "https://s3.cloudian.example.com")).toBe("cloudian");
  });

  it("detects MinIO from local or named host endpoints", () => {
    expect(detectStorageProvider(undefined, "http://localhost:9000")).toBe("minio");
    expect(detectStorageProvider(undefined, "http://127.0.0.1:9000")).toBe("minio");
    expect(detectStorageProvider(undefined, "http://minio:9000")).toBe("minio");
    expect(detectStorageProvider(undefined, "minio:9000")).toBe("minio");
    expect(detectStorageProvider(undefined, "https://minio.internal.mycorp.com")).toBe("minio");
  });

  it("defaults to s3 when endpoint is unset or standard AWS", () => {
    expect(detectStorageProvider(undefined, undefined)).toBe("s3");
    expect(detectStorageProvider(undefined, "")).toBe("s3");
    expect(detectStorageProvider(undefined, "   ")).toBe("s3");
    expect(detectStorageProvider(undefined, "https://s3.us-east-1.amazonaws.com")).toBe("s3");
  });

  it("still defaults unrecognized custom endpoints to s3", () => {
    expect(detectStorageProvider(undefined, "https://my-private-ceph-cluster.internal")).toBe("s3");
  });

  it("does not confuse similarly-named hosts across providers", () => {
    // must not match Linode just because "objects" appears, or minio in unrelated host
    expect(detectStorageProvider(undefined, "https://myobjects.example.com")).toBe("s3");
    expect(detectStorageProvider(undefined, "https://terminio.example.com")).toBe("s3");
  });
});
