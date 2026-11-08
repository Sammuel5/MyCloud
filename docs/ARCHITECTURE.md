# MyCloud architecture

This document explains how the application is put together, where data lives, and how the main flows work. It is intended for maintenance, troubleshooting and security review.

---

## 1. Runtime topology

```text
+----------------------------- Windows host ------------------------------+
|                                                                         |
|  Tailscale Serve (HTTPS 443)                                            |
|        |                                                                |
|        v                                                                |
|  Next.js 14.2.5 production server (127.0.0.1:3000)                      |
|    - App Router pages / React Server Components                         |
|    - Route Handlers (REST-style JSON + file streaming)                   |
|    - Auth.js v5 (Credentials, JWT cookie)                                |
|    - embedded background worker (thumbnail jobs + maintenance)          |
|        |                                                                |
|        +--> MongoDB 8.0 (127.0.0.1:27017)  metadata, sessions, audit     |
|        +--> C:\MyCloudStorage              opaque file bytes, thumbnails  |
|        +--> ffmpeg/ffprobe + sharp         local media processing        |
|                                                                         |
|  NSSM service "MyCloud"  -> node next start ...                          |
|  Windows service "MongoDB"                                              |
+-------------------------------------------------------------------------+
```

Single-node by design:

- one application process (Next.js) and one local MongoDB;
- one storage root on a local NTFS volume;
- no Redis, queue server, object storage or external database;
- background jobs are stored in MongoDB and processed in-process.

The app is not designed for horizontal scaling. If you run multiple Next.js instances against the same storage and database, uploads and trash operations can race, and the embedded worker may run more than once. For multiple instances you would need a separate worker, shared storage and a distributed lock.

---

## 2. Technology stack

| Layer | Technology |
| --- | --- |
| UI | Next.js 14.2.5 App Router, React 18, TypeScript, Tailwind CSS, Radix/shadcn-style components, lucide icons, sonner |
| Server | Next.js Route Handlers, Node.js runtime |
| Auth | `next-auth@5.0.0-beta.32` Credentials, `bcryptjs` cost 12, JWT session + DB session records |
| Validation | Zod 3 |
| Database | MongoDB 8 + Mongoose 8 |
| Files | Node `fs`/`fs/promises`, streams, `robust` range parsing implemented locally |
| Media | `sharp` for images, local FFmpeg/ffprobe for video metadata/thumbnails |
| Upload inspection | `file-type` magic bytes + extension/MIME allow/deny policy |
| Tests | Vitest unit tests |
| Deployment | NSSM Windows service, Tailscale Serve, PowerShell scripts |

---

## 3. Directory map

```text
app/
  (app)/                    authenticated pages
    dashboard/              quota + recent activity dashboard
    drive/                  root and folder browsing
    photos/, videos/        media galleries
    recent/, starred/       filtered views
    shared/                 incoming and outgoing shares
    trash/                  recycle bin
    search/                 global search
    settings/               profile, password, sessions
    admin/                  users, settings, audit, health
  change-password/          forced password change
  login/                    credentials login
  s/[token]/                public share viewer
  api/                      Route Handlers
components/                 UI components
lib/                        server logic (auth, access, storage, uploads, etc.)
models/                     Mongoose schemas
scripts/                    setup, admin, backup, restore, service, Tailscale
tests/                      Vitest unit tests
docs/                       this documentation
auth.ts                     Auth.js configuration
instrumentation*.ts         startup hook that launches the worker
next.config.mjs             security headers, server externals
```

---

## 4. Data model

MongoDB database: `mycloud`.

| Collection | Purpose | Key fields |
| --- | --- | --- |
| `users` | Accounts | `email` (unique, lowercase), `name`, `passwordHash` (select false), `role`, `active`, `mustChangePassword`, `storageQuotaBytes`, `sessionVersion`, `createdBy`, timestamps |
| `usersessions` | Revocable login sessions | `userId`, `sidHash` (unique, hashed), `userAgent`, `ipHash`, `lastSeenAt`, `expiresAt`, `revokedAt` |
| `folders` | Folder tree | `owner`, `name`, `nameKey`, `parentId`, `ancestorIds[]`, `deletedAt`, `deletedBy`, `trashBatch`, `isTrashRoot` |
| `files` | File metadata | `owner`, `name`, `nameKey`, `parentId`, `storageName`, `storageRelPath`, `mimeType`, `extension`, `size`, `checksumSha256`, `mediaMetadata`, thumbnail/preview status, trash fields, `uploadedVia` |
| `shares` | Internal user shares | `resourceType`, `resourceId`, `owner`, `sharedWith`, `role` (`viewer`/`editor`) |
| `sharelinks` | Public links | `tokenHash` (unique, hashed), `resourceType`, `resourceId`, `owner`, `createdBy`, `passwordHash` (select false), `expiresAt`, `allowDownload`, `accessCount`, `lastAccessedAt`, `revokedAt` |
| `stars` | Per-user favorites | `userId`, `resourceType`, `resourceId` |
| `uploadsessions` | Resumable upload state | `uploadId` (unique), `owner`, `parentId`, `filename`, `size`, `mimeType`, `fingerprint`, `chunkSize`, `totalChunks`, `receivedChunks[]`, `tempRelPath`, `status`, `expiresAt` |
| `jobs` | Background work | `type` (`thumbnail`), `payload`, `status`, `attempts`, `maxAttempts`, `availableAt`, `lockedAt`, `lastError` |
| `auditlogs` | Security/business audit trail | `actorId`, `actorEmail`, `action`, `targetType`, `targetId`, `severity`, `ipHash`, `userAgent`, `metadata`, timestamp |
| `ratelimitbuckets` | Durable fixed-window counters | hashed `key`, `count`, `expiresAt` (TTL) |
| `systemsettings` | Global settings singleton | `key: "global"`, `publicSharingEnabled` (default false), `trashRetentionDays`, `allowCameraUpload` |

Relationships are stored by `ObjectId`; there are no SQL joins. Every listing query is constrained by ownership or explicit shares. Folder ancestry is denormalized into `ancestorIds` to make descendant access checks efficient.

### Why `nameKey` exists

`nameKey` is a normalized (case-folded) key used to enforce uniqueness within a folder and to sort names predictably. Original case and characters are preserved in `name`. This avoids relying on filesystem case behavior for display names.

### Why storage paths are opaque

User filenames are untrusted and can collide, contain Unicode tricks, reserved Windows names, trailing dots/spaces, or path separators. Storage uses:

```text
files/<ownerId>/<YYYY>/<MM>/<uuid>.blob
```

The database maps the display name to the opaque path. Renaming or moving a file changes metadata only; file bytes are not rewritten. Copying a file creates a new metadata record and a new blob (no deduplication).

---

## 5. Storage layout

```text
MYCLOUD_STORAGE_PATH\
  files\<ownerId>\<YYYY>\<MM>\<uuid>.blob
  thumbnails\<ownerId>\<uuid>.webp
  previews\...                       reserved for generated previews
  temp\uploads\<ownerId>\<uploadId>\
    part-000000
    part-000001
    ...
```

- `temp` is excluded from backups and cleaned by the worker after incomplete uploads expire.
- Chunk files are named by padded index and validated by exact expected size before assembly.
- On completion, chunks are streamed in order into a temporary final file, SHA-256 is calculated during the copy, and the result is atomically renamed into the final opaque location.
- Thumbnail failures do not delete the original file. They set a status/error and can be retried by re-queueing.
- Absolute paths are resolved from the storage root and validated to remain inside it. User input never reaches `path.join` as a path segment without validation.

---

## 6. Authentication and session flow

```text
POST /api/auth/callback/credentials
  -> Auth.js Credentials.authorize
     -> Zod validate email/password
     -> rate limit by IP and account
     -> bcrypt.compare against stored hash (or dummy hash)
     -> reject inactive/locked
     -> create UserSession (random sid, store SHA-256 hash)
     -> audit login
     -> return user claims including sid hash + sessionVersion
  -> Auth.js issues signed/encrypted JWT cookie

Every protected request
  -> auth() reads JWT
  -> validateAuthSession(userId, sidHash, sessionVersion)
     -> DB session exists, not revoked, not expired
     -> user active, sessionVersion matches
  -> role/ownership checks in data layer
```

Session records make JWT revocation possible. The JWT alone is not sufficient: a stolen cookie stops working after revocation, password change, deactivation or expiry in the database.

`mustChangePassword` is enforced by `requirePasswordReadyApiUser` and page redirects. Only the change-password endpoint and logout are available until the user sets a new password. Changing the password increments `sessionVersion` and revokes all sessions.

---

## 7. Request and authorization flow

Typical authenticated API call:

```text
Route Handler
  -> requireMutationUser(request)     [mutations]
     -> assertSameOrigin
     -> requirePasswordReadyApiUser
        -> auth() + DB session validation
        -> reject mustChangePassword
  -> readJson(request, zodSchema)
  -> domain function (e.g. createFolder)
     -> ownership/share role check
     -> MongoDB query constrained by user
     -> storage operation (if any)
  -> auditEvent(...)
  -> json(...) with Cache-Control: no-store
```

Pages use server-side `getCurrentUser`/redirect guards and load data through server helpers or client `fetch` to the same APIs. There is no reliance on hidden UI controls for authorization; every mutation re-checks role and ownership.

Admin routes require an active admin in the database on every request. The JWT role claim is used for UI hints, not for server authorization.

---

## 8. Upload flow

```text
1. Client computes a fingerprint and POST /api/uploads
   { filename, size, mimeType, parentId, fingerprint }

2. Server:
   - validates destination edit permission
   - checks quota and free disk space
   - checks size limit and extension policy
   - looks for an existing resumable session
     (same owner, parent, filename, size, fingerprint, not expired)
   - returns uploadId, chunkSize, totalChunks, receivedChunks

3. Client PUTs each missing chunk to
   /api/uploads/:uploadId/chunks/:index
   - server validates index range, expected size, session ownership
   - writes to temp part file, atomically replaces partial part

4. Client POST /api/uploads/:uploadId/complete
   - server verifies every part exists with exact size
   - re-checks destination permission
   - claims session (uploading -> assembling) to prevent double finalize
   - streams parts into a temp file and computes SHA-256
   - validates magic bytes/MIME/extension
   - ensures unique display name
   - moves file to opaque storage path
   - creates File record, updates usage
   - enqueues thumbnail job
   - deletes temp parts
   - returns file DTO
```

Resume behavior re-verifies the size of every recorded part; missing or truncated parts are removed from `receivedChunks` and re-uploaded. A client can resume after a browser restart if it sends the same fingerprint.

Failure handling:

- session expires after `MYCLOUD_TEMP_UPLOAD_HOURS`;
- abort/cleanup removes temp parts;
- worker removes expired sessions and orphaned temporary data;
- quota is re-checked at completion;
- a failed validation never publishes the file into the user's tree.

---

## 9. Download and streaming flow

`GET /api/items/file/:id/content`:

1. authenticate and resolve access;
2. open the file by its stored relative path;
3. parse `Range` using the local range parser;
4. return:
   - `200` with full stream when no range;
   - `206` with `Content-Range`, `Accept-Ranges: bytes` and the requested slice;
   - `416` for an unsatisfiable range;
5. set `Content-Type` from the stored MIME (safe override for dangerous types);
6. set `Content-Disposition` inline only for safe preview types, otherwise attachment;
7. add `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`.

`?download=1` forces an attachment when the user has download permission. Public links obey `allowDownload`.

Thumbnail endpoint returns generated WebP thumbnails with cache headers appropriate to immutable content; content is still access-controlled.

---

## 10. Thumbnail and maintenance worker

Startup:

- `instrumentation.ts` runs on the Node.js runtime;
- `instrumentation-node.ts` skips the production build phase and calls `startBackgroundWorkers()`;
- unless `MYCLOUD_DISABLE_WORKER=true`, the web process starts the worker.

Worker behavior:

- poll interval: 4 seconds;
- job claim: atomic `findOneAndUpdate` from `queued` to `running`, with `availableAt <= now`;
- concurrency: 2;
- stale `running` jobs are requeued after a timeout;
- failed jobs retry with backoff up to `maxAttempts`;
- maintenance every 15 minutes:
  - requeue stale jobs;
  - clean expired upload sessions/temp data;
  - permanently delete trash roots older than `trashRetentionDays`.

Thumbnail pipeline:

- images: `sharp` -> WebP thumbnail, metadata extraction;
- videos: `ffprobe` for width/height/duration/format; `ffmpeg` extracts a frame -> `sharp` WebP;
- failures are recorded on the file (`thumbnailStatus`, `thumbnailError`) and logged, without blocking uploads.

Standalone mode:

```powershell
# .env.local
MYCLOUD_DISABLE_WORKER=true

# one separate process
npm run worker
```

If you use standalone mode, run it as its own service and ensure exactly one worker exists. Running both the embedded worker and a standalone worker can process the same job twice (the atomic claim mostly prevents this, but it is still unsupported).

---

## 11. Sharing flows

### Internal shares

- Owner creates a share for a registered user by email with role `viewer` or `editor`.
- Access resolution walks direct resource shares plus ancestor folder shares.
- A folder share applies to descendants with `owner` downgraded to `editor`.
- Removing a share immediately removes access.
- Deactivated users cannot authenticate, so their shares become unusable without deleting the records.

### Public links

```text
Owner POST /api/items/:type/:id/links
  -> global publicSharingEnabled must be true
  -> owner-only check on the resource
  -> generate 32-byte token, store SHA-256 hash
  -> optional bcrypt password hash, expiry, download flag
  -> return raw path once: /s/<token>

Visitor GET /api/public/<token>
  -> resolve by token hash, not revoked, not expired
  -> if password: require signed access cookie
  -> return metadata and folder contents

Visitor POST /api/public/<token>/unlock
  -> same-origin + rate limit
  -> bcrypt compare
  -> signed HttpOnly cookie bound to token hash (2h)

Visitor GET /api/public/<token>/content/<fileId>
  -> resolve link + validate file is inside shared root
  -> enforce allowDownload
  -> stream with Range support
```

Folder links validate that every requested child folder is the shared root itself or has the root in its `ancestorIds`; sibling/ancestor traversal is rejected.

Revoking sets `revokedAt` and removes the password hash. Disabling public sharing globally makes links unresolvable even if rows remain.

---

## 12. Trash and deletion

- Trashing a file or folder sets `deletedAt`, `deletedBy`, a shared `trashBatch`, and marks the selected item as `isTrashRoot`.
- Descendants are marked deleted as part of the batch but are not independent trash roots.
- Restore recreates the original parent path if necessary and restores the batch.
- Permanent deletion:
  - verifies the item is a trash root and the actor has access;
  - recursively collects descendant files;
  - deletes stored blobs and thumbnails;
  - deletes metadata, shares, links and stars;
  - updates usage counters;
- The worker purges trash roots older than the configured retention (default 30 days).
- The UI also offers explicit permanent deletion and empty-trash actions.

Trash operations are metadata-heavy. For very large folder trees, permanent deletion can take time; the API runs within the request and the worker handles retention expiry in batches.

---

## 13. Error handling and logging

- Domain errors use `ApiError(status, message, code)`.
- Zod errors become `400 VALIDATION_ERROR` with flattened details.
- MongoDB duplicate-key errors become `409 CONFLICT`.
- Cast errors become `400 INVALID_ID`.
- Database unavailability becomes `503 DATABASE_UNAVAILABLE`.
- `ENOSPC` becomes `507 STORAGE_FULL`.
- Unknown errors are logged server-side and returned as generic `500 INTERNAL_ERROR`; stack traces and paths are not sent to clients.
- All JSON responses use `Cache-Control: no-store`.
- Logs are JSON lines on stdout/stderr; NSSM redirects them to rotating files.

---

## 14. Security headers and caching

`next.config.mjs` adds headers to all routes:

- CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP;
- stricter CSP (`default-src 'none'; sandbox`) for file content endpoints.

Dynamic APIs are `force-dynamic` where appropriate. File content and thumbnails are private and not cached by shared proxies; generated thumbnails are immutable but still require authorization.

No `next/image` is used, so the Next.js image optimizer is not part of the request path. This also removes one class of advisories from practical exposure, but does not make the pinned framework safe.

---

## 15. Deployment components

| Script | Role |
| --- | --- |
| `scripts/init-system.ts` | env validation, storage layout, Mongo connection, `syncIndexes()`, default settings, media checks |
| `scripts/bootstrap-admin.ts` | interactive first admin, bcrypt hash, audit event |
| `scripts/install-service.ps1` | NSSM service install/reconfigure, logs, auto-start, restart policy |
| `scripts/setup-tailscale.ps1` | `tailscale serve --bg --https=443 http://127.0.0.1:3000` and prints the DNS name |
| `scripts/setup-firewall.ps1` | inbound block for 27017; optional LAN web rule |
| `scripts/backup.ps1` | robocopy storage (excludes temp) + `mongodump --gzip` + manifest + retention |
| `scripts/restore.ps1` | safety checks, `robocopy /MIR`, `mongorestore --drop`, prompts |
| `scripts/scheduled-backup.ps1` | stops/starts the service around a consistent backup, logs output |
| `scripts/install-backup-task.ps1` | Task Scheduler registration as SYSTEM |
| `scripts/healthcheck.ts` | HTTP health probe for monitoring |
| `scripts/worker.ts` | standalone worker entry point |

The NSSM service runs:

```text
node <app>\node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000
```

with `NODE_ENV=production`, rotating logs and restart-on-exit.

---

## 16. Indexing and startup

- Production disables Mongoose `autoIndex`; indexes are created by `npm run setup` via `syncIndexes()`.
- Run `npm run setup` after a restore, after model/index changes, and during upgrades.
- The app creates default system settings on first use, but `setup` is the supported initialization path.
- The worker starts through instrumentation after the server boots. MongoDB may connect a few seconds later; the worker logs and retries rather than crashing the server.

---

## 17. Testing strategy

- 63 Vitest unit tests cover validation, MIME policy, path safety, range parsing, crypto/token behavior and access roles.
- End-to-end verification was performed against a real production server with:
  - login, CSRF and anonymous boundaries;
  - chunked/resumable uploads and checksums;
  - full downloads and byte ranges;
  - search, star, move, copy, trash/restore/permanent delete;
  - image and FFmpeg video thumbnails, galleries, text previews;
  - public file/folder links, password unlock, expiry/revocation behavior;
  - viewer permissions and forced password change;
  - admin health/audit and recursive purge.
- The live smoke scripts were removed after verification; recreate them in a separate test environment if needed.

Before exposing a new deployment, repeat the manual checklist in [TUTORIAL.md](TUTORIAL.md#10-build-and-start-manually).

---

## 18. Known architectural limitations

- Single-node only; no distributed locks, job queue or shared storage.
- No deduplication or file versioning.
- Copying large folders duplicates bytes and can be slow.
- All file bytes and metadata are readable by a local administrator.
- No encryption at rest (rely on BitLocker), no client-side encryption.
- No antivirus scanning of uploads.
- Backup consistency depends on stopping the app (use the scheduled wrapper).
- No formal migration framework; schema changes rely on Mongoose defaults plus `syncIndexes()` and careful data migrations.
- The pinned Next.js 14.2.5 has known advisories; see [SECURITY.md](SECURITY.md).
