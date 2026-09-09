import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { env } from "../../config/env";

const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (ALLOWED_METHODS.has(request.method)) {
      return next.handle();
    }

    const origin = request.headers["origin"];

    if (origin) {
      try {
        const originUrl = new URL(origin);
        const allowedOrigins =
          env.NODE_ENV === "production"
            ? [env.CLIENT_URL]
            : [env.CLIENT_URL, "http://localhost:5156", "http://localhost:5155"];

        if (!allowedOrigins.includes(originUrl.origin)) {
          throw new ForbiddenException();
        }
      } catch {
        throw new ForbiddenException();
      }
    }

    const referer = request.headers["referer"];
    if (!origin && referer) {
      try {
        const refererUrl = new URL(referer);
        const allowedHosts =
          env.NODE_ENV === "production"
            ? [new URL(env.CLIENT_URL).host]
            : [new URL(env.CLIENT_URL).host, "localhost:5156", "localhost:5155"];

        if (!allowedHosts.includes(refererUrl.host)) {
          throw new ForbiddenException();
        }
      } catch {
        throw new ForbiddenException();
      }
    }

    return next.handle();
  }
}
