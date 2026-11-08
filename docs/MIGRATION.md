# Moving MyCloud to another always-on PC

This guide moves the complete MyCloud installation from the current laptop to a second Windows PC that will stay powered on. It is written for the migration bundle:

```text
MyCloud-Migration-20261102.zip
```

The bundle was created on **2026-11-02** from host `LAPTOP-VHN6I2QA`. It contains:

| Item | Location in bundle | Notes |
| --- | --- | --- |
| Application source | `app\` | No `node_modules`, no `.next`, no logs |
| Storage + MongoDB backup | `data\mycloud-20261102-111111\` | 1 admin account, 1 folder, 1 file (about 2.6 MB), thumbnails |
| Environment template | `env.local.template` | Placeholders only; **no real secret** |
| This guide | `MIGRATION.md` | |

> **Read this first**
>
> 1. This is a **cutover**, not a sync. After you start using the new PC, stop using the laptop copy. Do not run two live MyCloud servers against two diverging copies of the data.
> 2. The bundle contains your **files, password hashes and audit records**. Transfer it by USB or your local network only. Do not email it, upload it to cloud storage, or leave it in Downloads after migration.
> 3. The bundle deliberately **does not contain `.env.local` or `AUTH_SECRET`**. You will create a new secret on the new PC. Your admin account and password still work because they live in the restored database; existing browser sessions will be signed out.
> 4. MyCloud is pinned to Next.js 14.2.5 with known advisories. Keep it on a trusted LAN or Tailscale. Never port-forward it to the internet.

---

## 0. How this migration works

```text
Old laptop                                  New always-on PC
-----------                                 -----------------
app source        ----- ZIP ------------->  C:\MyCloud\app
                                                  |
                                                  +-- npm ci        (restore dependencies)
                                                  +-- .env.local    (new secret + new paths)
                                                  +-- restore.ps1   (storage + MongoDB dump)
                                                  +-- npm run setup (indexes)
                                                  +-- npm run build (production build)
                                                  +-- Windows service (auto-start)
D:\MyCloudStorage ----- backup ----------->  D:\MyCloudStorage
MongoDB metadata ----- mongodump --------->  MongoDB 8 (localhost)
```

`restore.ps1` mirrors the backed-up storage tree and runs `mongorestore --drop`. It is destructive to whatever is currently in the target storage folder/database, which is why you do this before anyone uses the new installation.

---

## 1. What you need on the new PC

- Windows 10 or Windows 11, 64-bit, that can stay on.
- Administrator access.
- Node.js **20.11 or newer** (Node 24 LTS recommended; verified on 24.18.0).
- MongoDB **8.0** Community Server installed as a Windows service, bound to `127.0.0.1`.
- MongoDB **Database Tools** (`mongodump` / `mongorestore`).
- NSSM if you want MyCloud to start automatically as a Windows service.
- A stable LAN address for the new PC: a DHCP reservation in the router is strongly recommended.
- Optional: Tailscale for encrypted access from phones/laptops outside the house.
- Enough disk space. The included backup is small, but plan for growth.

Recommended folders:

```text
C:\MyCloud\app              application + node_modules + .env.local
C:\MyCloud\data             extracted bundle data and guide (temporary)
D:\MyCloudStorage           user files (or C:\MyCloudData\Storage if no D:)
D:\MyCloudBackups           backups (or C:\MyCloudData\Backups)
D:\MyCloudData\mongodb      optional custom MongoDB data folder
```

Do **not** place the app in `C:\Program Files`, inside OneDrive, or directly in `Downloads`. Do **not** point storage at a drive root such as `D:\`.

---

## 2. Install Node.js

In a normal PowerShell window:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

Or install from <https://nodejs.org/en/download>. Close and reopen PowerShell, then verify:

```powershell
node -v
npm -v
```

`node -v` must be `v20.11.0` or newer.

---

## 3. Install MongoDB 8 as a Windows service

1. Download **MongoDB Community Server 8.0 for Windows x64** from <https://www.mongodb.com/try/download/community>.
2. Run the MSI and choose **Complete**.
3. Keep **Install MongoDB as a Service** enabled.
4. Service name: `MongoDB`.
5. Service account: `Network Service` (default) is fine.
6. Either keep the default data/log folders, or set:
   - Data: `D:\MyCloudData\mongodb`
   - Log: `D:\MyCloudData\logs\mongod.log`
7. Finish the installer.

Verify:

```powershell
Get-Service MongoDB
Get-NetTCPConnection -LocalPort 27017 -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

`LocalAddress` must be `127.0.0.1` or `::1`, never `0.0.0.0`. If it is not loopback, edit the MongoDB config (normally `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`), set `bindIp: 127.0.0.1`, and restart the service.

> The migration restore creates the `mycloud` database and collections from the backup. You do not need to copy the raw `D:\MyCloudData\mongodb` folder from the laptop.

---

## 4. Install MongoDB Database Tools

Download and install **MongoDB Database Tools** for Windows x64 from <https://www.mongodb.com/try/download/database-tools>. The default location is under `C:\Program Files\MongoDB\Tools\100\bin` or `C:\Program Files\MongoDB\Database Tools\bin`.

Open a new PowerShell window and verify:

```powershell
mongodump --version
mongorestore --version
```

The restore script also searches these folders if `PATH` is not set:

- `C:\Program Files\MongoDB\Server\*\bin`
- `%USERPROFILE%\Tools\mongodb-database-tools\bin`
- `<app>\tools\mongodb-database-tools\bin`

---

## 5. Install NSSM and (optionally) FFmpeg

```powershell
winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements
```

FFmpeg is not required: the npm dependencies include `ffmpeg-static` and `ffprobe-static`, which are downloaded by `npm ci`. If you prefer a full local FFmpeg build, install it later and set `MYCLOUD_FFMPEG_PATH` / `MYCLOUD_FFPROBE_PATH`.

---

## 6. Copy, extract and place the files

1. Copy `MyCloud-Migration-20261102.zip` to the new PC with a USB drive or a direct network share.
2. Verify its SHA-256 if you recorded the value shown at the end of the migration session.
3. Extract it so the final layout is:

```text
C:\MyCloud\
  START-HERE.txt
  MIGRATION.md
  env.local.template
  app\
  data\
    mycloud-20261102-111111\
```

PowerShell method (adjust the download path if needed):

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\MyCloud-Migration-20261102.zip" -DestinationPath "C:\"
Move-Item -LiteralPath "C:\MyCloud-Migration-20261102" -Destination "C:\MyCloud"
```

If `C:\MyCloud` already exists, rename or remove it first.

Do not copy `node_modules` or `.next` from the laptop. They contain Windows binaries and build caches that should be regenerated. The next steps do that.

---

## 7. Create the data folders

If the new PC has a `D:` drive:

```powershell
New-Item -ItemType Directory -Force "D:\MyCloudStorage" | Out-Null
New-Item -ItemType Directory -Force "D:\MyCloudBackups" | Out-Null
```

If it does not, use folders outside the app:

```powershell
New-Item -ItemType Directory -Force "C:\MyCloudData\Storage" | Out-Null
New-Item -ItemType Directory -Force "C:\MyCloudData\Backups" | Out-Null
```

Whichever you choose, use the same paths in `.env.local`. Never choose a drive root and never choose a folder inside the storage folder for backups.

Find the new PC's LAN IPv4 address:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object InterfaceAlias,IPAddress
```

Example: `192.168.1.50`. A DHCP reservation keeps this stable.

---

## 8. Install dependencies and create `.env.local`

```powershell
Set-Location "C:\MyCloud\app"
npm ci
```

`npm ci` installs the exact locked dependency tree and downloads `sharp`, FFmpeg and ffprobe binaries. It can take several minutes.

Create the environment file:

```powershell
Copy-Item "C:\MyCloud\env.local.template" ".env.local"
npm run generate-secret
notepad .env.local
```

Paste the generated secret as `AUTH_SECRET`, and set at minimum:

```dotenv
NODE_ENV=production
AUTH_URL=http://192.168.1.50:3000
AUTH_TRUST_HOST=true
AUTH_SECRET=<paste the generated value>

MONGODB_URI=mongodb://127.0.0.1:27017/mycloud
MYCLOUD_STORAGE_PATH=D:\MyCloudStorage
MYCLOUD_BACKUP_PATH=D:\MyCloudBackups
```

Change `AUTH_URL` to the new PC's actual LAN address. If you use `C:\MyCloudData\Storage`, update `MYCLOUD_STORAGE_PATH` (and the backup path) accordingly. Keep `AUTH_SECRET` at 32+ characters and store it in a password manager.

Notes:

- A new `AUTH_SECRET` is intentional. It invalidates the old session cookies. Your account and password are restored from the database and still work.
- `MYCLOUD_STORAGE_PATH` must be absolute and must not be a drive root.
- `MYCLOUD_BACKUP_PATH` must not be inside the storage path.
- `MYCLOUD_TRUST_FORWARDED_HEADERS=true` matches the old setup. Keep it `true` behind Tailscale Serve. On a direct LAN, it is only as trustworthy as the LAN.

---

## 9. Restore the database and files

Make sure MongoDB is running and nothing is using port 3000:

```powershell
Get-Service MongoDB
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
```

Then restore:

```powershell
Set-Location "C:\MyCloud\app"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore.ps1 `
  -Source "C:\MyCloud\data\mycloud-20261102-111111"
```

Type `RESTORE` when prompted. `-Force` skips the prompt; use it only when you are certain.

Expected output:

```text
MyCloud restore
  Backup:      C:\MyCloud\data\mycloud-20261102-111111
  Created:     2026-11-02T...
  Mongo dump:  True
  Storage:     D:\MyCloudStorage

[1/2] Restoring storage...
  Storage restored.
[2/2] Restoring MongoDB...
  MongoDB restored.
```

Then synchronize indexes and verify configuration:

```powershell
npm run setup
```

Expected: `Storage layout: OK`, `MongoDB: connected, indexes synchronized`, and `Accounts: 1 total, 1 active administrator(s)` (the restored account).

---

## 10. Build and test before installing the service

```powershell
npm run build
npm run start:lan
```

In a second PowerShell window:

```powershell
Set-Location "C:\MyCloud\app"
npm run healthcheck
```

Expected:

```text
HTTP 200 {"status":"ok","database":"ok","storage":"ok",...}
```

Open from the new PC:

```text
http://127.0.0.1:3000
```

Open from another device on the same network:

```text
http://<new-pc-lan-ip>:3000
```

Sign in with the **existing administrator credentials** from the laptop. Verify:

- [ ] The existing file appears in the drive.
- [ ] The file downloads and its size is correct.
- [ ] The image thumbnail appears.
- [ ] A new small upload succeeds and generates a thumbnail.
- [ ] Trash, restore and star still work.
- [ ] Admin > Health shows database, storage, Sharp and FFmpeg healthy.

Stop the manual server with `Ctrl+C` before installing the service.

---

## 11. Install MyCloud as an auto-starting Windows service

Open **PowerShell as Administrator**:

```powershell
Set-Location "C:\MyCloud\app"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-service.ps1 -BindAddress 0.0.0.0
sc.exe config MyCloud depend= MongoDB
```

Use `-BindAddress 0.0.0.0` for direct LAN access. If you will use **only** Tailscale Serve, omit it so the app stays on `127.0.0.1`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-service.ps1
sc.exe config MyCloud depend= MongoDB
```

Verify:

```powershell
Get-Service MongoDB, MyCloud
npm run healthcheck
```

The service is configured for automatic startup and restart-on-failure, with logs at:

```text
C:\MyCloud\app\logs\service.out.log
C:\MyCloud\app\logs\service.error.log
```

---

## 12. Firewall, backups and optional Tailscale

### Firewall (elevated)

For direct LAN access:

```powershell
Set-Location "C:\MyCloud\app"
npm run setup:firewall -- -AllowLan
```

This also blocks inbound MongoDB 27017. Only use LAN mode on a trusted network; plain HTTP is not encrypted.

For Tailscale-only access, run `npm run setup:firewall` without `-AllowLan`; Tailscale Serve needs no inbound port.

### Scheduled backups (elevated)

```powershell
Set-Location "C:\MyCloud\app"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-backup-task.ps1 `
  -Time "02:30" -Keep 14 -Destination "D:\MyCloudBackups"
```

Run one immediately and inspect the log:

```powershell
Start-ScheduledTask -TaskName "MyCloud Backup"
Start-Sleep -Seconds 30
Get-Content .\logs\backup.log -Tail 60
Get-Service MyCloud
```

If there is no `D:` drive, use the backup path you configured.

### Optional: Tailscale Serve (recommended for phone/remote access)

```powershell
Set-Location "C:\MyCloud\app"
npm run setup:tailscale
```

It prints a `https://<machine>.<tailnet>.ts.net` URL. Then:

1. Set `AUTH_URL=https://<machine>.<tailnet>.ts.net` in `.env.local`.
2. Keep `MYCLOUD_TRUST_FORWARDED_HEADERS=true`.
3. If you installed the service with `-BindAddress 0.0.0.0`, either reinstall with the default loopback bind or keep the firewall closed to the LAN.
4. Restart the service:

```powershell
Restart-Service MyCloud
npm run healthcheck
```

Do not enable Tailscale Funnel. Do not port-forward 3000 or 27017 on the router.

---

## 13. Cut over and retire the laptop copy

1. Confirm the new PC works from another device and that a reboot brings both services back.
2. Stop MyCloud on the laptop so it is no longer used:
   - stop the terminal running `npm run start:lan`, or
   - stop the `MyCloud` service if installed.
3. Update bookmarks to the new PC's URL.
4. Keep the laptop's disk untouched for a few days as a cold fallback. Do **not** keep adding files there.
5. After you are satisfied, delete the migration ZIP and the extracted `C:\MyCloud\data` folder to remove the duplicate copy of your data. Keep the live storage and your scheduled backups.

Important: if you upload files to the new PC, then go back to the laptop copy, the two databases/storage trees will diverge. There is no automatic merge. Pick one live server.

---

## 14. Reboot test and final checklist

Restart the new PC, log in to Windows, and do **not** start anything manually:

```powershell
Get-Service MongoDB, MyCloud
npm run healthcheck
```

Checklist:

- [ ] MongoDB and MyCloud are `Running` and set to `Automatic`.
- [ ] Health returns `200` and `status: ok`.
- [ ] Login works with the migrated admin account.
- [ ] Existing file downloads and previews.
- [ ] New upload + thumbnail works.
- [ ] LAN or Tailscale access works from a phone/laptop.
- [ ] Inbound 27017 is blocked from other devices.
- [ ] Scheduled backup task exists and the first run succeeded.
- [ ] `AUTH_SECRET` is stored in a password manager.
- [ ] Public sharing is still disabled unless you need it.
- [ ] The old laptop copy is stopped and will not be used again.

---

## 15. Troubleshooting

### Login redirects to the old laptop/IP or loops

`AUTH_URL` must exactly match the URL in the browser. Edit `.env.local`, then:

```powershell
Restart-Service MyCloud
```

Clear cookies for the old and new origins.

### The new PC is unreachable from other devices

- The app must be bound to `0.0.0.0` for direct LAN access (`npm run start:lan`, or the service installed with `-BindAddress 0.0.0.0`).
- Check the listener:

  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress,OwningProcess
  ```

  `0.0.0.0` or the LAN IP is required; `127.0.0.1` is loopback only.
- Run `npm run setup:firewall -- -AllowLan` elevated.
- Confirm both devices are on the same subnet and the network is Private.
- Disable router/AP client isolation for your own network; guest Wi-Fi often blocks device-to-device traffic.
- The LAN IP may have changed. Reserve it in the router and update `AUTH_URL`.

### Restore refuses to run

It refuses when port 3000 is listening or the `MyCloud` service is running. Stop the manual server or:

```powershell
Stop-Service MyCloud -ErrorAction SilentlyContinue
```

Also confirm the source folder contains `manifest.json` and `mongo.archive.gz`.

### `mongorestore` or `mongodump` not found

Install MongoDB Database Tools, open a new PowerShell window, and verify `mongorestore --version`. The scripts also search the standard install folders listed in section 4.

### Service will not start

```powershell
Get-Content C:\MyCloud\app\logs\service.error.log -Tail 80
Get-Content C:\MyCloud\app\logs\service.out.log -Tail 80
```

Common causes: no `.next\BUILD_ID` (run `npm run build`), `.env.local` unreadable by the service account, Node path changed, port 3000 already used, MongoDB stopped.

Reproduce manually with the same command:

```powershell
Set-Location "C:\MyCloud\app"
node .\node_modules\next\dist\bin\next start -H 0.0.0.0 -p 3000
```

### `/api/health` returns 503

```powershell
Get-Service MongoDB
Get-Content D:\MyCloudData\logs\mongod.log -Tail 80
Test-Path D:\MyCloudStorage
```

Check the MongoDB URI, storage path, free space and NTFS permissions.

### I lost the admin password

Local access to the server is the recovery path. With an existing admin account, create another administrator from the app folder:

```powershell
Set-Location "C:\MyCloud\app"
npm run setup:admin
```

Or restore a database backup whose credentials you know. There is no email reset.

### The restored database looks empty

Confirm restore reported success and that `mongorestore` found `mongo.archive.gz`. Re-run `npm run setup`. Do not run `npm run setup` on the laptop after cutover.

### Everything is logged out after the move

Expected: the new `AUTH_SECRET` invalidates old cookies. Sign in again.

---

## 16. Rollback

Until you start writing new data to the new PC, rollback is simple:

1. Stop MyCloud on the new PC.
2. Start the laptop copy again with `npm run start:lan`.
3. Continue using the laptop.

The laptop's database and storage still contain the state captured at migration time. Any files uploaded to the new PC after cutover will not be on the laptop. For that reason, verify the new installation thoroughly before uploading important new data.

---

## 17. Security notes

- The migration ZIP contains all file bytes, password hashes, audit records and share metadata. Treat it like the server disk itself.
- Delete the ZIP and the extracted `data` folder after a verified migration.
- Never commit `.env.local` or paste `AUTH_SECRET` into chat, email or tickets.
- Keep MongoDB on `127.0.0.1:27017` and block inbound 27017 at the firewall.
- Keep MyCloud on a trusted LAN or Tailscale. Do not expose it to the public internet on Next.js 14.2.5.
- Enable BitLocker on the storage and backup volumes.
- Keep at least one backup off the machine.

---

## 18. Quick command summary

```powershell
# On the new PC, elevated where noted
winget install --id OpenJS.NodeJS.LTS -e
winget install --id NSSM.NSSM -e
# Install MongoDB 8 + Database Tools with their installers

Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\MyCloud-Migration-20261102.zip" -DestinationPath "C:\"
Move-Item "C:\MyCloud-Migration-20261102" "C:\MyCloud"

New-Item -ItemType Directory -Force "D:\MyCloudStorage", "D:\MyCloudBackups" | Out-Null

Set-Location "C:\MyCloud\app"
npm ci
Copy-Item "C:\MyCloud\env.local.template" ".env.local"
npm run generate-secret
notepad .env.local                  # paste secret, set AUTH_URL + paths

Get-Service MongoDB                 # must be Running
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore.ps1 `
  -Source "C:\MyCloud\data\mycloud-20261102-111111"

npm run setup
npm run build
npm run start:lan                   # test, then Ctrl+C

# Elevated: install services
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-service.ps1 -BindAddress 0.0.0.0
sc.exe config MyCloud depend= MongoDB
npm run setup:firewall -- -AllowLan
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-backup-task.ps1 `
  -Time "02:30" -Keep 14 -Destination "D:\MyCloudBackups"

Get-Service MongoDB, MyCloud
npm run healthcheck
```
