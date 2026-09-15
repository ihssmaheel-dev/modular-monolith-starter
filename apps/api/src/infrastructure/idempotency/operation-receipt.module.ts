import { Global, Module } from "@nestjs/common";

import { OperationReceiptRepository } from "./operation-receipt.repository";
import { OperationReceiptRetentionWorker } from "./operation-receipt-retention.worker";
import { OperationReceiptService } from "./operation-receipt.service";

@Global()
@Module({
  providers: [OperationReceiptRepository, OperationReceiptService, OperationReceiptRetentionWorker],
  exports: [OperationReceiptService],
})
export class OperationReceiptModule {}
