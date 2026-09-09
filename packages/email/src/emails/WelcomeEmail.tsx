import { Body, Button, Container, Head, Html, Preview, Tailwind, Text } from "react-email";
import { emailTokens } from "../styles/tokens";

interface WelcomeEmailProps {
  loginUrl: string;
  preview: string;
  greeting: string;
  body: string;
  buttonText: string;
}

export function WelcomeEmail({ loginUrl, preview, greeting, body, buttonText }: WelcomeEmailProps) {
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
                primaryForeground: emailTokens.light["primary-foreground"],
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
              className="text-[14px] leading-[24px]"
              style={{ color: emailTokens.light.foreground }}
            >
              {greeting}
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
              href={loginUrl}
            >
              {buttonText}
            </Button>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default Object.assign(WelcomeEmail, {
  PreviewProps: {
    loginUrl: "http://localhost:5155/auth",
    preview: "Welcome to Workspace",
    greeting: "Hi Ada,",
    body: "Your workspace is ready. Sign in to capture your first note.",
    buttonText: "Open dashboard",
  } satisfies WelcomeEmailProps,
});
