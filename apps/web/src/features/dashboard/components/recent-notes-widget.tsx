import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { FRONTEND_ROUTES } from "@repo/contracts";
import { notesListQuery } from "@/features/notes/notes.queries";
import { formatRelativeTime } from "@/lib/format";
import { useAuthStore } from "@/stores/auth.store";

export function RecentNotesWidget() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const notesQuery = useQuery({ ...notesListQuery(1, 5), enabled: Boolean(user) });
  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2.5">
        <div>
          <CardTitle className="text-sm sm:text-base font-semibold">
            {t("dashboard.recentNotes")}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {t("notes.description")}
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          render={<Link to={FRONTEND_ROUTES.notes} />}
        >
          <span>{t("notes.title")}</span>
          <ArrowRight className="size-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {notesQuery.isLoading ? (
          <p className="text-xs text-muted-foreground py-5 text-center">{t("common.loading")}</p>
        ) : notesQuery.isError ? (
          <p className="text-xs text-destructive py-5 text-center">{t("errors.networkError")}</p>
        ) : notesQuery.data?.items && notesQuery.data.items.length > 0 ? (
          <div className="divide-y divide-border/60 rounded-md border border-border/70 bg-background/50">
            {notesQuery.data.items.map((note) => (
              <div
                key={note.id}
                className="flex items-center justify-between gap-3 p-2.5 sm:px-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-xs sm:text-sm font-medium text-foreground">
                    {note.title}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{note.content}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px] font-mono py-0 h-4.5">
                  {formatRelativeTime(note.createdAt)}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center rounded-md border border-dashed border-border/70 bg-muted/10 space-y-2.5">
            <FileText className="size-6 text-muted-foreground mx-auto opacity-50" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">{t("notes.noNotes")}</p>
            </div>
            <Button
              size="sm"
              render={<Link to={FRONTEND_ROUTES.newNote} />}
              className="h-7 gap-1 px-2.5 text-xs shadow-none"
            >
              <Plus className="size-3" />
              <span>{t("notes.newNote")}</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
