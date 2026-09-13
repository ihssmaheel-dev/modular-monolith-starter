import { Module } from "@nestjs/common";
import { AiController } from "./presentation/controllers/ai.controller";
import { AiInfrastructureModule } from "../../infrastructure/ai/ai.module";

@Module({
  imports: [AiInfrastructureModule],
  controllers: [AiController],
  providers: [AiController],
  exports: [AiController],
})
export class AiModule {}
