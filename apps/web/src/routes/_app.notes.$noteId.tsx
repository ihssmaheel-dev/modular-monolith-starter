import { createFileRoute } from "@tanstack/react-router";
import { NoteDetail } from "@/features/notes/components/note-detail";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = Route.useParams();
  return <NoteDetail id={noteId} />;
}
