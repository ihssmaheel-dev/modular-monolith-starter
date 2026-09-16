import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { from, lastValueFrom, type Observable } from "rxjs";
import { DatabaseService } from "../../infrastructure/database";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";
import { NO_DATABASE_TRANSACTION_KEY } from "../decorators/database-transaction.decorator";

const LONG_TRANSACTION_WARNING_MS = 100;

@Injectable()
export class DatabaseTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly database: DatabaseService,
    private readonly reflector: Reflector,
    @Optional() private readonly logger?: PinoLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.shouldSkip(context)) return next.handle();
    return from(
      this.database.runTransaction(async () => {
        const startedAt = performance.now();
        try {
          return await lastValueFrom(next.handle());
        } finally {
          const durationMs = performance.now() - startedAt;
          if (durationMs >= LONG_TRANSACTION_WARNING_MS) {
            this.logger?.warn(
              { durationMs: Math.round(durationMs) },
              "HTTP database transaction exceeded the short-work budget",
            );
          }
        }
      }),
    );
  }

  private shouldSkip(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(NO_DATABASE_TRANSACTION_KEY, targets)) {
      return true;
    }
    // Database transactions are the default for HTTP handlers so PostgreSQL RLS
    // context is always configured. External-I/O handlers explicitly opt out.
    return false;
  }
}
