# 0054. SecureStore (not AsyncStorage) for mobile credentials

- **Status:** accepted
- **Date:** 2026-09-11
- **Scope:** mobile
- **Backfilled:** yes — reconstructed from `secure-storage.ts` and the persisted stores.

## Context

Mobile auth state must survive restarts without sitting in plaintext. AsyncStorage is unencrypted file storage — convenient and wrong for secrets.

## Decision

`expo-secure-store` (Keychain/Keystore-backed) backs every persisted mobile store via one `secure-storage.ts` adapter. Tokens never touch AsyncStorage or logs. Tests drive the same surface through an in-memory double (`native-state.ts`), never the real store.

## Consequences

Gain: hardware-backed secrets on both platforms; one seam to audit, one seam to mock. Pay: async-only API (no synchronous reads at startup) and Keychain/Keystore quirks across OS versions to absorb in one place.

## Alternatives considered

- AsyncStorage: rejected, plaintext on device, fails any serious security review.
- Bare Keychain/Keystore bridges: rejected, SecureStore already wraps both with an Expo-maintained API.
