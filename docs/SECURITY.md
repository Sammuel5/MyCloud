# MyCloud security notes

This document describes the security model, the controls implemented in this codebase, and the limitations you must understand before storing real data.

MyCloud is a **private, single-node, self-hosted application**. It is not a hardened multi-tenant cloud service and has not undergone an independent penetration test. The intended deployment is a trusted Windows machine reachable only through Tailscale Serve or a trusted LAN.

---

## 1. Threat model

### In scope

- Remote attackers who can reach the web port through a misconfiguration.
- Malicious or compromised accounts on the same MyCloud instance.
- Attempts to read another user's files through IDOR, path traversal, direct storage access, or share manipulation.
- Malicious uploads (executables, polyglots, oversized bodies, malformed media).
- Brute-force and credential-stuffing attempts against the login endpoint.
- CSRF against authenticated users.
- XSS through filenames, metadata and previews.
- Public-link guessing, password brute force, revocation and expiry bypass.
- Accidental exposure of MongoDB, storage paths, secrets and backups.

### Out of scope / not defended against

- An attacker with local administrator or physical access to the Windows machine. Such an attacker can read storage, `.env.local`, MongoDB and backups directly.
- A compromised Tailscale account or tailnet ACL.
- Malicious browser extensions or malware on a client device.
- Denial of service by an attacker who can already reach the app and exhaust disk, CPU or connections.
- Side-channel attacks, kernel/OS compromise, firmware attacks.
- Nation-state adversaries.
- Confidentiality against someone who steals an unencrypted disk or backup.

---

## 2. Authentication

### Password storage

- Passwords are hashed with **bcrypt cost 12** using `bcryptjs`.
- Password hashes are `select: false` in Mongoose and are never returned by APIs.
- Unknown-user logins compare against a fixed dummy bcrypt hash, so timing does not trivially reveal whether an email exists.
- Login failures return a generic error to the client.
- Password policy: 12-128 characters, at least one lowercase, uppercase, number and symbol. Validation occurs server-side with Zod.
- Admin-created accounts receive a temporary password and `mustChangePassword=true`; the UI and server block normal application access until it is changed.
- Changing a password increments `sessionVersion` and revokes all sessions for that user.

### Rate limiting and brute force

- Login: **30 attempts per IP per 15 minutes** and **8 attempts per account email per 15 minutes**.
- Public-link password unlock: **10 attempts per link + IP per 15 minutes**.
- Public-link file access: **300 requests per link + IP per 15 minutes**.
- Password change: **5 attempts per user per 15 minutes**.
- Limits are stored in MongoDB, survive process restarts, and fail closed if the limiter cannot reach the database.
- Rate-limit keys are SHA-256 hashes of scope + identifier + time window; raw emails/IPs are not stored in the bucket collection.
- IP addresses in audit records are HMAC-SHA-256 hashed with `AUTH_SECRET` and truncated.

There is no separate "account disabled after N failures" toggle. The per-account rate limit is the primary brute-force control. The `failedLoginCount`/`lockedUntil` fields exist in the schema for future use but are not incremented by the current login flow.

### Sessions

- Auth.js v5 Credentials provider, JWT session strategy.
- On login, a random session ID is generated. Only its SHA-256 hash is stored in the `UserSession` collection and embedded in the signed/encrypted Auth.js JWT cookie.
- Every authenticated request validates:
  - the DB session exists;
  - it is not revoked;
  - it has not expired;
  - the user is still active;
  - the user's `sessionVersion` matches the token.
- A maximum of 10 active sessions per user is kept; older sessions are revoked automatically.
- Users can list and revoke sessions in **Settings > Sessions**.
- Sign-out revokes the DB session.
- Password change and deactivation invalidate existing sessions.
- Session lifetime defaults to 7 days (`MYCLOUD_SESSION_DAYS`), maximum 30.
- The Auth.js cookie is HttpOnly and SameSite=Lax; it is marked Secure when served over HTTPS. `AUTH_SECRET` signs/encrypts the token and signs public-link access cookies. Rotating it logs everyone out.

### Administrator bootstrap

- The first administrator is created through an interactive CLI (`npm run setup:admin`).
- No default password exists in source code, environment templates or documentation.
- The password is typed without echo.
- If administrators already exist, the CLI asks for confirmation; `--force` skips only that confirmation.

### Not implemented

- Two-factor authentication.
- Email verification or self-service password reset.
- SSO/OIDC/SAML.
- Account lockout notifications.
- Password history or breach-corpus checks.

Create accounts only for people you trust, use long unique passwords, and keep the admin account for administration only.

---

## 3. Authorization and data isolation

- Every protected page and API route calls a server-side guard (`requireApiUser`, `requirePasswordReadyApiUser`, `requireAdminUser`, `requireMutationUser` or `requireAdminMutation`).
- There is **no `middleware.ts`**. Authorization is deliberately enforced in each page/Route Handler and in the data-access layer, so a matcher mistake cannot silently expose a route.
- Ownership and sharing are resolved by `lib/access.ts`:
  - owner has full control;
  - direct file/folder shares grant `viewer` or `editor`;
  - a folder share propagates to descendants, downgrading `owner` to `editor` for children;
  - viewers cannot mutate; editors can edit content but cannot manage shares or delete owned data where the role check requires owner.
- Server authorization uses the **database user record**, not the role claim in the JWT, so role changes and deactivation take effect immediately.
- Object IDs are validated with a strict 24-hex-character Zod schema before use; invalid IDs produce `400`, not a database error.
- Listings are scoped by owner or explicit shares; trash, search, recent, starred, media and dashboard queries include ownership/share constraints.
- Admin endpoints require an active admin on every request.
- Admin health output redacts absolute paths, MongoDB URIs, binary paths and secrets.
- Public endpoints expose only the resources reachable from the link's root folder, and validate that a requested child folder is inside that root.

NoSQL injection is mitigated by strict Zod schemas at the edge, explicit field mapping, and ObjectId validation. Mongoose global `sanitizeFilter` is intentionally **not** enabled: it wraps legitimate operators such as `$lte`/`$lt` in `$eq` and broke range queries. Do not pass raw request objects into Mongoose filters.

---

## 4. CSRF

- Auth.js endpoints use Auth.js's own CSRF token flow.
- Every cookie-authenticated mutation calls `assertSameOrigin`:
  - requires an `Origin` header;
  - requires the Origin host to match the request Host / trusted `X-Forwarded-Host`;
  - rejects non-HTTP(S) origins;
  - rejects `Sec-Fetch-Site` values other than `same-origin`.
- API JSON mutations require `Content-Type: application/json`, which prevents simple form-based cross-site posts.
- Session cookies are SameSite=Lax.
- `MYCLOUD_TRUST_FORWARDED_HEADERS=true` means the app trusts `X-Forwarded-Host`/`X-Forwarded-Proto`. Only enable it behind a local proxy you control (Tailscale Serve, Caddy, IIS ARR). If the app is directly reachable, an attacker who can spoof those headers could weaken origin checks.

---

## 5. XSS and response hardening

- React escapes rendered text by default. The UI does not use `dangerouslySetInnerHTML` for user content.
- Text previews are returned as text and rendered as text, not HTML.
- Uploaded files are served with:
  - a server-controlled `Content-Type`;
  - `X-Content-Type-Options: nosniff`;
  - `Content-Disposition` with a safe filename and `inline` only for a small allowlist of safe MIME types;
  - `Content-Security-Policy: default-src 'none'; sandbox` on content responses;
  - `Cache-Control: private, no-store`.
- Dangerous MIME types are downgraded to `application/octet-stream` and forced to download.
- Global headers (`next.config.mjs`):
  - `Content-Security-Policy` with `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'`;
  - `X-Frame-Options: SAMEORIGIN`;
  - `X-Content-Type-Options: nosniff`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - restrictive `Permissions-Policy`;
  - `Cross-Origin-Opener-Policy: same-origin`;
  - HSTS (effective only over HTTPS).
- `poweredByHeader` is disabled.
- The app sets `robots: noindex, nofollow`.

CSP currently allows `'unsafe-inline'` for scripts and styles because Next.js hydration and the styling approach require it. This weakens CSP as an XSS mitigation. Treat output encoding and avoiding raw HTML as the primary defense.

---

## 6. Upload and file-handling security

- Uploads are chunked (32 MiB default, four chunks in parallel) and resumable. The server never trusts the client's claimed chunk boundaries; it calculates expected sizes from the declared total size and configured chunk size.
- Upload sessions are owned by the user, bound to a destination folder, and expire after `MYCLOUD_TEMP_UPLOAD_HOURS`.
- The destination folder is re-checked for edit permission before finalization.
- Each chunk is written to a server-generated path under `temp/uploads/<owner>/<uploadId>/part-NNNNNN`.
- On completion:
  - all chunks must be present with exact expected sizes;
  - chunk contents are concatenated server-side;
  - SHA-256 is computed by the server;
  - the file is inspected with `file-type` magic bytes and policy checks;
  - extension allowlist and dangerous-extension deny list are enforced;
  - quota and free-disk checks run;
  - the final file is moved to an opaque UUID path.
- Original filenames are display metadata only. Storage paths are not derived from user filenames, preventing traversal and collision attacks.
- Dangerous executable/script extensions (for example `.exe`, `.bat`, `.cmd`, `.ps1`, `.js`, `.vbs`, `.scr`, `.msi`, `.dll`, `.com`, `.jar`) are denied even if added to `MYCLOUD_ALLOWED_EXTENSIONS`.
- `file-type` parses attacker-controlled bytes. The pinned 19.6.0 version has a moderate ASF-parser infinite-loop advisory; upload size and chunk-count limits bound the impact, but upgrade when practical.
- Images and videos are processed locally by `sharp` and FFmpeg/ffprobe. These parsers have their own vulnerability history; keep them updated and do not process untrusted media on a machine you cannot rebuild.
- Files are stored under a dedicated folder that the web server never executes. Never place storage under an IIS virtual directory, `wwwroot`, or a path served by another web server.
- There is **no antivirus/malware scanning**. If users upload files from untrusted sources, scan downloads or integrate a scanner before sharing them.

### Denial-of-service considerations

- Per-file upload size and chunk count are bounded.
- Per-user quota can be set by an admin.
- Disk-space checks reject uploads when the volume is low.
- There is no global bandwidth limit or per-user concurrent upload limit. A malicious authenticated user can still consume disk/CPU within their quota.
- Media processing is queued with a small worker concurrency (2) and process timeouts.

---

## 7. Public sharing

- Public sharing is controlled by `SystemSetting.publicSharingEnabled` and is **disabled by default**.
- Only owners can create links for their own resources.
- Link tokens are 32 random bytes, base64url-encoded. Only a SHA-256 hash is stored; the raw URL is shown once at creation.
- Links can have:
  - an expiry date;
  - an optional bcrypt-hashed password (cost 12);
  - a download allow/deny flag.
- Password verification issues a signed, HttpOnly, SameSite=Lax access cookie bound to that link's token hash. The cookie expires after 2 hours and is Secure on HTTPS.
- Expired, revoked and disabled-sharing links stop resolving.
- Folder links expose only files/folders inside the shared root; traversal to sibling or ancestor folders is rejected.
- Unlock attempts and content requests are rate-limited per link + IP.
- Revoking a link sets `revokedAt`, removes the password hash, and invalidates access cookies because resolution fails.
- Disabling public sharing globally makes all public links stop resolving, even if the records remain.

Risks to accept when enabling public sharing:

- Anyone who obtains the URL can read the shared content (subject to password/expiry).
- Links can be forwarded, screenshotted or indexed by third parties.
- Password-protected links rely on the strength of the chosen password.
- Public links are bearer capabilities; there is no per-recipient identity or audit of who viewed a link beyond hashed IP/user-agent records.
- The public page is served by the same Next.js 14.2.5 build that has known advisories. Prefer keeping public sharing off until the framework is upgraded.

---

## 8. Storage and path safety

- Storage root is configured with `MYCLOUD_STORAGE_PATH`, must be absolute, and cannot be a filesystem root.
- All server-generated relative paths are validated by `resolveWithinRoot`:
  - rejects empty paths and NUL bytes;
  - rejects absolute paths and drive letters;
  - rejects `.` and `..` segments;
  - resolves the final path and verifies it is under the root.
- User input is never concatenated into a filesystem path.
- File names are sanitized for display, reject path separators/control characters, and are made unique per folder via `nameKey`.
- The database stores only relative storage paths.
- The public health endpoint reveals only booleans; admin health redacts paths and URIs.
- Storage files are not encrypted by the application. Use BitLocker or another full-disk encryption layer, restrict NTFS permissions, and protect backups.

### Local access caveat

MongoDB is configured without authentication and bound to loopback. Any local process or local user who can connect to `127.0.0.1:27017` can read or modify metadata. Likewise, anyone who can read `MYCLOUD_STORAGE_PATH` can read file bytes. This is acceptable only on a single-user or fully trusted Windows machine. For stronger isolation:

- use separate Windows accounts;
- restrict NTFS permissions on storage, MongoDB data and `.env.local`;
- enable MongoDB authentication and update `MONGODB_URI` with credentials;
- enable BitLocker;
- do not give untrusted people interactive access to the server.

---

## 9. Network exposure

Recommended:

- MyCloud binds `127.0.0.1:3000`.
- MongoDB binds `127.0.0.1:27017`.
- Tailscale Serve terminates HTTPS and proxies to loopback.
- Windows Firewall blocks inbound 27017.
- No router port forwarding.
- Tailscale Funnel is disabled.

Do not:

- bind Next.js or MongoDB to `0.0.0.0` on an untrusted network;
- expose port 3000 directly to the internet;
- use Tailscale Funnel for MyCloud;
- run the app over plain HTTP on a LAN where other devices can sniff traffic;
- put MongoDB on a network share or a shared MongoDB instance without authentication.

`AUTH_TRUST_HOST=true` and `MYCLOUD_TRUST_FORWARDED_HEADERS=true` are appropriate for a local reverse proxy. If you remove the proxy and expose the app directly, audit these settings.

Additional hardening: restrict the Tailscale ACL to your own devices, disable key expiry only for the always-on server (not for user devices), and review the tailnet machine list periodically.

---

## 10. Audit logging and monitoring

The `AuditLog` collection records security-relevant events, including:

- login success/failure/rate limiting;
- password changes and failed password changes;
- admin bootstrap, user creation/update/deactivation;
- folder/file creation, rename, move, copy, trash, restore, permanent deletion;
- uploads and completed uploads;
- share creation/removal;
- public-link creation/revocation;
- settings changes.

Records include actor, action, target, severity, hashed IP, user agent and selected metadata. They do **not** include passwords, session tokens, raw share tokens or file bytes.

Limitations:

- Audit records are stored in the same MongoDB instance and can be altered by a local administrator or an attacker with DB access.
- There is no remote append-only log shipping or SIEM integration.
- Log retention is not automatic; MongoDB growth is bounded only by disk.
- Application logs go to stdout/stderr and NSSM log files. They may contain user IDs, filenames, error stacks and storage-relative paths. Protect the `logs` folder.

Review the audit page after suspicious activity. For stronger guarantees, ship Windows Event Logs and NSSM logs to a remote system.

---

## 11. Backup and restore security

- Backups contain all file bytes, password hashes, audit records, shares and metadata. Treat them as **highly sensitive**.
- The backup script does not encrypt output. Use BitLocker on the backup volume and/or an encrypted archive.
- Do not store backups inside `MYCLOUD_STORAGE_PATH`; the script rejects that.
- Restrict NTFS access to backup folders.
- `.env.local` is not included in backups. Store `AUTH_SECRET` separately in a password manager or secure vault. Losing it only invalidates sessions (with a new secret), but losing database/storage is unrecoverable.
- Restore is destructive (`robocopy /MIR`, `mongorestore --drop`). The script requires the app to be stopped and asks for confirmation.
- Test restores regularly. An unverified backup is not a backup.

---

## 12. Dependency and platform limitations

### Known advisories in the pinned build

`npm audit --omit=dev` reports 5 production vulnerabilities:

| Package | Severity | Issue | Fix |
| --- | --- | --- | --- |
| `next` 14.2.5 | critical | Multiple Next.js advisories, including cache poisoning, DoS, image-optimizer issues, SSRF and RCE classes. | `next@14.2.35` (non-breaking patch in 14.2). |
| `sharp` 0.33.5 | high | Inherited libvips/libheif/librsvg issues. | `sharp@0.35.5` (semver major). |
| `zod` 3.25.76 | high | Memory exhaustion with oversized constrained collections. | `zod@4.6.7` (semver major). |
| `postcss` via Next | high | Source-map/CSS stringify issues. | `next@14.2.35`. |
| `file-type` 19.6.0 | moderate | Infinite loop in ASF parser on malformed input. | `file-type@22.3.0` (semver major). |

Current mitigations:

- `next/image` is not used; the image optimization API is not exercised by the UI.
- No `middleware.ts`; authorization is not dependent on middleware matchers.
- No Server Actions; mutations are explicit Route Handlers with Zod and CSRF checks.
- Upload size, chunk count, media-processing timeouts and quotas are bounded.
- The app is loopback-only behind Tailscale.

These mitigations do **not** make 14.2.5 safe for public internet exposure. Upgrade to at least `14.2.35` before considering broader exposure, and re-run the full test suite and manual smoke checklist. The pin is intentional per project requirements; upgrading is a deliberate decision.

### Other limitations

- No client-side/end-to-end encryption. The server can read all files.
- No file versioning, snapshots, deduplication or immutable backups.
- No malware scanning, DLP, watermarking or preview sandboxing beyond CSP.
- No 2FA, SSO, email verification or self-service reset.
- No formal data-retention automation for audit logs (trash retention exists).
- No horizontal scaling; the worker and sessions assume a single application instance and a single local MongoDB.
- No guarantee of perfect crash consistency for live backups. Use the service-aware scheduled wrapper.
- The application has not been independently audited.

---

## 13. Hardening checklist

- [ ] MyCloud and MongoDB bind to loopback only.
- [ ] Tailscale Serve is used; Funnel is disabled.
- [ ] Windows Firewall blocks 27017; no router port forwarding.
- [ ] `AUTH_SECRET` is random, 32+ chars, backed up securely, never committed.
- [ ] `.env.local` ACL grants only the service account and administrators.
- [ ] Storage and backup volumes use BitLocker.
- [ ] MongoDB data and logs are on NTFS with restrictive ACLs.
- [ ] Public sharing is off unless needed; links use expiry and passwords.
- [ ] Admin account has a unique password stored in a password manager.
- [ ] Users are created only for trusted people; quotas are set where appropriate.
- [ ] Sessions are reviewed and stale devices revoked.
- [ ] Audit log is reviewed periodically.
- [ ] Backups run daily, are copied off-machine, and restores are tested.
- [ ] Node.js, MongoDB, Tailscale, FFmpeg and Windows updates are applied.
- [ ] Next.js 14.2.5 is not exposed to untrusted networks; a tested upgrade to 14.2.35 is planned.
- [ ] Logs folders are protected and monitored for errors.

---

## 14. Incident response

If you suspect compromise:

1. Disconnect the machine from the network or stop Tailscale Serve.
2. Stop the MyCloud service: `Stop-Service MyCloud`.
3. Preserve evidence: copy `logs`, MongoDB data, storage and audit records to an isolated drive before changing anything.
4. Rotate `AUTH_SECRET`, all account passwords and the Tailscale device key.
5. Review `AuditLog` and Windows Event Logs for logins, uploads, shares and deletions.
6. Restore from a known-good backup to a clean machine if integrity is uncertain.
7. Rebuild the host if malware or remote code execution is suspected; do not simply delete files and continue.
8. Re-enable access only after patching the entry vector and verifying the restore.

Because there is no remote logging, full forensic reconstruction may be limited. Plan for that before an incident.

---

## 15. Reporting

This is a private project with no public security contact. If you deploy it for others, add a monitored security contact, a vulnerability disclosure policy and an incident-response owner.
