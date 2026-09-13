import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { finalize } from "rxjs/operators";
import { ClsService } from "nestjs-cls";
import type { FastifyRequest } from "fastify";
import { REQUEST_ID_HEADER, resolveRequestId } from "../utils/request-id.utils";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse();

    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);

    if (this.cls.isActive()) {
      this.cls.set("requestId", requestId);
    }

    if (typeof response.header === "function") {
      response.header(REQUEST_ID_HEADER, requestId);
    } else if (typeof response.setHeader === "function") {
      response.setHeader(REQUEST_ID_HEADER, requestId);
    }

    return next.handle().pipe(
      finalize(() => {
        if (this.cls.isActive()) {
          this.cls.set("requestId", undefined);
        }
      }),
    );
  }
}
