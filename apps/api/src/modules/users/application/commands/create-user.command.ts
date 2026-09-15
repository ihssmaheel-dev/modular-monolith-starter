import { Injectable } from "@nestjs/common";
import { CreateUserSchema } from "@repo/contracts";
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n";
import { hash } from "@node-rs/argon2";
import { err, ok, Result } from "neverthrow";
import { z } from "zod";
import {
  DatabaseService,
  isPostgresUniqueViolation,
  type TransactionError,
} from "../../../../infrastructure/database";
import { emailIdentityLockKey } from "../../../../common/utils/lock-keys.utils";
import { OutboxService } from "../../../../infrastructure/outbox/outbox.service";
import { User } from "../../domain/entities/user.entity";
import { EmailTaken } from "../../domain/errors/user.errors";
import { UserCreatedEvent } from "../../domain/events/user.events";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { GetUserByEmailQuery } from "../queries/get-user-by-email.query";

@Injectable()
export class CreateUserCommand {
  constructor(
    private readonly repository: UsersRepository,
    private readonly getUserByEmail: GetUserByEmailQuery,
    private readonly databaseService: DatabaseService,
    private readonly outboxService: OutboxService,
  ) {}

  async execute(
    data: z.infer<typeof CreateUserSchema>,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<Result<User, EmailTaken | TransactionError>> {
    const normalized = { ...data, email: data.email.trim().toLowerCase() };
    const passwordHash = await hash(data.password);
    return this.databaseService.withResultTransaction<User, EmailTaken | TransactionError>(() =>
      this.databaseService.withAdvisoryLock(emailIdentityLockKey(normalized.email), () =>
        this.persist(normalized, passwordHash, locale),
      ),
    );
  }

  private async persist(
    data: z.infer<typeof CreateUserSchema>,
    passwordHash: string,
    locale: Locale,
  ): Promise<Result<User, EmailTaken | TransactionError>> {
    const existing = await this.getUserByEmail.execute(data.email);
    const pending = await this.repository.findOne({ pendingEmail: data.email });
    if (existing.isErr() || pending.isErr()) return err(this.transactionError());
    if (existing.value || pending.value) return err({ type: "EMAIL_TAKEN", email: data.email });
    try {
      const created = await this.repository.create({
        email: data.email,
        name: data.name,
        passwordHash,
        role: "user",
      });
      if (created.isErr()) return err(this.transactionError());

      const user = created.value;
      const event = new UserCreatedEvent(user.id, user.email, user.name, locale);
      const dispatched = await this.outboxService.dispatchGlobal("user.created", event);
      if (dispatched.isErr()) return err(this.transactionError());
      return ok(user);
    } catch (error) {
      if (isPostgresUniqueViolation(error)) return err({ type: "EMAIL_TAKEN", email: data.email });
      return err(this.transactionError());
    }
  }

  private transactionError(): TransactionError {
    return { type: "TRANSACTION_FAILED" };
  }
}
