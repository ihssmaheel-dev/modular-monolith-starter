import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest() as {
      method?: string;
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    };

    const method = (request.method ?? "GET").toUpperCase();
    if (SAFE_METHODS.has(method)) return true;

    // Bearer token authentication is immune to ambient cookie CSRF attacks
    const authHeader = request.headers?.authorization;
    if (authHeader?.startsWith("Bearer ")) return true;

    const hasAuthCookie = Boolean(request.cookies?.access_token || request.cookies?.refresh_token);
    if (isPublic && !hasAuthCookie) return true;

    // If request relies on cookie authentication, verify double-submit CSRF token
    const cookieToken = request.cookies?.["XSRF-TOKEN"] ?? request.cookies?.["xsrf_token"];
    const headerToken = request.headers?.["x-xsrf-token"] ?? request.headers?.["x-csrf-token"];

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException();
    }

    const cookieBytes = Buffer.from(cookieToken);
    const headerBytes = Buffer.from(headerToken);
    if (cookieBytes.length !== headerBytes.length) {
      throw new ForbiddenException();
    }

    const isValid = timingSafeEqual(cookieBytes, headerBytes);
    if (!isValid) {
      throw new ForbiddenException();
    }

    return true;
  }
}
