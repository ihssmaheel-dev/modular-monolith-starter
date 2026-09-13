import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import type { AuthenticatedUser } from "@repo/contracts";
import { verifyAccessToken } from "../utils/access-token.utils";
import { timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import {
  AUTH_USER_VERIFIER_PORT,
  type AuthUserVerifierPort,
} from "../ports/auth-user-verifier.port";

const METRICS_PATH = "/metrics";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private cls: ClsService,
    @Inject(AUTH_USER_VERIFIER_PORT) private readonly userVerifier: AuthUserVerifierPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest() as {
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
      user?: AuthenticatedUser;
      url?: string;
    };
    if (isPublic || this.isMetricsAuthorized(request)) return true;
    if (request.url?.split("?")[0] === METRICS_PATH) throw new UnauthorizedException();
    const token = this.extractToken(request);

    if (!token) throw new UnauthorizedException();

    const decoded = verifyAccessToken(token);
    if (!decoded) throw new UnauthorizedException();

    const { valid } = await this.userVerifier.verifyUserAuthVersion(
      decoded.sub,
      decoded.authVersion,
    );
    if (!valid) {
      throw new UnauthorizedException();
    }

    request.user = decoded;
    this.cls.set("userId", decoded.sub);
    this.cls.set("userEmail", decoded.email);
    return true;
  }

  private extractToken(request: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  }): string | null {
    const auth = request.headers?.authorization;
    if (auth?.startsWith("Bearer ")) {
      return auth.slice(7);
    }

    if (request.cookies?.access_token) {
      return request.cookies.access_token;
    }

    return null;
  }

  private isMetricsAuthorized(request: {
    headers?: Record<string, string>;
    url?: string;
  }): boolean {
    if (request.url?.split("?")[0] !== METRICS_PATH) return false;
    if (!env.METRICS_TOKEN) return env.NODE_ENV !== "production";
    const provided = request.headers?.authorization?.replace(/^Bearer /, "");
    if (!provided || provided.length !== env.METRICS_TOKEN.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(env.METRICS_TOKEN));
  }
}
