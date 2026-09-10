import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { trace } from "@opentelemetry/api";
import { ClsService } from "nestjs-cls";
import { PinoLoggerService } from "../../infrastructure/logger/logger.service";
import { I18nService } from "../../infrastructure/i18n/i18n.service";
import { createApiErrorEnvelope } from "../utils/error-envelope.utils";
import { REQUEST_ID_HEADER, resolveRequestId } from "../utils/request-id.utils";
import type { ErrorReporter } from "../../infrastructure/error-reporting";

export const ERROR_REF_HEADER = "x-error-ref";
export const TRACE_ID_HEADER = "x-trace-id";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLoggerService,
    private readonly i18n: I18nService,
    private readonly cls?: ClsService,
    private readonly reporter?: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = this.requestId(request);
    const span = trace.getActiveSpan();
    const traceId = span ? span.spanContext().traceId : undefined;
    const envelope = createApiErrorEnvelope(
      exception,
      status,
      request.headers["accept-language"],
      requestId,
      this.i18n,
      traceId,
    );

    if (span) {
      if (envelope.errorRef) span.setAttribute("error.ref", envelope.errorRef);
      span.setAttribute("error", true);
      if (exception instanceof Error) {
        span.recordException(exception);
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId, traceId, errorRef: envelope.errorRef },
        "Unhandled exception",
      );
      void this.reporter?.capture(
        exception,
        this.reportContext(request, requestId, envelope.errorRef),
      );
    }

    response.header(REQUEST_ID_HEADER, requestId);
    if (traceId) response.header(TRACE_ID_HEADER, traceId);
    if (envelope.errorRef) response.header(ERROR_REF_HEADER, envelope.errorRef);

    if (this.isOrpcRequest(request)) {
      response.status(status).send({
        defined: false,
        code: envelope.code,
        status: envelope.status,
        message: envelope.message,
        i18nKey: envelope.i18nKey,
        fieldErrors: envelope.fieldErrors,
        requestId: envelope.requestId,
        traceId: envelope.traceId,
        errorRef: envelope.errorRef,
        retry: envelope.retry,
        data: envelope,
      });
      return;
    }
    response.status(status).send(envelope);
  }

  private isOrpcRequest(request: FastifyRequest): boolean {
    return (request.url?.split("?")[0] ?? "").includes("/rpc/");
  }

  private requestId(request: FastifyRequest): string {
    const active = this.cls?.isActive() ? this.cls.get("requestId") : undefined;
    return typeof active === "string" && active
      ? active
      : resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  }

  private reportContext(request: FastifyRequest, requestId: string, errorRef?: string) {
    const requestWithContext = request as FastifyRequest & {
      user?: { sub?: string };
      tenant?: { tenantId?: string };
    };
    return {
      requestId,
      ...(errorRef ? { errorRef } : {}),
      method: request.method,
      path: request.url?.split("?")[0] ?? "/",
      ...(requestWithContext.user?.sub ? { userId: requestWithContext.user.sub } : {}),
      ...(requestWithContext.tenant?.tenantId
        ? { tenantId: requestWithContext.tenant.tenantId }
        : {}),
    };
  }
}
