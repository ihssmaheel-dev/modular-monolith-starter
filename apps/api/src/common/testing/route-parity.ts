import "reflect-metadata";
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { RequestMethod } from "@nestjs/common";
import type { AnyContractProcedure } from "@orpc/contract" with { "resolution-mode": "import" };
import { describe, expect, it } from "vitest";
import { RESPONSE_SCHEMA_KEY } from "../decorators/response-schema.decorator";
import { ZodValidationPipe } from "../pipes/validation.pipe";

export type RoutePair = {
  contract: AnyContractProcedure;
  rpc: [object, string];
  rest: [object, string];
};

export interface DescribeRouteParityOptions {
  domain: string;
  routes: RoutePair[];
  controllers?: Array<[object, string]>;
  contract?: Record<string, AnyContractProcedure>;
  inputlessProcedures?: Set<string>;
}

export function routePairs(
  contract: Record<string, AnyContractProcedure>,
  rpcController: object,
  restController: object,
  names: [string, string, string][],
): RoutePair[] {
  return names.map(([contractName, rpcMethod, restMethod]) => ({
    contract: contract[contractName] ?? missingContract(contractName),
    rpc: [rpcController, rpcMethod],
    rest: [restController, restMethod],
  }));
}

function missingContract(name: string): AnyContractProcedure {
  throw new Error(`Missing contract procedure: ${name}`);
}

export function routePath(controller: object, method: string): string {
  const type = controller as { prototype: object };
  const classPath = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  const methodPath = Reflect.getMetadata(PATH_METADATA, callback) as string | undefined;
  return normalize([classPath, methodPath].filter(Boolean).join("/"));
}

export function responseSchema(controller: object, method: string): unknown {
  const type = controller as { prototype: object };
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  return Reflect.getMetadata(RESPONSE_SCHEMA_KEY, callback);
}

export function methodName(controller: object, method: string): string {
  const type = controller as { prototype: object };
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  const value = Reflect.getMetadata(METHOD_METADATA, callback) as RequestMethod;
  return RequestMethod[value];
}

export function successStatus(controller: object, method: string): number {
  const type = controller as { prototype: object };
  const callback = (type.prototype as Record<string, unknown>)[method] as object;
  return (Reflect.getMetadata(HTTP_CODE_METADATA, callback) as number | undefined) ?? 200;
}

export function normalize(path?: string): string {
  return `/${(path ?? "").replace(/^\/+|\/+$/g, "")}`.replace(/\/+/g, "/");
}

export function nestPath(path?: string): string {
  return normalize(path).replace(/\{([^}]+)\}/g, ":$1");
}

export function describeRouteParity(options: DescribeRouteParityOptions) {
  const { domain, routes, controllers, contract, inputlessProcedures } = options;

  describe(`${domain} oRPC and REST route parity`, () => {
    it.each(routes)("keeps $rpc.1 aligned with its REST controller and contract", (route) => {
      const contractRoute = route.contract["~orpc"].route;
      const restPath = routePath(route.rest[0], route.rest[1]);
      const rpcPath = routePath(route.rpc[0], route.rpc[1]);
      expect(contractRoute.path).toBeDefined();
      expect(contractRoute.method).toBeDefined();
      expect(restPath).toBe(nestPath(contractRoute.path));
      expect(rpcPath).toBe(`/rpc${nestPath(contractRoute.path)}`);
      expect(methodName(route.rest[0], route.rest[1])).toBe(contractRoute.method);
      expect(methodName(route.rpc[0], route.rpc[1])).toBe(contractRoute.method);
      const expectedStatus = contractRoute.successStatus ?? 200;
      expect(successStatus(route.rest[0], route.rest[1])).toBe(expectedStatus);
      expect(successStatus(route.rpc[0], route.rpc[1])).toBe(expectedStatus);
      expect(responseSchema(route.rest[0], route.rest[1])).toBe(
        route.contract["~orpc"].outputSchema,
      );
    });
  });

  if (controllers && controllers.length > 0) {
    describe(`${domain} REST route coverage`, () => {
      const covered = new Set(
        routes.map((route) => {
          const controller = route.rest[0];
          const label =
            controllers.find(([c]) => c === controller)?.[1] ??
            (controller as { name?: string }).name;
          return `${label}.${route.rest[1]}`;
        }),
      );

      for (const [controller, label] of controllers) {
        const prototype = (controller as { prototype: Record<string, object> }).prototype;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === "constructor") continue;
          if (Reflect.getMetadata(METHOD_METADATA, prototype[name] as object) === undefined)
            continue;
          it(`${label}.${name} is covered by parity ROUTES`, () => {
            expect(covered.has(`${label}.${name}`)).toBe(true);
          });
        }
      }
    });
  }

  describe(`${domain} REST input validation`, () => {
    for (const route of routes) {
      const controller = route.rest[0];
      const label =
        controllers?.find(([c]) => c === controller)?.[1] ?? (controller as { name?: string }).name;
      it(`${label}.${route.rest[1]} validates body/query/param inputs with Zod`, () => {
        const prototype = (route.rest[0] as { prototype: Record<string, object> }).prototype;
        const target = prototype[route.rest[1]] as object | undefined;
        if (!target) throw new Error(`Missing REST handler: ${route.rest[1]}`);
        const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, target) as
          Record<string, { type: RouteParamtypes; pipes?: unknown[] }> | undefined;
        if (!args) return;
        for (const arg of Object.values(args)) {
          if (
            arg.type === RouteParamtypes.BODY ||
            arg.type === RouteParamtypes.QUERY ||
            arg.type === RouteParamtypes.PARAM
          ) {
            expect(arg.pipes?.some((pipe) => pipe instanceof ZodValidationPipe)).toBe(true);
          }
        }
      });
    }
  });

  if (contract) {
    describe(`${domain} oRPC contract input coverage`, () => {
      for (const key of Object.keys(contract)) {
        const procedure = contract[key];
        if (!procedure || typeof procedure !== "object" || !("~orpc" in procedure)) continue;
        it(`${domain}.${key} declares an input schema or is an approved exception`, () => {
          if (inputlessProcedures?.has(`${domain}.${key}`) || inputlessProcedures?.has(key)) return;
          const inputSchema = (procedure["~orpc"] as { inputSchema?: unknown }).inputSchema;
          expect(inputSchema).toBeDefined();
        });
      }
    });
  }
}
