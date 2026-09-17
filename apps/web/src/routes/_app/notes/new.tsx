import { createFileRoute, redirect } from "@tanstack/react-router";
import { NoteCreateForm } from "@/features/notes/components/note-create-form";
import { getWebEnv } from "@/lib/env";

export const Route = createFileRoute("/_app/notes/new")({
  beforeLoad: () => {
    if (!getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED) throw redirect({ to: "/dashboard" });
  },
  component: CreateNotePage,
});

function CreateNotePage() {
  return <NoteCreateForm />;
}
