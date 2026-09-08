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
  const shown = Math.min(renderedItems.length, 10);
  const overflow = input.count - shown;
  return render(
    React.createElement(NotificationDigestEmail, {
      preview: input.subject,
      heading: input.translate("notifications.digestHeading", { count: input.count }),
      items: renderedItems,
      count: input.count,
      overflowText:
        overflow > 0 ? input.translate("notifications.digestMore", { count: overflow }) : null,
      footer: input.translate("notifications.digestFooter"),
    }),
  );
}
