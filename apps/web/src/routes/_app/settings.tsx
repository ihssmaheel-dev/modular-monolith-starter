import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/features/settings/components/settings-view";

export const Route = createFileRoute("/_app/settings")({ component: SettingsView });
