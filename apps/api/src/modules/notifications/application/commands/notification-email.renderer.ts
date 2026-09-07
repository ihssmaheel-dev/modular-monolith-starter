import * as React from "react";
import { NotificationDigestEmail, render } from "@repo/email";

export interface RendererItem {
  titleKey: string;
  titleParams?: Record<string, unknown>;
}

/**
 * Renders notification email HTML through the shared digest template.
 * Titles arrive pre-translated so the renderer stays locale-free.
 */
export async function renderNotificationEmail(input: {
  subject: string;
  items: Array<{ titleKey: string; titleParams?: Record<string, unknown> }>;
  count: number;
  translate: (key: string, params?: Record<string, unknown>) => string;
}): Promise<string> {
  const renderedItems = input.items.map((item) => ({
    title: input.translate(item.titleKey, item.titleParams),
  }));
  return render(
    React.createElement(NotificationDigestEmail, {
      preview: input.subject,
      heading: input.translate("notifications.digestHeading", { count: input.count }),
      items: renderedItems,
      count: input.count,
      footer: input.translate("notifications.digestFooter"),
    }),
  );
}
