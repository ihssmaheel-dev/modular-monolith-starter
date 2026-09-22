export interface FileEntity {
  id: string;
  tenantId?: string;
  key: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  bucket: string;
  parentId?: string;
  parentType: "note" | "user" | "general";
  slot?: string | null;
  uploadedBy: string;
  status: "pending" | "uploading" | "scanning" | "uploaded" | "failed";
  activeKey?: string;
  scanClaimToken?: string;
  scanLeaseExpiresAt?: Date;
  scanAttempts?: number;
  scanNextAttemptAt?: Date;
  scanFailureCode?: string;
  scanSourceEtag?: string;
  scanSourceVersionId?: string;
  scanCandidateKeys?: string[];
  createdAt: Date;
  updatedAt: Date;
}
