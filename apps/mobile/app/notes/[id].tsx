import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { mobileTokens } from "@/theme/tokens.generated";
import { Link, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { noteByIdQuery, noteAttachmentsQuery } from "@/features/notes/notes.queries";
import {
  openFileDownload,
  useAttachNoteFileMutation,
  useDeleteFileMutation,
} from "@/features/files/files.mutations";
import { FileDrop } from "@/components/ui/file-drop";
import { Card } from "@/components/ui/card";

export default function NoteDetail() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const colors = mobileTokens[resolvedTheme];
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = typeof id === "string" ? id : "";
  const noteQuery = useQuery({ ...noteByIdQuery(noteId), enabled: noteId.length > 0 });
  const attachmentsQuery = useQuery({
    ...noteAttachmentsQuery(noteId),
    enabled: noteId.length > 0,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const pending = items.some((item) => item.status !== "uploaded" && item.status !== "failed");
      return pending ? 3000 : false;
    },
  });
  const attachMutation = useAttachNoteFileMutation(noteId);
  const deleteMutation = useDeleteFileMutation();

  const confirmDelete = (fileId: string, fileName: string) => {
    Alert.alert(t("common.delete"), t("files.deleteConfirm", { name: fileName }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => deleteMutation.mutate(fileId),
      },
    ]);
  };

  if (noteQuery.isLoading) {
    return (
      <View
        style={{ backgroundColor: colors.background }}
        className="flex-1 items-center justify-center"
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (noteQuery.isError || !noteQuery.data) {
    return (
      <View style={{ backgroundColor: colors.background }} className="flex-1 p-4">
        <Text className="text-sm text-destructive">{t("api.note.notFound")}</Text>
        <Link href="/(tabs)/notes" className="mt-2 text-sm font-medium underline">
          {t("common.back")}
        </Link>
      </View>
    );
  }

  const note = noteQuery.data;
  const files = attachmentsQuery.data?.items ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      <Card>
        <Text className="text-xl font-bold text-foreground">{note.title}</Text>
        <Text className="mt-2 text-sm text-foreground">{note.content}</Text>
      </Card>
      <Card>
        <Text className="text-base font-bold text-foreground">{t("files.attachments")}</Text>
        <View className="mt-3 gap-2">
          {files.length === 0 ? (
            <Text className="text-sm text-muted-foreground">{t("files.noAttachments")}</Text>
          ) : (
            files.map((file) => (
              <View
                key={file.id}
                className="flex-row items-center gap-3 rounded-lg border border-border p-3"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                    {file.fileName}
                  </Text>
                  {file.slot ? (
                    <Text className="text-xs text-muted-foreground">{file.slot}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => void openFileDownload(file.id)} className="px-2 py-1">
                  <Text className="text-sm font-medium text-foreground">{t("files.download")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(file.id, file.fileName)}
                  className="px-2 py-1"
                >
                  <Text className="text-sm font-medium text-destructive">{t("common.delete")}</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
        <View className="mt-4">
          <FileDrop
            upload={(item, onProgress) =>
              attachMutation.mutateAsync({
                uri: item.uri,
                fileName: item.fileName,
                contentType: item.contentType,
                fileSize: item.fileSize,
                onProgress,
              })
            }
            onUploaded={() => void attachmentsQuery.refetch()}
          />
        </View>
      </Card>
    </ScrollView>
  );
}
