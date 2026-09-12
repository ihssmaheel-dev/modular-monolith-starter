export interface UserDeletedEventPayload {
  userId: string;
}

export interface UserUpdatedEventPayload {
  userId: string;
  changes: Record<string, unknown>;
}
