import { createFileRoute, redirect } from "@tanstack/react-router";
import { NoteDetail } from "@/features/notes/components/note-detail";
import { getWebEnv } from "@/lib/env";

export const Route = createFileRoute("/_app/notes/$noteId")({
  beforeLoad: () => {
    if (!getWebEnv().VITE_EXAMPLE_FEATURES_ENABLED) throw redirect({ to: "/dashboard" });
  },
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = Route.useParams();
  return <NoteDetail id={noteId} />;
}
