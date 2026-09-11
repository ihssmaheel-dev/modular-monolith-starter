import { NestFactory } from "@nestjs/core";
import { hash } from "@node-rs/argon2";
import { env } from "../config/env";
import { PinoLoggerService } from "../infrastructure/logger/logger.service";
import { UsersRepository } from "../modules/users/infrastructure/users.repository";
import { SeedModule } from "./seed.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule);
  const logger = app.get(PinoLoggerService).child({ module: "DatabaseSeed" });

  try {
    if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
      logger.warn({}, "Administrative seed credentials are not configured; skipping");
      return;
    }

    const repository = app.get(UsersRepository);
    const existing = await repository.findOne({ email: env.SEED_ADMIN_EMAIL });
    if (existing.isOk() && existing.value) {
      logger.info({ email: env.SEED_ADMIN_EMAIL }, "Administrative user already exists");
      return;
    }

    const passwordHash = await hash(env.SEED_ADMIN_PASSWORD);
    const result = await repository.create({
      email: env.SEED_ADMIN_EMAIL,
      name: "System Admin",
      passwordHash,
      role: "admin",
      emailVerifiedAt: new Date(),
    });
    if (result.isErr()) {
      process.exitCode = 1;
      logger.error({}, "Administrative user could not be created");
      return;
    }
    logger.info({ userId: result.value.id }, "Administrative user created");
  } catch (error) {
    process.exitCode = 1;
    const details =
      error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : { error: JSON.stringify(error) };
    logger.error(details, "Database seed failed");
  } finally {
    await app.close();
  }
}

void bootstrap();
