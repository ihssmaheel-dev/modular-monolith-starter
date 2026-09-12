import "reflect-metadata";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { organizationsContract } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { TenancyStatusController } from "../../modules/tenancy/presentation/controllers/tenancy-status.controller";
import { TenancyStatusOrpcController } from "../../modules/tenancy/presentation/orpc/tenancy-status.orpc.controller";
import { RESPONSE_SCHEMA_KEY } from "../../common/decorators/response-schema.decorator";

describe("oRPC tenancy status parity", () => {
  it("maps the public status procedure to both transports", () => {
    const contractRoute = organizationsContract.status["~orpc"].route;
    expect(routePath(TenancyStatusController, "status")).toBe(contractRoute.path);
    expect(routePath(TenancyStatusOrpcController, "status")).toBe(`/rpc${contractRoute.path}`);
    expect(method(TenancyStatusController, "status")).toBe(contractRoute.method);
    expect(method(TenancyStatusOrpcController, "status")).toBe(contractRoute.method);
    expect(Reflect.getMetadata(RESPONSE_SCHEMA_KEY, TenancyStatusController.prototype.status)).toBe(
      organizationsContract.status["~orpc"].outputSchema,
    );
  });
});

function routePath(controller: object, name: string): string {
  const prototype = (controller as { prototype: object }).prototype;
  const classPath = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
  const callback = (prototype as Record<string, unknown>)[name] as object;
  const methodPath = Reflect.getMetadata(PATH_METADATA, callback) as string | undefined;
  return `/${[classPath, methodPath]
    .filter(Boolean)
    .join("/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")}`;
}

function method(controller: object, name: string): string {
  const prototype = (controller as { prototype: object }).prototype;
  const callback = (prototype as Record<string, unknown>)[name] as object;
  const value = Reflect.getMetadata(METHOD_METADATA, callback) as RequestMethod;
  return RequestMethod[value];
}
