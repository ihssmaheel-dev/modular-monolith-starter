import { z } from "zod";

export const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(32).max(256),
});

export const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(["admin", "user"]),
    avatarFileId: z.string().nullable(),
  }),
});

export const CurrentUserResponseSchema = z.object({
  user: AuthResponseSchema.shape.user,
});

export const RegisterResponseSchema = z.object({
  user: AuthResponseSchema.shape.user,
  requiresEmailVerification: z.literal(true),
});

export const MessageResponseSchema = z.object({
  message: z.string(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
