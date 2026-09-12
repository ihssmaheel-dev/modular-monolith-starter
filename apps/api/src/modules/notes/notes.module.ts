import { Module, type OnModuleInit } from "@nestjs/common";
import { AuthorizationService } from "../../infrastructure/authorization";
import { notePolicies } from "./application/policies/notes.policies";
import { NotesRepository } from "./infrastructure/repositories/notes.repository";
import { CreateNoteCommand } from "./application/commands/create-note.command";
import { UpdateNoteCommand } from "./application/commands/update-note.command";
import { DeleteNoteCommand } from "./application/commands/delete-note.command";
import { PurgeUserNotesCommand } from "./application/commands/purge-user-notes.command";
import { PurgeTenantNotesCommand } from "./application/commands/purge-tenant-notes.command";
import { GetNotesQuery } from "./application/queries/get-notes.query";
import { GetNoteByIdQuery } from "./application/queries/get-note-by-id.query";
import { ListNoteAttachmentsQuery } from "./application/queries/list-note-attachments.query";
import { NotesRealtimeListener } from "./application/listeners/notes-realtime.listener";
import { AttachFileToNoteCommand } from "./application/commands/attach-file-to-note.command";
import { FileAccessRegistry } from "../../common/file-access/file-access.registry";
import { NotesController } from "./presentation/controllers/notes.controller";
import { OutboxModule } from "../../infrastructure/outbox/outbox.module";
import { FilesModule } from "../files/files.module";
import { NotesOrpcController } from "./presentation/orpc/notes.orpc.controller";

@Module({
  imports: [OutboxModule, FilesModule],
  controllers: [NotesController, NotesOrpcController],
  providers: [
    NotesController,
    NotesRepository,
    CreateNoteCommand,
    UpdateNoteCommand,
    DeleteNoteCommand,
    PurgeUserNotesCommand,
    PurgeTenantNotesCommand,
    AttachFileToNoteCommand,
    GetNotesQuery,
    GetNoteByIdQuery,
    ListNoteAttachmentsQuery,
    NotesRealtimeListener,
  ],
  exports: [
    NotesRepository,
    GetNotesQuery,
    PurgeUserNotesCommand,
    PurgeTenantNotesCommand,
    AttachFileToNoteCommand,
  ],
})
export class NotesModule implements OnModuleInit {
  constructor(
    private readonly authService: AuthorizationService,
    private readonly fileAccess: FileAccessRegistry,
    private readonly getNoteById: GetNoteByIdQuery,
  ) {}

  onModuleInit(): void {
    this.authService.registerPolicies(notePolicies);
    // Note attachments inherit note readability at download time: the
    // checker re-evaluates notes:read against the live parent record.
    this.fileAccess.registerParentAccess("note", async (file, actor) => {
      if (!file.parentId) return false;
      const note = await this.getNoteById.execute(file.parentId, actor);
      return note.isOk() && !!note.value;
    });
  }
}
