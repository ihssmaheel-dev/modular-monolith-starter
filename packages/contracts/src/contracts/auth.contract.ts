import { oc } from "@orpc/contract";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  RefreshTokenSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
  AuthResponseSchema,
  CurrentUserResponseSchema,
  MessageResponseSchema,
  RegisterResponseSchema,
} from "../schemas/auth.schema";

export const authContract = oc.prefix("/auth").router({
  register: oc
    .route({
      method: "POST",
      path: "/register",
      summary: "Register a new user",
      successStatus: 201,
    })
    .input(RegisterSchema)
    .output(RegisterResponseSchema),
  login: oc
    .route({ method: "POST", path: "/login", summary: "Log in an existing user" })
    .input(LoginSchema)
    .output(AuthResponseSchema),
  logout: oc
    .route({ method: "POST", path: "/logout", summary: "Log out user" })
    .output(MessageResponseSchema),
  me: oc
    .route({ method: "GET", path: "/me", summary: "Get the current authenticated user" })
    .output(CurrentUserResponseSchema),
  refresh: oc
    .route({ method: "POST", path: "/refresh", summary: "Refresh access token" })
    .input(RefreshTokenSchema)
    .output(AuthResponseSchema),
  forgotPassword: oc
    .route({ method: "POST", path: "/forgot-password", summary: "Request password reset" })
    .input(ForgotPasswordSchema)
    .output(MessageResponseSchema),
  resetPassword: oc
    .route({ method: "POST", path: "/reset-password", summary: "Reset user password" })
    .input(ResetPasswordSchema)
    .output(MessageResponseSchema),
  verifyEmail: oc
    .route({ method: "POST", path: "/verify-email", summary: "Verify email address" })
    .input(VerifyEmailSchema)
    .output(AuthResponseSchema),
  resendVerification: oc
    .route({ method: "POST", path: "/resend-verification", summary: "Resend verification email" })
    .input(ResendVerificationSchema)
    .output(MessageResponseSchema),
});
