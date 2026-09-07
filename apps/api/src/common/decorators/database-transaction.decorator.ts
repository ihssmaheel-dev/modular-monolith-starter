import { SetMetadata } from "@nestjs/common";

export const NO_DATABASE_TRANSACTION_KEY = "no_database_transaction";

/** Marks long-lived HTTP streams that must not hold a database connection. */
export const NoDatabaseTransaction = () => SetMetadata(NO_DATABASE_TRANSACTION_KEY, true);
