import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { API_BASE_PATH, API_DOCS_PATH, apiContract } from "@repo/contracts";
import { env } from "../../config/env";
import { Zod4SchemaConverter } from "./zod-schema-converter";
import { PinoLoggerService } from "../logger/logger.service";

export async function setupApiDocs(app: NestFastifyApplication): Promise<void> {
  try {
    const { OpenAPIGenerator } = await import("@orpc/openapi");
    const { default: fastifyApiReference } = await import("@scalar/fastify-api-reference");

    const generator = new OpenAPIGenerator({
      schemaConverters: [new Zod4SchemaConverter()],
    });
    const document = await generator.generate(apiContract, {
      info: {
        title: `${env.APP_NAME} API`,
        version: "1.0.0",
        description: "Auto-generated OpenAPI 3.1 Documentation via oRPC and Zod 4 schemas.",
      },
      servers: [
        { url: `${API_BASE_PATH}/rpc`, description: "oRPC runtime transport (relative)" },
        {
          url: `${env.API_URL}${API_BASE_PATH}/rpc`,
          description: "Direct oRPC runtime transport",
        },
        { url: API_BASE_PATH, description: "REST compatibility transport" },
      ],
    });

    const fastify = app.getHttpAdapter().getInstance();

    // Expose raw OpenAPI JSON at /api/docs/json for debugging and for Scalar URL reference.
    fastify.get(`${API_DOCS_PATH}/json`, async (_req, reply) => {
      reply.type("application/json").send(document);
    });

    // Scalar is a Fastify plugin — register directly on the Fastify instance
    // Register before Nest's global prefix so the documentation URL remains stable.
    await fastify.register(fastifyApiReference as unknown as never, {
      routePrefix: API_DOCS_PATH,
      configuration: {
        content: document,
        theme: "kepler",
        darkMode: true,
        showSidebar: true,
        pageTitle: `API Reference | ${env.APP_NAME}`,
        metaData: {
          title: `API Reference | ${env.APP_NAME}`,
        },
      },
    });
  } catch (error) {
    // Docs are dev-only; never crash boot if generation fails — log and continue
    app.get(PinoLoggerService).warn({ error: String(error) }, "API docs setup failed");
  }
}
