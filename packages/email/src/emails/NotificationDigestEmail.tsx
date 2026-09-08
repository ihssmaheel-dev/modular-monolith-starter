import { Body, Container, Head, Heading, Html, Preview, Tailwind, Text } from "react-email";
import { emailTokens } from "../styles/tokens";

export interface DigestEmailItem {
  title: string;
}

export interface NotificationDigestEmailProps {
  preview: string;
  heading: string;
  items: DigestEmailItem[];
  count: number;
  overflowText: string | null;
  footer: string;
}

const MAX_DETAILED_ITEMS = 3;
const MAX_HEADLINE_ITEMS = 10;

/**
 * Tiered digest rendering: 1–3 items emphasized, 4–10 headlines,
 * 11+ top items plus a count line. One template serves single sends
 * (count = 1) and digests alike.
 */
export function NotificationDigestEmail({
  preview,
  heading,
  items,
  count,
  overflowText,
  footer,
}: NotificationDigestEmailProps) {
  const detailed = items.slice(0, MAX_DETAILED_ITEMS);
  const headlines = items.slice(MAX_DETAILED_ITEMS, MAX_HEADLINE_ITEMS);
  const overflow = count - detailed.length - headlines.length;
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                border: emailTokens.light.border,
                primary: emailTokens.light.primary,
              },
            },
          },
        }}
      >
        <Body className="bg-white my-auto mx-auto font-sans">
          <Container
            className="border border-solid rounded my-[40px] mx-auto p-[20px] w-[465px]"
            style={{ borderColor: emailTokens.light.border }}
          >
            <Heading
              className="text-[18px] leading-[28px] font-semibold"
              style={{ color: emailTokens.light.foreground }}
            >
              {heading}
            </Heading>
            {detailed.map((item, index) => (
              <Text
                key={`detail-${index}`}
                className="text-[14px] leading-[24px] font-semibold"
                style={{ color: emailTokens.light.foreground }}
              >
                {item.title}
              </Text>
            ))}
            {headlines.map((item, index) => (
              <Text
                key={`headline-${index}`}
                className="text-[14px] leading-[24px]"
                style={{ color: emailTokens.light.foreground }}
              >
                • {item.title}
              </Text>
            ))}
            {overflow > 0 && overflowText ? (
              <Text
                className="text-[14px] leading-[24px] font-semibold"
                style={{ color: emailTokens.light.foreground }}
              >
                {overflowText}
              </Text>
            ) : null}
            <Text
              className="text-[12px] leading-[20px]"
              style={{ color: emailTokens.light["muted-foreground"] }}
            >
              {footer}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
