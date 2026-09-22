import { SetMetadata } from "@nestjs/common";

export const DATABASE_TRANSACTION_KEY = "database_transaction";
export const NO_DATABASE_TRANSACTION_KEY = "no_database_transaction";

/** Opts a short, SQL-only HTTP handler into one request transaction. */
export const DatabaseTransaction = () => SetMetadata(DATABASE_TRANSACTION_KEY, true);

/** Explicitly overrides a class-level transaction for a slow/external-I/O handler. */
export const NoDatabaseTransaction = () => SetMetadata(NO_DATABASE_TRANSACTION_KEY, true);
