import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable, tap, catchError, throwError } from "rxjs";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";

const DEFAULT_SUCCESS_STATUS = 200;
const DEFAULT_ERROR_STATUS = 500;
const SILENT_ROUTES = new Set(["/metrics", "/health", "/favicon.ico"]);

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
    const { method, url } = http.getRequest();
    const isSilent =
      SILENT_ROUTES.has(url) || url.startsWith("/metrics") || url.startsWith("/health");
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        const statusCode = http.getResponse()?.statusCode ?? DEFAULT_SUCCESS_STATUS;
        const logData = { method, url, duration, statusCode };
        const message = `${method} ${url} ${statusCode} - ${duration}ms`;

        if (isSilent) {
          this.logger.debug(logData, message);
        } else {
          this.logger.info(logData, message);
        }
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - start;
        const statusCode = this.extractStatusCode(error);
        const message = `${method} ${url} ${statusCode} - ${duration}ms (failed)`;
        this.logger.warn({ method, url, duration, statusCode }, message);
        return throwError(() => error);
      }),
    );
  }
}
