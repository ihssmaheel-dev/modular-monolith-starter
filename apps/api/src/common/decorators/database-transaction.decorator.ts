import { SetMetadata } from "@nestjs/common";

export const NO_DATABASE_TRANSACTION_KEY = "no_database_transaction";

/** Marks handlers whose slow or external work must not hold a database connection. */
export const NoDatabaseTransaction = () => SetMetadata(NO_DATABASE_TRANSACTION_KEY, true);
