import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { RealtimeService } from "../../../../infrastructure/realtime/realtime.service";
import { PinoLoggerService } from "../../../../infrastructure/logger/logger.service";
import {
  NoteCreatedEvent,
  NoteUpdatedEvent,
  NoteDeletedEvent,
} from "../../domain/events/note.events";

@Injectable()
export class NotesRealtimeListener {
  private readonly logger: PinoLoggerService;

  constructor(
    private readonly realtimeService: RealtimeService,
    logger: PinoLoggerService,
  ) {
    this.logger = logger.child({ module: "NotesRealtimeListener" });
  }

  @OnEvent("note.created")
  handleNoteCreated(event: NoteCreatedEvent): void {
    try {
      this.realtimeService.sendToUser(event.userId, "note.created", event, event.tenantId);
    } catch (error) {
      this.logger.error(
        { error, noteId: event.noteId, userId: event.userId },
        "Realtime note.created dispatch failed",
      );
    }
  }

  @OnEvent("note.updated")
  handleNoteUpdated(event: NoteUpdatedEvent): void {
    try {
      this.realtimeService.sendToUser(event.userId, "note.updated", event, event.tenantId);
    } catch (error) {
      this.logger.error(
        { error, noteId: event.noteId, userId: event.userId },
        "Realtime note.updated dispatch failed",
      );
    }
  }

  @OnEvent("note.deleted")
  handleNoteDeleted(event: NoteDeletedEvent): void {
    try {
      this.realtimeService.sendToUser(event.userId, "note.deleted", event, event.tenantId);
    } catch (error) {
      this.logger.error(
        { error, noteId: event.noteId, userId: event.userId },
        "Realtime note.deleted dispatch failed",
      );
    }
  }
}
