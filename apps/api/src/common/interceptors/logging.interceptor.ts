import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable, tap, catchError, throwError } from "rxjs";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.info({ method, url, duration }, "Request completed");
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - start;
        this.logger.warn({ method, url, duration }, "Request failed");
        return throwError(() => error);
      }),
    );
  }
}
