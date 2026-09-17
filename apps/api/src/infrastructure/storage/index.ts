export { StorageModule } from "./storage.module";
export { StorageService } from "./storage.service";
export {
  FileScannerService,
  type FileScanResult,
  type FileScanError,
} from "./scanner/file-scanner.service";
export {
  detectStorageProvider,
  type StorageProvider,
  STORAGE_PROVIDERS,
} from "./providers/storage-provider.detector";
export type {
  StorageDriver,
  StorageError,
  UploadResult,
  FileInput,
  StoredObjectMetadata,
} from "./storage.types";
export { UPLOAD_PRESIGN_TTL_SECONDS, DOWNLOAD_PRESIGN_TTL_SECONDS } from "./storage.types";
