import { Module, Global } from "@nestjs/common";
import { RedisService } from "./redis.service";
import { RedisLockService } from "./redis-lock.service";

@Global()
@Module({
  providers: [RedisService, RedisLockService],
  exports: [RedisService, RedisLockService],
})
export class RedisModule {}
