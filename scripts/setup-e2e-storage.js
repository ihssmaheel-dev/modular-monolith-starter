const { createRequire } = require("node:module");
const path = require("node:path");
const apiRequire = createRequire(path.resolve(__dirname, "../apps/api/package.json"));
const { S3Client, CreateBucketCommand } = apiRequire("@aws-sdk/client-s3");

async function main() {
  const client = new S3Client({
    region: "us-east-1",
    endpoint: "http://127.0.0.1:9000",
    forcePathStyle: true,
    credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
  });
  try {
    await client.send(new CreateBucketCommand({ Bucket: "uploads" }));
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error("Disposable E2E bucket initialization failed:", error);
  process.exitCode = 1;
});
