import { Types } from "mongoose";
import { File } from "@/models/File";
import { Folder } from "@/models/Folder";
import { Share } from "@/models/Share";
import { Star } from "@/models/Star";
import {
  getAccessibleBreadcrumbs,
  getAccessibleQueryContext,
  getFileWithAccess,
  getFolderWithAccess,
  getStarredIds,
  resolveItemRoles,
} from "@/lib/access";
import { mapItemsToDTO, ownerNamesFor } from "@/lib/item-dto";
import { getQuotaState } from "@/lib/usage";
import { requireItemAccess } from "@/lib/access";
import type { AccessRole, FileCategory, ItemDTO, ItemsResponse } from "@/lib/types";
import { ApiError } from "@/lib/request";

export type ItemScope =
  | "drive"
  | "starred"
  | "recent"
  | "search"
  | "trash"
  | "shared-with-me";

export type ItemSort = "name" | "date" | "size" | "type";
export type SortOrder = "asc" | "desc";

export interface ListItemsOptions {
  userId: string;
  quotaBytes: number;
  scope: ItemScope;
  parentId?: string | null;
  page: number;
  limit: number;
  sort: ItemSort;
  order: SortOrder;
  category: FileCategory | "all";
  q?: string;
}

const CATEGORY_FILE_FILTERS: Record<Exclude<FileCategory, "other">, Record<string, unknown>> = {
  image: { mimeType: /^image\//i },
  video: { mimeType: /^video\//i },
  audio: { mimeType: /^audio\//i },
  document: {
    $or: [
      { mimeType: /^text\//i },
      { mimeType: /pdf|word|spreadsheet|presentation|officedocument|opendocument|json|rtf|epub/i },
    ],
  },
  archive: {
    mimeType: /zip|compressed|tar|gzip|bzip|x-xz|rar|x-7z/i,
  },
};

function categoryFilter(category: FileCategory | "all"): Record<string, unknown> | null {
  if (category === "all") return null;
  if (category === "other") {
    return {
      $nor: [
        CATEGORY_FILE_FILTERS.image,
        CATEGORY_FILE_FILTERS.video,
        CATEGORY_FILE_FILTERS.audio,
        CATEGORY_FILE_FILTERS.document,
        CATEGORY_FILE_FILTERS.archive,
      ],
    };
  }
  return CATEGORY_FILE_FILTERS[category];
}

function combineFilters(...filters: Array<Record<string, unknown> | null>): Record<string, unknown> {
  const useful = filters.filter((filter): filter is Record<string, unknown> => Boolean(filter));
  if (useful.length === 0) return {};
  if (useful.length === 1) return useful[0];
  return { $and: useful };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface AggregateRow {
  _id: Types.ObjectId;
  itemType: "file" | "folder";
}

interface SortableProjection {
  nameKey: string;
  updatedAt: Date;
  size: number;
  sortKey: string;
}

function sortSpec(sort: ItemSort, order: SortOrder): Record<string, 1 | -1> {
  const direction = order === "asc" ? 1 : -1;
  switch (sort) {
    case "name":
      return { isFolder: -1, nameKey: direction, _id: 1 };
    case "size":
      return { isFolder: -1, size: direction, nameKey: 1, _id: 1 };
    case "type":
      return { isFolder: -1, sortKey: direction, nameKey: 1, _id: 1 };
    case "date":
    default:
      return { isFolder: -1, updatedAt: direction, _id: 1 };
  }
}

export async function listItems(options: ListItemsOptions): Promise<ItemsResponse> {
  const {
    userId,
    quotaBytes,
    scope,
    parentId,
    page,
    limit,
    sort,
    order,
    category,
    q,
  } = options;

  let fileFilter: Record<string, unknown> = { deletedAt: null };
  let folderFilter: Record<string, unknown> = { deletedAt: null };
  let breadcrumbs: Array<{ id: string; name: string }> = [];
  let parent: ItemsResponse["parent"] = null;
  let includeFolders = category === "all";

  if (scope === "drive") {
    if (parentId) {
      const access = await getFolderWithAccess(userId, parentId);
      if (!access) throw new ApiError(404, "Folder not found", "NOT_FOUND");
      parent = {
        id: access.item._id.toString(),
        name: access.item.name,
        role: access.role,
      };
      breadcrumbs = await getAccessibleBreadcrumbs(userId, access.item);
      fileFilter = { parentId: access.item._id, deletedAt: null };
      folderFilter = { parentId: access.item._id, deletedAt: null };
    } else {
      fileFilter = { parentId: null, owner: new Types.ObjectId(userId), deletedAt: null };
      folderFilter = { parentId: null, owner: new Types.ObjectId(userId), deletedAt: null };
    }
    includeFolders = category === "all";
  } else if (scope === "trash") {
    const deletedByUser = new Types.ObjectId(userId);
    const base = {
      deletedAt: { $ne: null },
      isTrashRoot: true,
      $or: [{ owner: deletedByUser }, { deletedBy: deletedByUser }],
    };
    fileFilter = base;
    folderFilter = base;
    includeFolders = category === "all";
  } else if (scope === "shared-with-me") {
    const shares = await Share.find({ sharedWith: userId })
      .select("resourceType resourceId")
      .lean();
    const fileIds = shares
      .filter((share) => share.resourceType === "file")
      .map((share) => share.resourceId);
    const folderIds = shares
      .filter((share) => share.resourceType === "folder")
      .map((share) => share.resourceId);
    fileFilter = { _id: { $in: fileIds }, deletedAt: null };
    folderFilter = { _id: { $in: folderIds }, deletedAt: null };
    includeFolders = category === "all";
  } else {
    const context = await getAccessibleQueryContext(userId);
    fileFilter = combineFilters({ deletedAt: null }, context.fileFilter);
    folderFilter = combineFilters({ deletedAt: null }, context.folderFilter);

    if (scope === "starred") {
      const stars = await Star.find({ userId }).select("itemType itemId").lean();
      const starredFiles = stars
        .filter((star) => star.itemType === "file")
        .map((star) => star.itemId);
      const starredFolders = stars
        .filter((star) => star.itemType === "folder")
        .map((star) => star.itemId);
      fileFilter = combineFilters(fileFilter, { _id: { $in: starredFiles } });
      folderFilter = combineFilters(folderFilter, { _id: { $in: starredFolders } });
      includeFolders = category === "all";
    }

    if (scope === "search") {
      if (!q?.trim()) {
        throw new ApiError(400, "Enter a search term", "SEARCH_QUERY_REQUIRED");
      }
    }
  }

  if (q?.trim() && (scope === "search" || scope === "trash")) {
    const regex = new RegExp(escapeRegex(q.trim()), "i");
    fileFilter = combineFilters(fileFilter, { nameKey: regex });
    folderFilter = combineFilters(folderFilter, { nameKey: regex });
  }

  const fileCategoryFilter = categoryFilter(category);
  if (fileCategoryFilter) {
    fileFilter = combineFilters(fileFilter, fileCategoryFilter);
  }
  if (!includeFolders) {
    folderFilter = { _id: { $in: [] } };
  }

  const offset = (page - 1) * limit;
  const sortStage = sortSpec(sort, order);

  const filePipeline = [
    { $match: fileFilter },
    {
      $project: {
        _id: 1,
        nameKey: 1,
        updatedAt: 1,
        size: 1,
        sortKey: "$extension",
        isFolder: { $literal: 0 },
        itemType: { $literal: "file" },
      },
    },
  ];
  const folderPipeline = [
    { $match: folderFilter },
    {
      $project: {
        _id: 1,
        nameKey: 1,
        updatedAt: 1,
        size: { $literal: 0 },
        sortKey: { $literal: "folder" },
        isFolder: { $literal: 1 },
        itemType: { $literal: "folder" },
      },
    },
  ];

  const aggregation = await Folder.aggregate<{
    rows: AggregateRow[];
    meta: Array<{ total: number }>;
  }>([
    ...folderPipeline,
    {
      $unionWith: {
        coll: File.collection.name,
        pipeline: filePipeline,
      },
    },
    { $sort: sortStage },
    {
      $facet: {
        rows: [
          { $skip: offset },
          { $limit: limit },
          { $project: { _id: 1, itemType: 1 } },
        ],
        meta: [{ $count: "total" }],
      },
    },
  ]);

  const result = aggregation[0];
  const rows = result?.rows ?? [];
  const total = result?.meta[0]?.total ?? 0;
  const fileIds = rows.filter((row) => row.itemType === "file").map((row) => row._id);
  const folderIds = rows.filter((row) => row.itemType === "folder").map((row) => row._id);

  const [files, folders] = await Promise.all([
    fileIds.length
      ? File.find({ _id: { $in: fileIds } }).lean()
      : Promise.resolve([]),
    folderIds.length
      ? Folder.find({ _id: { $in: folderIds } }).lean()
      : Promise.resolve([]),
  ]);
  const filesById = new Map(files.map((file) => [file._id.toString(), file]));
  const foldersById = new Map(folders.map((folder) => [folder._id.toString(), folder]));
  const orderedFiles = rows
    .filter((row) => row.itemType === "file")
    .map((row) => filesById.get(row._id.toString()))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  const orderedFolders = rows
    .filter((row) => row.itemType === "folder")
    .map((row) => foldersById.get(row._id.toString()))
    .filter((folder): folder is NonNullable<typeof folder> => Boolean(folder));

  let roles: Map<string, AccessRole>;
  if (scope === "trash") {
    roles = new Map();
    for (const file of orderedFiles) {
      if (file.owner.toString() === userId) roles.set(`file:${file._id}`, "owner");
      else if (file.deletedBy?.toString() === userId) roles.set(`file:${file._id}`, "editor");
    }
    for (const folder of orderedFolders) {
      if (folder.owner.toString() === userId) roles.set(`folder:${folder._id}`, "owner");
      else if (folder.deletedBy?.toString() === userId)
        roles.set(`folder:${folder._id}`, "editor");
    }
  } else {
    roles = await resolveItemRoles(userId, orderedFolders, orderedFiles);
  }

  const [stars, ownerNames] = await Promise.all([
    getStarredIds(userId, orderedFiles, orderedFolders),
    ownerNamesFor(userId, orderedFiles, orderedFolders),
  ]);
  const untouchedItems = mapItemsToDTO(
    orderedFiles,
    orderedFolders,
    roles,
    stars,
    ownerNames
  );
  const orderById = new Map(rows.map((row, index) => [row._id.toString(), index]));
  const items: ItemDTO[] = untouchedItems.sort(
    (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0)
  );

  const quota = await getQuotaState(userId, quotaBytes);

  return {
    items,
    total,
    page,
    limit,
    breadcrumbs,
    parent,
    scope,
    quota,
  };
}

export async function getItemDetails(
  userId: string,
  type: "file" | "folder",
  id: string
): Promise<ItemDTO> {
  if (type === "file") {
    const access = await getFileWithAccess(userId, id);
    if (!access) throw new ApiError(404, "File not found", "NOT_FOUND");
    const stars = await getStarredIds(userId, [access.item], []);
    const names = await ownerNamesFor(userId, [access.item], []);
    const { fileToDTO } = await import("@/lib/item-dto");
    const dto = fileToDTO(
      access.item,
      access.role,
      stars.has(`file:${access.item._id}`),
      names.get(access.item.owner.toString())
    );
    return { ...dto, checksumSha256: access.item.checksumSha256 };
  }
  const access = await getFolderWithAccess(userId, id);
  if (!access) throw new ApiError(404, "Folder not found", "NOT_FOUND");
  const stars = await getStarredIds(userId, [], [access.item]);
  const names = await ownerNamesFor(userId, [], [access.item]);
  const { folderToDTO } = await import("@/lib/item-dto");
  return folderToDTO(
    access.item,
    access.role,
    stars.has(`folder:${access.item._id}`),
    names.get(access.item.owner.toString())
  );
}

export async function requireParentEditAccess(
  userId: string,
  parentId: string | null | undefined
): Promise<{ id: Types.ObjectId | null; role: "owner" | "editor" | "viewer" } | null> {
  if (!parentId) return null;
  const access = await requireItemAccess(userId, "folder", parentId, { minRole: "editor" });
  return {
    id: access.item._id,
    role: access.role,
  };
}
