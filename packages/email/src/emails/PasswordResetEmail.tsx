import { Body, Button, Container, Head, Html, Preview, Tailwind, Text } from "react-email";
import { emailTokens } from "../styles/tokens";

interface PasswordResetEmailProps {
  resetLink: string;
  preview: string;
  requestText: string;
  instructionText: string;
  buttonText: string;
}

export const PasswordResetEmail = ({
  resetLink,
  preview,
  requestText,
  instructionText,
  buttonText,
}: PasswordResetEmailProps) => {
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
              className="text-[14px] leading-[24px]"
              style={{ color: emailTokens.light.foreground }}
            >
              {requestText}
            </Text>
            <Text
              className="text-[14px] leading-[24px]"
              style={{ color: emailTokens.light.foreground }}
            >
              {instructionText}
            </Text>
            <Button
              className="rounded text-[12px] font-semibold no-underline text-center px-4 py-3"
              style={{
                backgroundColor: emailTokens.light.primary,
                color: emailTokens.light["primary-foreground"],
              }}
              href={resetLink}
            >
              {buttonText}
            </Button>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

Object.assign(PasswordResetEmail, {
  PreviewProps: {
    resetLink: "http://localhost:5173/auth/reset-password?token=preview-token",
    preview: "Reset your Workspace password",
    requestText: "We received a request to reset your password.",
    instructionText: "The link below expires in 30 minutes. Ignore this email if that was not you.",
    buttonText: "Reset password",
  } satisfies PasswordResetEmailProps,
});

export default PasswordResetEmail;
