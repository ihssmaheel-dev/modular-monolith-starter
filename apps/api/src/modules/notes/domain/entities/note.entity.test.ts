import { describe, it, expect } from "vitest";
import { Note } from "./note.entity";

describe("Note Entity", () => {
  it("should create a note with defaults and timestamps", () => {
    const note = Note.create({
      title: "My Note",
      content: "Some content",
      createdBy: "user-1",
      tenantId: "tenant-1",
    });

    expect(note.title).toBe("My Note");
    expect(note.content).toBe("Some content");
    expect(note.createdBy).toBe("user-1");
    expect(note.tenantId).toBe("tenant-1");
    expect(note.id).toBeDefined();
    expect(note.createdAt).toBeInstanceOf(Date);
    expect(note.updatedAt).toBeInstanceOf(Date);
  });

  it("should restore note from persistence", () => {
    const now = new Date();
    const note = Note.fromPersistence({
      id: "note-123",
      title: "Saved Title",
      content: "Saved Content",
      createdBy: "user-2",
      createdAt: now,
      updatedAt: now,
      tenantId: "tenant-2",
    });

    expect(note.id).toBe("note-123");
    expect(note.title).toBe("Saved Title");
    expect(note.content).toBe("Saved Content");
    expect(note.tenantId).toBe("tenant-2");
  });

  it("should update title and content", () => {
    const note = Note.create({
      title: "Initial",
      content: "Initial content",
    });

    note.update({ title: "Updated Title", content: "Updated content" });

    expect(note.title).toBe("Updated Title");
    expect(note.content).toBe("Updated content");
  });
});
