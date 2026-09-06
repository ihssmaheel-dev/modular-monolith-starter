import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { mobileTokens } from "@/theme/tokens.generated";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateNoteSchema, noteDetailPath, type CreateNoteDto } from "@repo/contracts";
import { useCreateNoteMutation } from "@/features/notes/notes.mutations";

export default function NewNote() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const colors = mobileTokens[resolvedTheme];
  const form = useForm<CreateNoteDto>({
    resolver: zodResolver(CreateNoteSchema),
    defaultValues: { title: "", content: "" },
  });
  const mutation = useCreateNoteMutation({
    onSuccess: (note) => router.replace(noteDetailPath(note.id) as "/notes/[id]"),
  });

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      className="flex-1"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-2xl font-bold text-foreground">{t("notes.createNote")}</Text>
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-foreground">{t("notes.noteTitle")}</Text>
        <Controller
          control={form.control}
          name="title"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={{ backgroundColor: colors.card }}
              className="rounded-lg border border-border px-3 py-2.5 text-base text-foreground"
              placeholder={t("notes.noteTitlePlaceholder")}
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        {form.formState.errors.title && (
          <Text className="text-xs text-destructive">{form.formState.errors.title.message}</Text>
        )}
      </View>
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-foreground">{t("notes.content")}</Text>
        <Controller
          control={form.control}
          name="content"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={{ backgroundColor: colors.card, minHeight: 180 } as unknown as object}
              className="rounded-lg border border-border px-3 py-2.5 text-base text-foreground"
              placeholder={t("notes.contentPlaceholder")}
              multiline
              numberOfLines={9}
              textAlignVertical="top"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        {form.formState.errors.content && (
          <Text className="text-xs text-destructive">{form.formState.errors.content.message}</Text>
        )}
      </View>
      {mutation.isError && (
        <Text className="text-sm text-destructive">{t("api.note.createFailed")}</Text>
      )}
      <View className="flex-row justify-end gap-2">
        <Pressable
          className="rounded-lg border border-border px-4 py-3"
          onPress={() => router.back()}
        >
          <Text className="font-medium text-foreground">{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
          disabled={mutation.isPending}
          onPress={form.handleSubmit((data) => mutation.mutate(data))}
        >
          <Text className="font-semibold text-primary-foreground">
            {mutation.isPending ? t("notes.creating") : t("notes.createButton")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
