import { Body, Button, Container, Head, Html, Preview, Tailwind, Text } from "react-email";
import { emailTokens } from "../styles/tokens";

interface OrganizationInvitationEmailProps {
  acceptUrl: string;
  preview: string;
  heading: string;
  body: string;
  buttonText: string;
}

export function OrganizationInvitationEmail({
  acceptUrl,
  preview,
  heading,
  body,
  buttonText,
}: OrganizationInvitationEmailProps) {
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
            <Text
              className="text-[18px] leading-[28px] font-semibold"
              style={{ color: emailTokens.light.foreground }}
            >
              {heading}
            </Text>
            <Text
              className="text-[14px] leading-[24px]"
              style={{ color: emailTokens.light.foreground }}
            >
              {body}
            </Text>
            <Button
              className="rounded text-[12px] font-semibold no-underline text-center px-4 py-3"
              style={{
                backgroundColor: emailTokens.light.primary,
                color: emailTokens.light["primary-foreground"],
              }}
              href={acceptUrl}
            >
              {buttonText}
            </Button>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default Object.assign(OrganizationInvitationEmail, {
  PreviewProps: {
    acceptUrl: "http://localhost:5155/accept-invitation?token=preview-token",
    preview: "Ada invited you to join Acme",
    heading: "Ada invited you to join Acme",
    body: "Accept the invitation to collaborate on notes, files, and digests.",
    buttonText: "Accept invitation",
  } satisfies OrganizationInvitationEmailProps,
});
