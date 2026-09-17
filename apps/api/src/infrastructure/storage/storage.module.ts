import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { FileScannerService } from "./scanner/file-scanner.service";

@Global()
@Module({
  providers: [StorageService, FileScannerService],
  exports: [StorageService, FileScannerService],
})
export class StorageModule {}
