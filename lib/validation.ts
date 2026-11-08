import { z } from "zod";
import { sanitizeDisplayName } from "@/lib/file-names";
import { isDangerousExtension } from "@/lib/mime";

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid identifier");

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(255, "Name is too long")
  .refine((value) => !/[\/\\\u0000-\u001f\u007f]/.test(value), "Name contains invalid characters")
  .refine((value) => value !== "." && value !== "..", "Invalid name")
  .transform((value) => sanitizeDisplayName(value));

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /[0-9]/.test(value), "Password must include a number")
  .refine((value) => /[^A-Za-z0-9]/.test(value), "Password must include a symbol");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const createFolderSchema = z.object({
  name: nameSchema,
  parentId: objectIdSchema.nullish(),
});

export const updateItemSchema = z
  .object({
    name: nameSchema.optional(),
    parentId: objectIdSchema.nullish(),
  })
  .refine((value) => value.name !== undefined || value.parentId !== undefined, {
    message: "No changes supplied",
  });

export const uploadInitSchema = z.object({
  filename: nameSchema,
  size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  mimeType: z.string().trim().max(200).optional().default("application/octet-stream"),
  parentId: objectIdSchema.nullish(),
  fingerprint: z.string().trim().min(1).max(256),
});

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["admin", "user"]).default("user"),
  quotaBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});

export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(["admin", "user"]).optional(),
    active: z.boolean().optional(),
    quotaBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    newPassword: passwordSchema.optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No changes supplied" });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const shareSchema = z.object({
  resourceType: z.enum(["file", "folder"]),
  resourceId: objectIdSchema,
  email: emailSchema,
  role: z.enum(["viewer", "editor"]),
});

export const publicLinkSchema = z.object({
  resourceType: z.enum(["file", "folder"]),
  resourceId: objectIdSchema,
  password: z.string().min(8, "Link password must be at least 8 characters").max(128).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  allowDownload: z.boolean().default(true),
});

export const unlockSchema = z.object({
  password: z.string().min(1).max(128),
});

export const batchActionSchema = z.object({
  action: z.enum(["trash", "restore", "permanent", "move", "star", "unstar"]),
  items: z
    .array(z.object({ type: z.enum(["file", "folder"]), id: objectIdSchema }))
    .min(1)
    .max(200),
  parentId: objectIdSchema.nullish(),
});

export const settingsSchema = z.object({
  publicSharingEnabled: z.boolean().optional(),
  trashRetentionDays: z.number().int().min(1).max(3650).optional(),
  allowCameraUpload: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const renameExtensionSchema = z
  .string()
  .refine((extension) => !extension || !isDangerousExtension(extension), "File type is not allowed");

export const itemsQuerySchema = z.object({
  scope: z
    .enum(["drive", "starred", "recent", "search", "trash", "shared-with-me"])
    .default("drive"),
  parentId: objectIdSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(["name", "date", "size", "type"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  category: z
    .enum(["all", "image", "video", "audio", "document", "archive", "other"])
    .default("all"),
  q: z.string().trim().max(200).optional(),
});

export const mediaQuerySchema = z.object({
  kind: z.enum(["photos", "videos"]).default("photos"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

export const copyItemSchema = z.object({
  parentId: objectIdSchema.nullish(),
});

export const batchMoveSchema = z.object({
  parentId: objectIdSchema.nullish(),
});

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(),
  role: z.enum(["admin", "user"]).optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().trim().max(100).optional(),
  severity: z.enum(["info", "warning", "security"]).optional(),
  actorId: objectIdSchema.optional(),
});

export const folderTreeQuerySchema = z.object({
  exclude: objectIdSchema.optional(),
});

export const publicFolderQuerySchema = z.object({
  folderId: objectIdSchema.optional(),
});
