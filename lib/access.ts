import { Types } from "mongoose";
import { Folder } from "@/models/Folder";
import { File, type IFile } from "@/models/File";
import { Share } from "@/models/Share";
import type { IFolder } from "@/models/Folder";
import { ApiError } from "@/lib/request";
import type { AccessRole, ItemType } from "@/lib/types";

const ROLE_RANK: Record<AccessRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function maxRole(...roles: Array<AccessRole | null | undefined>): AccessRole | null {
  let result: AccessRole | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (!result || ROLE_RANK[role] > ROLE_RANK[result]) result = role;
  }
  return result;
}

export function roleAtLeast(role: AccessRole | null, minimum: AccessRole): boolean {
  return Boolean(role && ROLE_RANK[role] >= ROLE_RANK[minimum]);
}

export function mapFolderRoleToChild(role: AccessRole | null): AccessRole | null {
  if (!role) return null;
  return role === "owner" ? "editor" : role;
}

function idEquals(a: Types.ObjectId | string, b: Types.ObjectId | string): boolean {
  return a.toString() === b.toString();
}

export async function getFolderRole(
  userId: string,
  folder: Pick<IFolder, "_id" | "owner" | "ancestorIds"> & { deletedAt?: Date | null }
): Promise<AccessRole | null> {
  if (folder.deletedAt) return null;
  if (idEquals(folder.owner, userId)) return "owner";

  const relevantFolderIds = [folder._id, ...folder.ancestorIds];
  const shares = await Share.find({
    resourceType: "folder",
    resourceId: { $in: relevantFolderIds },
    sharedWith: userId,
  })
    .select("resourceId role")
    .lean();

  let role: AccessRole | null = null;
  for (const share of shares) {
    if (idEquals(share.resourceId, folder._id)) {
      role = maxRole(role, share.role);
    } else {
      role = maxRole(role, mapFolderRoleToChild(share.role));
    }
  }

  if (folder.ancestorIds.length > 0) {
    const ownedAncestor = await Folder.exists({
      _id: { $in: folder.ancestorIds },
      owner: userId,
      deletedAt: null,
    });
    if (ownedAncestor) role = maxRole(role, "editor");
  }

  return role;
}

export async function getFileRole(
  userId: string,
  file: Pick<IFile, "_id" | "owner" | "parentId"> & { deletedAt?: Date | null }
): Promise<AccessRole | null> {
  if (file.deletedAt) return null;
  if (idEquals(file.owner, userId)) return "owner";

  let role: AccessRole | null = null;
  const fileShare = await Share.findOne({
    resourceType: "file",
    resourceId: file._id,
    sharedWith: userId,
  })
    .select("role")
    .lean();
  if (fileShare) role = maxRole(role, fileShare.role);

  if (file.parentId) {
    const parent = await Folder.findOne({ _id: file.parentId, deletedAt: null }).lean();
    if (!parent) return role;
    const folderRole = await getFolderRole(userId, parent);
    role = maxRole(role, mapFolderRoleToChild(folderRole));
  }

  return role;
}

export interface AccessedItem<T> {
  item: T;
  role: AccessRole;
}

export async function getFolderWithAccess(
  userId: string,
  folderId: string,
  includeDeleted = false
): Promise<AccessedItem<IFolder> | null> {
  const folder = await Folder.findOne({
    _id: folderId,
    ...(includeDeleted ? {} : { deletedAt: null }),
  }).lean();
  if (!folder) return null;
  if (includeDeleted && folder.deletedAt) {
    if (folder.owner.toString() === userId || folder.deletedBy?.toString() === userId) {
      return { item: folder, role: folder.owner.toString() === userId ? "owner" : "editor" };
    }
    return null;
  }
  const role = await getFolderRole(userId, folder);
  return role ? { item: folder, role } : null;
}

export async function getFileWithAccess(
  userId: string,
  fileId: string,
  includeDeleted = false
): Promise<AccessedItem<IFile> | null> {
  const file = await File.findOne({
    _id: fileId,
    ...(includeDeleted ? {} : { deletedAt: null }),
  }).lean();
  if (!file) return null;
  if (includeDeleted && file.deletedAt) {
    if (file.owner.toString() === userId || file.deletedBy?.toString() === userId) {
      return { item: file, role: file.owner.toString() === userId ? "owner" : "editor" };
    }
    return null;
  }
  const role = await getFileRole(userId, file);
  return role ? { item: file, role } : null;
}

export interface RequireAccessOptions {
  includeDeleted?: boolean;
  minRole?: AccessRole;
  notFoundMessage?: string;
}

export async function requireItemAccess(
  userId: string,
  type: ItemType,
  id: string,
  options: RequireAccessOptions = {}
): Promise<{ item: IFile | IFolder; role: AccessRole; type: ItemType }> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid item identifier", "INVALID_ID");
  }
  const minRole = options.minRole || "viewer";
  const found =
    type === "file"
      ? await getFileWithAccess(userId, id, options.includeDeleted)
      : await getFolderWithAccess(userId, id, options.includeDeleted);

  if (!found) {
    throw new ApiError(404, options.notFoundMessage || "Item not found", "NOT_FOUND");
  }
  if (!roleAtLeast(found.role, minRole)) {
    throw new ApiError(403, "You do not have permission to do that", "FORBIDDEN");
  }
  return { item: found.item, role: found.role, type };
}

export interface FolderBreadcrumb {
  id: string;
  name: string;
}

export async function getFolderBreadcrumbs(folder: IFolder): Promise<FolderBreadcrumb[]> {
  if (folder.ancestorIds.length === 0) {
    return [{ id: folder._id.toString(), name: folder.name }];
  }
  const ancestors = await Folder.find({
    _id: { $in: [...folder.ancestorIds, folder._id] },
    deletedAt: null,
  })
    .select("_id name")
    .lean();
  const byId = new Map(ancestors.map((item) => [item._id.toString(), item.name]));
  const ordered: FolderBreadcrumb[] = [];
  for (const id of [...folder.ancestorIds, folder._id]) {
    const name = byId.get(id.toString());
    if (name) ordered.push({ id: id.toString(), name });
  }
  return ordered;
}

/**
 * Breadcrumbs for display. Ancestors above a directly shared folder are not
 * accessible to the recipient, so never reveal their names or link to them.
 */
export async function getAccessibleBreadcrumbs(
  userId: string,
  folder: IFolder
): Promise<FolderBreadcrumb[]> {
  const crumbs = await getFolderBreadcrumbs(folder);
  if (crumbs.length <= 1) return crumbs;
  const access = await Promise.all(
    crumbs.map((crumb) => getFolderWithAccess(userId, crumb.id))
  );
  const firstAccessible = access.findIndex((entry) => Boolean(entry));
  return firstAccessible <= 0 ? crumbs : crumbs.slice(firstAccessible);
}

export async function getFolderPathIds(folder: IFolder): Promise<Types.ObjectId[]> {
  return [...folder.ancestorIds, folder._id];
}

export async function isFolderDescendantOf(
  candidateId: string | Types.ObjectId,
  ancestorId: string | Types.ObjectId
): Promise<boolean> {
  if (candidateId.toString() === ancestorId.toString()) return true;
  const exists = await Folder.exists({
    _id: candidateId,
    ancestorIds: new Types.ObjectId(ancestorId.toString()),
  });
  return Boolean(exists);
}

export async function getSharedFolderIdsForUser(userId: string): Promise<Types.ObjectId[]> {
  const sharedRoots = await Share.find({ sharedWith: userId, resourceType: "folder" })
    .distinct("resourceId");
  if (sharedRoots.length === 0) return [];
  return Folder.find({
    deletedAt: null,
    $or: [{ _id: { $in: sharedRoots } }, { ancestorIds: { $in: sharedRoots } }],
  }).distinct("_id");
}

export async function getDirectSharedFileIds(userId: string): Promise<Types.ObjectId[]> {
  return Share.find({ sharedWith: userId, resourceType: "file" }).distinct("resourceId");
}

export interface AccessibleQueryContext {
  accessibleFolderIds: Types.ObjectId[];
  directSharedFileIds: Types.ObjectId[];
  fileFilter: Record<string, unknown>;
  folderFilter: Record<string, unknown>;
}

/**
 * Builds Mongo filters for content the user can browse. All operations still
 * re-check access before returning content or mutating anything.
 */
export async function getAccessibleQueryContext(userId: string): Promise<AccessibleQueryContext> {
  const ownedFolders = await Folder.find({ owner: userId, deletedAt: null }).distinct("_id");
  const sharedRoots = await Share.find({ sharedWith: userId, resourceType: "folder" }).distinct(
    "resourceId"
  );
  const seeds = [...ownedFolders, ...sharedRoots];
  let accessibleFolderIds: Types.ObjectId[] = [];
  if (seeds.length > 0) {
    accessibleFolderIds = await Folder.find({
      deletedAt: null,
      $or: [{ _id: { $in: seeds } }, { ancestorIds: { $in: seeds } }],
    }).distinct("_id");
  }
  const directSharedFileIds = await getDirectSharedFileIds(userId);

  return {
    accessibleFolderIds,
    directSharedFileIds,
    fileFilter: {
      $or: [
        { owner: new Types.ObjectId(userId) },
        { parentId: { $in: accessibleFolderIds } },
        { _id: { $in: directSharedFileIds } },
      ],
    },
    folderFilter: {
      $or: [
        { owner: new Types.ObjectId(userId) },
        { _id: { $in: accessibleFolderIds } },
      ],
    },
  };
}

/**
 * Resolves effective roles for a page of items with a bounded number of DB
 * queries, avoiding one permission query per row.
 */
export async function resolveItemRoles(
  userId: string,
  folders: IFolder[],
  files: IFile[]
): Promise<Map<string, AccessRole>> {
  const result = new Map<string, AccessRole>();
  const parentFileIds = files
    .map((file) => file.parentId)
    .filter((id): id is Types.ObjectId => Boolean(id));
  const initialFolderIds = new Set<string>();
  for (const folder of folders) {
    initialFolderIds.add(folder._id.toString());
    for (const ancestor of folder.ancestorIds) initialFolderIds.add(ancestor.toString());
  }
  for (const id of parentFileIds) initialFolderIds.add(id.toString());

  if (initialFolderIds.size === 0) {
    for (const file of files) {
      result.set(
        `file:${file._id}`,
        file.owner.toString() === userId ? "owner" : "viewer"
      );
    }
    return result;
  }

  const folderDocs = await Folder.find({ _id: { $in: [...initialFolderIds] } })
    .select("_id owner ancestorIds deletedAt")
    .lean();
  const folderById = new Map(folderDocs.map((folder) => [folder._id.toString(), folder]));

  // A file's parent was loaded above; include every ancestor document so
  // inherited shares and ownership can be evaluated in one pass.
  const allFolderIds = new Set(initialFolderIds);
  for (const doc of folderDocs) {
    for (const ancestor of doc.ancestorIds) allFolderIds.add(ancestor.toString());
  }
  let missingAncestors = [...allFolderIds].filter((id) => !folderById.has(id));
  if (missingAncestors.length > 0) {
    const extra = await Folder.find({ _id: { $in: missingAncestors } })
      .select("_id owner ancestorIds deletedAt")
      .lean();
    for (const doc of extra) {
      folderById.set(doc._id.toString(), doc);
      for (const ancestor of doc.ancestorIds) {
        allFolderIds.add(ancestor.toString());
      }
    }
    missingAncestors = [...allFolderIds].filter((id) => !folderById.has(id));
    if (missingAncestors.length > 0) {
      const remaining = await Folder.find({ _id: { $in: missingAncestors } })
        .select("_id owner ancestorIds deletedAt")
        .lean();
      for (const doc of remaining) folderById.set(doc._id.toString(), doc);
    }
  }

  const allFolderObjectIds = [...allFolderIds].filter((id) => Types.ObjectId.isValid(id));
  const folderShares = await Share.find({
    sharedWith: userId,
    resourceType: "folder",
    resourceId: { $in: allFolderObjectIds },
  })
    .select("resourceId role")
    .lean();
  const directFolderRole = new Map<string, AccessRole>();
  for (const share of folderShares) {
    const key = share.resourceId.toString();
    directFolderRole.set(key, maxRole(directFolderRole.get(key), share.role) as AccessRole);
  }

  const fileShares = files.length
    ? await Share.find({
        sharedWith: userId,
        resourceType: "file",
        resourceId: { $in: files.map((file) => file._id) },
      })
        .select("resourceId role")
        .lean()
    : [];
  const directFileRole = new Map<string, AccessRole>();
  for (const share of fileShares) {
    directFileRole.set(share.resourceId.toString(), share.role);
  }

  const folderRoleCache = new Map<string, AccessRole | null>();
  const resolveFolderRole = (folderId: string): AccessRole | null => {
    if (folderRoleCache.has(folderId)) return folderRoleCache.get(folderId) ?? null;
    const folder = folderById.get(folderId);
    if (!folder || folder.deletedAt) {
      folderRoleCache.set(folderId, null);
      return null;
    }
    if (folder.owner.toString() === userId) {
      folderRoleCache.set(folderId, "owner");
      return "owner";
    }
    let role: AccessRole | null = directFolderRole.get(folderId) || null;
    for (const ancestorId of folder.ancestorIds) {
      const ancestor = folderById.get(ancestorId.toString());
      if (!ancestor || ancestor.deletedAt) continue;
      const ancestorShareRole = directFolderRole.get(ancestorId.toString());
      role = maxRole(role, mapFolderRoleToChild(ancestorShareRole ?? null));
      if (ancestor.owner.toString() === userId) role = maxRole(role, "editor");
    }
    folderRoleCache.set(folderId, role);
    return role;
  };

  for (const folder of folders) {
    const role = resolveFolderRole(folder._id.toString());
    if (role) result.set(`folder:${folder._id}`, role);
  }
  for (const file of files) {
    if (file.owner.toString() === userId) {
      result.set(`file:${file._id}`, "owner");
      continue;
    }
    let role: AccessRole | null = directFileRole.get(file._id.toString()) || null;
    if (file.parentId) {
      role = maxRole(role, mapFolderRoleToChild(resolveFolderRole(file.parentId.toString())));
    }
    if (role) result.set(`file:${file._id}`, role);
  }

  return result;
}

export async function getStarredIds(
  userId: string,
  files: IFile[],
  folders: IFolder[]
): Promise<Set<string>> {
  const fileIds = files.map((file) => file._id);
  const folderIds = folders.map((folder) => folder._id);
  if (fileIds.length === 0 && folderIds.length === 0) return new Set();
  const { Star } = await import("@/models/Star");
  const stars = await Star.find({
    userId,
    $or: [
      { itemType: "file", itemId: { $in: fileIds } },
      { itemType: "folder", itemId: { $in: folderIds } },
    ],
  })
    .select("itemType itemId")
    .lean();
  return new Set(stars.map((star) => `${star.itemType}:${star.itemId}`));
}
