import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable, tap, catchError, throwError } from "rxjs";
import { API_BASE_PATH } from "@repo/contracts";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";

const DEFAULT_SUCCESS_STATUS = 200;
const DEFAULT_ERROR_STATUS = 500;
const MAX_ROUTE_LENGTH = 250;
const SILENT_ROUTES = new Set(["/metrics", "/health", "/favicon.ico"]);
const SILENT_ROUTE_PREFIXES = ["/metrics", "/health", `${API_BASE_PATH}/health`];

type RequestMetadata = {
  method?: string;
  url?: string;
  routeOptions?: { url?: string };
};

function safeRequestMetadata(request: RequestMetadata): { method: string; route: string } {
  const method = request.method ?? "UNKNOWN";
  const route = request.routeOptions?.url ?? request.url?.split("?", 1)[0] ?? "unknown";
  return { method, route: route.replace(/[\r\n]/g, "").slice(0, MAX_ROUTE_LENGTH) };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLoggerService) {}

  private extractStatusCode(error: unknown): number {
    if (typeof error === "object" && error !== null) {
      const err = error as Record<string, unknown>;
      if (typeof err.status === "number") return err.status;
      if (typeof err.statusCode === "number") return err.statusCode;
    }
    return DEFAULT_ERROR_STATUS;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const { method, route } = safeRequestMetadata(http.getRequest<RequestMetadata>());
    const isSilent =
      SILENT_ROUTES.has(route) || SILENT_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix));
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        const statusCode = http.getResponse()?.statusCode ?? DEFAULT_SUCCESS_STATUS;
        const logData = { method, route, duration, statusCode };
        const message = `${method} ${route} ${statusCode} - ${duration}ms`;

        if (isSilent) {
          this.logger.debug(logData, message);
        } else {
          this.logger.info(logData, message);
        }
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - start;
        const statusCode = this.extractStatusCode(error);
        const message = `${method} ${route} ${statusCode} - ${duration}ms (failed)`;
        this.logger.warn({ method, route, duration, statusCode }, message);
        return throwError(() => error);
      }),
    );
  }
}
