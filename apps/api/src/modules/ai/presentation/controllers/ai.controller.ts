import { Body, Controller, HttpException, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { Readable } from "node:stream";
import type { FastifyRequest, FastifyReply } from "fastify";
import { RequirePermission } from "../../../../common";
import { ZodValidationPipe } from "../../../../common/pipes/validation.pipe";
import { AiChatRequestSchema } from "@repo/contracts";
import type { AiChatRequest, AiChatResponse } from "@repo/contracts";
import { AiService } from "../../../../infrastructure/ai/ai.service";
import { TenantContextService } from "../../../../infrastructure/database";
import { I18nService } from "../../../../infrastructure/i18n/i18n.service";

@Controller("ai")
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly tenantContext: TenantContextService,
    private readonly i18n: I18nService,
  ) {}

  @Post("chat")
  @RequirePermission("ai:chat")
  async chat(
    @Body(new ZodValidationPipe(AiChatRequestSchema)) request: AiChatRequest,
    @Req() req: FastifyRequest,
  ): Promise<AiChatResponse> {
    const tenantId = this.tenantContext.get()?.tenantId ?? "";
    const headers = this.extractContextHeaders(req, tenantId);

    const result = await this.aiService.chat(request, headers);
    if (result.isErr()) {
      const status =
        result.error.type === "AI_DISABLED"
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.BAD_GATEWAY;
      const lang = String(req.headers["accept-language"] ?? "");
      throw new HttpException(this.i18n.t("api.error.aiUnavailable", lang), status);
    }

    return result.value;
  }

  @Post("chat/stream")
  @RequirePermission("ai:chat")
  async streamChat(
    @Body(new ZodValidationPipe(AiChatRequestSchema)) request: AiChatRequest,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const tenantId = this.tenantContext.get()?.tenantId ?? "";
    const headers = this.extractContextHeaders(req, tenantId);

    const result = await this.aiService.streamChat(request, headers);
    if (result.isErr() || !result.value.body) {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE).send({
        error: "AI streaming service is unavailable",
      });
      return;
    }

    reply.raw.writeHead(HttpStatus.OK, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const nodeStream = Readable.fromWeb(
      result.value.body as import("node:stream/web").ReadableStream,
    );
    nodeStream.pipe(reply.raw);
  }

  private extractContextHeaders(req: FastifyRequest, tenantId: string): Record<string, string> {
    const headers: Record<string, string> = {
      "x-tenant-id": tenantId,
    };

    if (req.headers.traceparent) {
      headers.traceparent = String(req.headers.traceparent);
    }
    if (req.headers["x-request-id"]) {
      headers["x-request-id"] = String(req.headers["x-request-id"]);
    }

    return headers;
  }
}
