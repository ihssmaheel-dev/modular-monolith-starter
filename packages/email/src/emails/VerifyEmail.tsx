import { Body, Button, Container, Head, Heading, Html, Preview, Tailwind, Text } from "react-email";
import { emailTokens } from "../styles/tokens";

interface VerifyEmailProps {
  verifyLink: string;
  preview: string;
  heading: string;
  body: string;
  buttonText: string;
}

export const VerifyEmail = ({
  verifyLink,
  preview,
  heading,
  body,
  buttonText,
}: VerifyEmailProps) => {
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
              href={verifyLink}
            >
              {buttonText}
            </Button>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

Object.assign(VerifyEmail, {
  PreviewProps: {
    verifyLink: "http://localhost:5155/verify-email?token=preview-token",
    preview: "Verify your email address",
    heading: "Verify your email address",
    body: "Click the button below to verify your email address. This link expires in 24 hours.",
    buttonText: "Verify email",
  } satisfies VerifyEmailProps,
});

export default VerifyEmail;
