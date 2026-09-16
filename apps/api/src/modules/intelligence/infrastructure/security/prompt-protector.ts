import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { env } from "../../../../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const INVALID_CIPHERTEXT = "INVALID_CIPHERTEXT";

@Injectable()
export class IntelligencePromptProtector {
  private readonly key: Buffer;

  constructor() {
    this.key = createHash("sha256")
      .update(env.INTELLIGENCE_DATA_ENCRYPTION_KEY ?? "disabled-intelligence-key")
      .digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
  }

  decrypt(value: string): string {
    const [ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
    if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error(INVALID_CIPHERTEXT);
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivEncoded, "base64url"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
