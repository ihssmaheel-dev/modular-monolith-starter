import { Module, type OnModuleInit } from "@nestjs/common";
import { AuthorizationService } from "../../infrastructure/authorization";
import { filePolicies } from "./application/policies/files.policies";
import { FilesController } from "./presentation/files.controller";
import { RequestUploadCommand } from "./application/commands/request-upload.command";
import { ConfirmUploadCommand } from "./application/commands/confirm-upload.command";
import { DeleteFileCommand } from "./application/commands/delete-file.command";
import { LinkFileCommand } from "./application/commands/link-file.command";
import { PurgeUserFilesCommand } from "./application/commands/purge-user-files.command";
import { PurgeTenantFilesCommand } from "./application/commands/purge-tenant-files.command";
import { GetFileByIdQuery } from "./application/queries/get-file-by-id.query";
import { ListFilesByUploaderQuery } from "./application/queries/list-files-by-uploader.query";
import { GetFileDownloadUrlQuery } from "./application/queries/get-file-download-url.query";
import { ListFilesByParentQuery } from "./application/queries/list-files-by-parent.query";
import { FileCleanupWorker } from "./application/workers/file-cleanup.worker";
import { FileScanWorker } from "./application/workers/file-scan.worker";
import { FileReconciliationWorker } from "./application/workers/file-reconciliation.worker";
import { FilesRepository } from "./infrastructure/repositories/files.repository";
import { FileAccessRegistry } from "../../common/file-access/file-access.registry";
import { DatabaseModule } from "../../infrastructure/database";
import { FilesOrpcController } from "./presentation/files.orpc.controller";

@Module({
  imports: [DatabaseModule],
  controllers: [FilesController, FilesOrpcController],
  providers: [
    FilesController,
    RequestUploadCommand,
    ConfirmUploadCommand,
    DeleteFileCommand,
    LinkFileCommand,
    PurgeUserFilesCommand,
    PurgeTenantFilesCommand,
    GetFileByIdQuery,
    GetFileDownloadUrlQuery,
    ListFilesByParentQuery,
    ListFilesByUploaderQuery,
    FileCleanupWorker,
    FileScanWorker,
    FileReconciliationWorker,
    FilesRepository,
    FileAccessRegistry,
  ],
  exports: [
    RequestUploadCommand,
    ConfirmUploadCommand,
    DeleteFileCommand,
    LinkFileCommand,
    PurgeUserFilesCommand,
    PurgeTenantFilesCommand,
    GetFileByIdQuery,
    GetFileDownloadUrlQuery,
    ListFilesByParentQuery,
    ListFilesByUploaderQuery,
    FileCleanupWorker,
    FileScanWorker,
    FileReconciliationWorker,
    FileAccessRegistry,
  ],
})
export class FilesModule implements OnModuleInit {
  constructor(private readonly authService: AuthorizationService) {}

  onModuleInit(): void {
    this.authService.registerPolicies(filePolicies);
  }
}
