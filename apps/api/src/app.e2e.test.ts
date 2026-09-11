import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cookie from "@fastify/cookie";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { API_GLOBAL_PREFIX } from "@repo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let AppModule: typeof import("./app.module.js").AppModule;
let env: typeof import("./config/env.js").env;

describe("API liveness", () => {
  let app: NestFastifyApplication;
  let pool: Pool | undefined;
  let originalTenancyMode: "single" | "multi" = "single";

  beforeAll(async () => {
    ({ AppModule } = await import("./app.module.js"));
    ({ env } = await import("./config/env.js"));
    originalTenancyMode = env.TENANCY_MODE;
    env.TENANCY_MODE = "multi";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(cookie as unknown as never, {
      secret: env.JWT_SECRET,
      hook: "onRequest",
    });
    app
      .getHttpAdapter()
      .getInstance()
      .addHook("onRequest", (request, reply, done) => {
        const requestWithCookies = request as typeof request & {
          cookies?: Record<string, string | undefined>;
        };
        const replyWithCookies = reply as typeof reply & {
          setCookie: (name: string, value: string, options: Record<string, unknown>) => void;
        };
        const cookies = requestWithCookies.cookies;
        if (!cookies?.["XSRF-TOKEN"]) {
          replyWithCookies.setCookie("XSRF-TOKEN", randomUUID(), {
            httpOnly: false,
            secure: false,
            sameSite: "strict",
            path: "/",
          });
        }
        done();
      });
    app.setGlobalPrefix(API_GLOBAL_PREFIX);
    await app.init();
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  });

  afterAll(async () => {
    if (env) env.TENANCY_MODE = originalTenancyMode;
    await pool?.end();
    await app?.close();
  });

  it("returns a liveness response without database dependencies", async () => {
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/v1/health/live",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("serves the tenancy status through REST and oRPC transports", async () => {
    const instance = app.getHttpAdapter().getInstance();
    const [rest, orpc] = await Promise.all([
      instance.inject({ method: "GET", url: "/api/v1/tenancy/status" }),
      instance.inject({ method: "GET", url: "/api/v1/rpc/tenancy/status" }),
    ]);

    expect(rest.statusCode).toBe(200);
    expect(orpc.statusCode).toBe(200);
    expect(orpc.json()).toEqual(rest.json());
  });

  it("enforces authentication on REST and oRPC resource routes", async () => {
    const instance = app.getHttpAdapter().getInstance();
    const [rest, orpc] = await Promise.all([
      instance.inject({ method: "GET", url: "/api/v1/notes" }),
      instance.inject({ method: "GET", url: "/api/v1/rpc/notes" }),
    ]);

    expect(rest.statusCode).toBe(401);
    expect(orpc.statusCode).toBe(401);
    expect(orpc.json()).toMatchObject({ defined: false, status: 401 });
  });

  it.each(protectedParityRoutes())(
    "keeps unauthenticated %s %s aligned across REST and oRPC",
    async (method, restPath, rpcPath, payload) => {
      const instance = app.getHttpAdapter().getInstance();
      const [rest, orpc] = await Promise.all([
        instance.inject({ method, url: restPath, payload }),
        instance.inject({ method, url: rpcPath, payload }),
      ]);
      expect(rest.statusCode).toBe(401);
      expect(orpc.statusCode).toBe(401);
      expect(orpc.json()).toMatchObject({ status: 401 });
    },
  );

  it("bootstraps a session from the refresh cookie after access expiry", async () => {
    const instance = app.getHttpAdapter().getInstance();
    const email = `cookie-${crypto.randomUUID()}@example.com`;
    const registration = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        name: "Cookie Owner",
        email,
        password: "Password123!",
      },
    });
    expect(registration.statusCode).toBe(201);
    expect(registration.json()).toMatchObject({ requiresEmailVerification: true });
    await pool!.query("UPDATE public.users SET email_verified_at = now() WHERE email = $1", [
      email,
    ]);
    const login = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Password123!" },
    });
    expect(login.statusCode).toBe(200);
    const setCookies = login.headers["set-cookie"];
    const cookies: string[] = Array.isArray(setCookies)
      ? setCookies
      : setCookies
        ? [setCookies]
        : [];
    const refreshCookie = cookies.find((value) => value.startsWith("refresh_token="));
    const xsrfCookie = cookies.find((value) => value.startsWith("XSRF-TOKEN="));
    if (!refreshCookie || !xsrfCookie) throw new Error("Authentication cookies were not set");
    expect(refreshCookie).toContain("Path=/api");
    const xsrf = xsrfCookie.split(";", 1)[0] ?? "";
    const refreshed = await instance.inject({
      method: "POST",
      url: "/api/v1/rpc/auth/refresh",
      headers: {
        cookie: `${refreshCookie.split(";", 1)[0]}; ${xsrf}`,
        "x-xsrf-token": xsrf.split("=", 1)[1] ?? "",
      },
      payload: {},
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).toHaveProperty("accessToken");
  });

  it("creates a multi-tenant organization through both transports", async () => {
    if (!pool) throw new Error("E2E database pool was not initialized.");
    const instance = app.getHttpAdapter().getInstance();
    const email = `organization-${crypto.randomUUID()}@example.com`;
    const registration = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Organization Owner", email, password: "Password123!" },
    });
    expect(registration.statusCode).toBe(201);
    await pool.query("UPDATE public.users SET email_verified_at = now() WHERE email = $1", [email]);
    const login = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Password123!" },
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { accessToken: string }).accessToken;
    const headers = {
      authorization: `Bearer ${token}`,
      "idempotency-key": crypto.randomUUID(),
    };
    const [rest, orpc] = await Promise.all([
      instance.inject({
        method: "POST",
        url: "/api/v1/tenancy/organizations",
        headers,
        payload: { name: "REST Organization" },
      }),
      instance.inject({
        method: "POST",
        url: "/api/v1/rpc/tenancy/organizations",
        headers: { ...headers, "idempotency-key": crypto.randomUUID() },
        payload: { name: "oRPC Organization" },
      }),
    ]);

    expect(rest.statusCode).toBe(201);
    expect(orpc.statusCode).toBe(201);
    expect(rest.json()).toMatchObject({ name: "REST Organization" });
    expect(orpc.json()).toMatchObject({ name: "oRPC Organization" });
    const memberships = await pool.query(
      "SELECT COUNT(*)::int AS count FROM public.memberships WHERE user_id = $1",
      [(registration.json() as { user: { id: string } }).user.id],
    );
    expect(Number(memberships.rows[0]?.count)).toBe(2);
  });

  it("keeps REST and oRPC validation errors semantically aligned", async () => {
    const instance = app.getHttpAdapter().getInstance();
    const payload = { email: "invalid", password: "short" };
    const [rest, orpc] = await Promise.all([
      instance.inject({ method: "POST", url: "/api/v1/auth/login", payload }),
      instance.inject({ method: "POST", url: "/api/v1/rpc/auth/login", payload }),
    ]);

    expect(rest.statusCode).toBe(400);
    expect(orpc.statusCode).toBe(400);
    const restBody = rest.json() as { code: string; i18nKey: string; fieldErrors: unknown };
    const orpcBody = orpc.json() as {
      code: string;
      i18nKey: string;
      fieldErrors: unknown;
      data: { code: string; i18nKey: string; fieldErrors: unknown };
    };
    expect(orpcBody.data).toMatchObject(restBody);
    expect(orpcBody.code).toBe(restBody.code);
    expect(orpcBody.i18nKey).toBe(restBody.i18nKey);
    expect(orpcBody.fieldErrors).toEqual(restBody.fieldErrors);
  });

  it.each(["single", "multi"] as const)(
    "registers a global user and outbox event in %s-tenant mode",
    async (mode) => {
      if (!pool) throw new Error("E2E database pool was not initialized.");
      env.TENANCY_MODE = mode;
      const email = `registration-${mode}-${crypto.randomUUID()}@example.com`;
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: "POST",
          url: "/api/v1/auth/register",
          payload: { name: `Registration ${mode}`, email, password: "Password123!" },
        });

      expect(response.statusCode).toBe(201);
      expect(response.json().user.email).toBe(email);
      expect(response.json().requiresEmailVerification).toBe(true);
      expect(response.json()).not.toHaveProperty("accessToken");
      const events = await pool.query(
        "SELECT tenant_id, payload FROM public.outbox_events WHERE topic = $1 AND payload->>'email' = $2 ORDER BY created_at DESC LIMIT 1",
        ["user.created", email],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].tenant_id).toBeNull();
      expect(events.rows[0].payload.email).toBe(email);
    },
  );

  it.each([
    ["/api/v1/auth/verify-email", { token: "0".repeat(64) }],
    ["/api/v1/rpc/auth/verifyEmail", { token: "0".repeat(64) }],
  ])("rejects unknown verification tokens on %s", async (url, payload) => {
    if (!pool) throw new Error("E2E database pool was not initialized.");
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "POST",
      url,
      payload,
    });

    expect(response.statusCode).toBe(401);
  });

  it("blocks login until the email is verified, then allows it", async () => {
    if (!pool) throw new Error("E2E database pool was not initialized.");
    const instance = app.getHttpAdapter().getInstance();
    const email = `gate-${crypto.randomUUID()}@example.com`;
    const registration = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { name: "Gate User", email, password: "Password123!" },
    });
    expect(registration.statusCode).toBe(201);

    const blocked = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Password123!" },
    });
    expect(blocked.statusCode).toBe(403);

    await pool.query("UPDATE public.users SET email_verified_at = now() WHERE email = $1", [email]);
    const allowed = await instance.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Password123!" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toHaveProperty("accessToken");
  });

  it("accepts resend requests without revealing account existence", async () => {
    const instance = app.getHttpAdapter().getInstance();
    for (const url of ["/api/v1/auth/resend-verification", "/api/v1/rpc/auth/resendVerification"]) {
      const response = await instance.inject({
        method: "POST",
        url,
        payload: { email: `nobody-${crypto.randomUUID()}@example.com` },
      });
      expect(response.statusCode).toBe(200);
    }
  });
});

function protectedParityRoutes(): Array<
  ["GET" | "POST" | "PATCH" | "DELETE", string, string, Record<string, unknown> | undefined]
> {
  return [
    ["GET", "/api/v1/notes", "/api/v1/rpc/notes", undefined],
    ["GET", "/api/v1/notes/note-1", "/api/v1/rpc/notes/note-1", undefined],
    ["POST", "/api/v1/notes", "/api/v1/rpc/notes", { title: "Title", content: "Content" }],
    ["PATCH", "/api/v1/notes/note-1", "/api/v1/rpc/notes/note-1", { title: "Updated" }],
    ["DELETE", "/api/v1/notes/note-1", "/api/v1/rpc/notes/note-1", undefined],
    ["GET", "/api/v1/users", "/api/v1/rpc/users", undefined],
    ["GET", "/api/v1/users/user-1", "/api/v1/rpc/users/user-1", undefined],
    ["PATCH", "/api/v1/users/user-1", "/api/v1/rpc/users/user-1", { name: "Updated" }],
    [
      "POST",
      "/api/v1/users",
      "/api/v1/rpc/users",
      { email: "a@b.com", name: "A", password: "Password123!" },
    ],
    ["DELETE", "/api/v1/users/user-1", "/api/v1/rpc/users/user-1", undefined],
    ["POST", "/api/v1/tenancy/organizations", "/api/v1/rpc/tenancy/organizations", { name: "Org" }],
    ["GET", "/api/v1/tenancy/organizations", "/api/v1/rpc/tenancy/organizations", undefined],
    ["GET", "/api/v1/tenancy/members", "/api/v1/rpc/tenancy/members", undefined],
    [
      "PATCH",
      "/api/v1/tenancy/members/user-1",
      "/api/v1/rpc/tenancy/members/user-1",
      { role: "member" },
    ],
    ["DELETE", "/api/v1/tenancy/members/user-1", "/api/v1/rpc/tenancy/members/user-1", undefined],
    [
      "POST",
      "/api/v1/tenancy/invitations",
      "/api/v1/rpc/tenancy/invitations",
      { email: "a@b.com", role: "member" },
    ],
    ["GET", "/api/v1/tenancy/invitations", "/api/v1/rpc/tenancy/invitations", undefined],
    [
      "POST",
      "/api/v1/tenancy/invitations/accept",
      "/api/v1/rpc/tenancy/invitations/accept",
      { token: "token" },
    ],
    ["GET", "/api/v1/files", "/api/v1/rpc/files", undefined],
    [
      "POST",
      "/api/v1/files/upload-url",
      "/api/v1/rpc/files/upload-url",
      { fileName: "a.txt", contentType: "text/plain", fileSize: 1, parentType: "general" },
    ],
    ["POST", "/api/v1/files/confirm", "/api/v1/rpc/files/confirm", { fileKey: "uploads/key" }],
    ["GET", "/api/v1/files/file-1", "/api/v1/rpc/files/file-1", undefined],
    [
      "GET",
      "/api/v1/files/file-1/download-url",
      "/api/v1/rpc/files/file-1/download-url",
      undefined,
    ],
    ["DELETE", "/api/v1/files/file-1", "/api/v1/rpc/files/file-1", undefined],
    ["GET", "/api/v1/auth/me", "/api/v1/rpc/auth/me", undefined],
    ["POST", "/api/v1/auth/logout", "/api/v1/rpc/auth/logout", undefined],
  ];
}
