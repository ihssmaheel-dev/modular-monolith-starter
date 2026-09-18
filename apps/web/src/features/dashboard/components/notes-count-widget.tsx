import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText } from "lucide-react";
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
import { useAuthStore } from "@/stores/auth.store";

export function NotesCountWidget() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const notesQuery = useQuery({ ...notesListQuery(1, 5), enabled: Boolean(user) });
  return (
    <Card className="border-border/80 bg-card shadow-2xs hover:border-primary/40 transition-colors">
      <CardHeader className="p-4 pb-1.5 space-y-0.5">
        <CardDescription className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("notes.title")}</span>
          <FileText className="size-3.5 text-primary" />
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
          {notesQuery.data?.total ? String(notesQuery.data.total) : "0"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("common.items")}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1 px-1.5"
          render={<Link to={FRONTEND_ROUTES.notes} />}
        >
          <span>{t("notes.title")}</span>
          <ArrowRight className="size-3" />
        </Button>
      </CardContent>
    </Card>
  );
}
