export function emailIdentityLockKey(email: string): string {
  return `user-email:${email.trim().toLowerCase()}`;
}
