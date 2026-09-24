import { createHash, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";

export interface IntelligenceHeaderOptions {
  secret: string;
  method: string;
  path: string;
  body: string;
  userId?: string;
  tenantId?: string;
  requestId?: string;
}

@Injectable()
export class IntelligenceHmacService {
  computeSignature(
    secret: string,
    method: string,
    path: string,
    timestamp: string,
    body: string,
    userId = "",
    tenantId = "",
    requestId = "",
  ): string {
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const canonicalPayload = `${method.toUpperCase()}:${path}:${timestamp}:${userId}:${tenantId}:${requestId}:${bodyHash}`;
    return createHmac("sha256", secret).update(canonicalPayload).digest("hex");
  }

  createAuthHeaders(options: IntelligenceHeaderOptions): Record<string, string> {
    const timestamp = (Date.now() / 1000).toFixed(4);
    const userId = options.userId ?? "";
    const tenantId = options.tenantId ?? "";
    const requestId = options.requestId ?? "";

    const signature = this.computeSignature(
      options.secret,
      options.method,
      options.path,
      timestamp,
      options.body,
      userId,
      tenantId,
      requestId,
    );

    const headers: Record<string, string> = {
      "X-Signature": signature,
      "X-Timestamp": timestamp,
    };

    if (userId) headers["X-User-Id"] = userId;
    if (tenantId) headers["X-Tenant-Id"] = tenantId;
    if (requestId) headers["X-Request-Id"] = requestId;

    return headers;
  }
}
