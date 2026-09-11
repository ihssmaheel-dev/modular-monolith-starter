import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { isTrustedHost, isTrustedOrigin } from "../utils/origin.utils";

const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginValidationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (ALLOWED_METHODS.has(request.method)) {
      return next.handle();
    }

    const origin = request.headers["origin"];

    // One trust rule shared with CORS (see common/utils/origin.utils):
    // configured origins plus loopback outside production. Absent
    // Origin/Referer (curl, mobile apps) is not a browser request.
    if (origin && !isTrustedOrigin(origin)) {
      throw new ForbiddenException();
    }

    const referer = request.headers["referer"];
    if (!origin && referer) {
      try {
        if (!isTrustedHost(new URL(referer).host)) {
          throw new ForbiddenException();
        }
      } catch {
        throw new ForbiddenException();
      }
    }

    return next.handle();
  }
}
