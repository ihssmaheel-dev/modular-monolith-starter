import { describe, expect, it } from "vitest";
import { NotesModule } from "./modules/notes/notes.module";
import { applicationFeatureModules } from "./app.module";

describe("application feature composition", () => {
  it("can exclude the reference feature slice from a production application", () => {
    expect(applicationFeatureModules(false)).not.toContain(NotesModule);
  });

  it("keeps the reference slice available for learning and validation", () => {
    expect(applicationFeatureModules(true)).toContain(NotesModule);
  });
});
