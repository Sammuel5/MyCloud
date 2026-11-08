export type AccessRole = "owner" | "editor" | "viewer";
export type ItemType = "file" | "folder";
export type FileCategory = "image" | "video" | "audio" | "document" | "archive" | "other";
export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

export interface BaseItemDTO {
  id: string;
  type: ItemType;
  name: string;
  parentId: string | null;
  role: AccessRole;
  isOwner: boolean;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
  ownerName?: string;
}

export interface FileItemDTO extends BaseItemDTO {
  type: "file";
  mimeType: string;
  extension: string;
  size: number;
  checksumSha256?: string;
  category: FileCategory;
  thumbnailStatus: "pending" | "ready" | "failed" | "not_applicable";
  previewKind: PreviewKind;
  mediaMetadata?: {
    width?: number;
    height?: number;
    durationSeconds?: number;
    capturedAt?: string;
    hasExif?: boolean;
    format?: string;
  };
  deletedAt?: string | null;
  uploadedVia?: "web" | "camera";
}

export interface FolderItemDTO extends BaseItemDTO {
  type: "folder";
  deletedAt?: string | null;
}

export type ItemDTO = FileItemDTO | FolderItemDTO;

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface QuotaDTO {
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  warning: "none" | "near" | "full";
  totalDiskBytes: number;
  freeDiskBytes: number;
}

export interface ItemsResponse {
  items: ItemDTO[];
  total: number;
  page: number;
  limit: number;
  breadcrumbs: Breadcrumb[];
  parent: { id: string; name: string; role: AccessRole } | null;
  scope: string;
  quota: QuotaDTO;
}

export interface UploadInitResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  resumed: boolean;
  expiresAt: string;
  filename: string;
  maxUploadBytes: number;
}

export interface UploadCompleteResponse {
  file: FileItemDTO;
  duplicateOf: { id: string; name: string; createdAt: string } | null;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  active: boolean;
  mustChangePassword: boolean;
  storageQuotaBytes: number;
  usedBytes: number;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: "admin" | "user";
    mustChangePassword: boolean;
    createdAt: string;
  };
  appName: string;
  quota: QuotaDTO;
  settings: {
    publicSharingEnabled: boolean;
    allowCameraUpload: boolean;
    trashRetentionDays: number;
  };
}

export interface SessionDTO {
  id: string;
  userAgent: string;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export interface ShareDTO {
  id: string;
  user: { id: string; name: string; email: string };
  role: "viewer" | "editor";
  createdAt: string;
}

export interface ShareLinkDTO {
  id: string;
  hasPassword: boolean;
  expiresAt: string | null;
  allowDownload: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface SharesResponse {
  shares: ShareDTO[];
  links: ShareLinkDTO[];
}

export interface PublicShareInfo {
  type: ItemType;
  name: string;
  size?: number;
  mimeType?: string;
  previewKind?: PreviewKind;
  extension?: string;
  hasThumbnail?: boolean;
  updatedAt: string;
  requiresPassword: boolean;
  allowDownload: boolean;
  expiresAt: string | null;
}

export interface PublicItemDTO {
  id: string;
  type: ItemType;
  name: string;
  parentId: string | null;
  size?: number;
  mimeType?: string;
  extension?: string;
  previewKind?: PreviewKind;
  hasThumbnail: boolean;
  updatedAt: string;
}

export interface OutgoingShareDTO {
  resourceType: ItemType;
  resourceId: string;
  name: string;
  mimeType?: string;
  extension?: string;
  size?: number;
  collaborators: Array<{ id: string; name: string; email: string; role: "viewer" | "editor" }>;
  activeLinkCount: number;
  updatedAt: string;
}

export interface MediaResponse {
  items: FileItemDTO[];
  total: number;
  page: number;
  limit: number;
  kind: "photos" | "videos";
}

export interface DashboardData {
  quota: QuotaDTO;
  appUsedBytes: number;
  trashBytes: number;
  counts: {
    files: number;
    folders: number;
    photos: number;
    videos: number;
    trashItems: number;
    sharedWithMe: number;
    sharedByMe: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
  };
  categories: Array<{
    category: FileCategory;
    bytes: number;
    count: number;
  }>;
  recentUploads: FileItemDTO[];
  largestFiles: FileItemDTO[];
  activity: Array<{ date: string; uploads: number; bytes: number }>;
}

export interface ApiErrorBody {
  error?: string;
  code?: string;
  details?: unknown;
}
