import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../infrastructure/database";
import { QueueModule } from "../../infrastructure/queue/queue.module";
import { StorageModule } from "../../infrastructure/storage/storage.module";
import { FilesModule } from "../files/files.module";
import { IntelligenceClient } from "./infrastructure/clients/intelligence.client";
import { IntelligencePromptProtector } from "./infrastructure/security/prompt-protector";
import {
  IntelligenceChunkRepository,
  IntelligenceDocumentRepository,
  IntelligenceRunRepository,
} from "./infrastructure/repositories/intelligence.repository";
import { CreateIntelligenceRunCommand } from "./application/commands/create-intelligence-run.command";
import { IndexIntelligenceDocumentCommand } from "./application/commands/index-intelligence-document.command";
import { GetIntelligenceRunQuery } from "./application/queries/get-intelligence-run.query";
import { GetIntelligenceDocumentQuery } from "./application/queries/get-intelligence-document.query";
import { IntelligenceRunWorker } from "./application/workers/intelligence-run.worker";
import { IntelligenceDocumentWorker } from "./application/workers/intelligence-document.worker";
import { IntelligenceRecoveryWorker } from "./application/workers/intelligence-recovery.worker";
import { IntelligenceController } from "./presentation/controllers/intelligence.controller";
import { IntelligenceOrpcController } from "./presentation/orpc/intelligence.orpc.controller";

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule, FilesModule],
  controllers: [IntelligenceController, IntelligenceOrpcController],
  providers: [
    IntelligenceClient,
    IntelligencePromptProtector,
    IntelligenceRunRepository,
    IntelligenceDocumentRepository,
    IntelligenceChunkRepository,
    CreateIntelligenceRunCommand,
    IndexIntelligenceDocumentCommand,
    GetIntelligenceRunQuery,
    GetIntelligenceDocumentQuery,
    IntelligenceRunWorker,
    IntelligenceDocumentWorker,
    IntelligenceRecoveryWorker,
  ],
  exports: [IntelligenceClient],
})
export class IntelligenceModule {}
