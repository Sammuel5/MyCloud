# MyCloud - complete Windows deployment and activation tutorial

This guide takes a clean Windows 10/11 machine to a working, private MyCloud server with:

- local MongoDB metadata;
- local filesystem storage;
- a production Next.js build;
- an administrator account;
- an auto-starting Windows service;
- private HTTPS from phones and laptops over Tailscale;
- firewall protection for MongoDB;
- consistent scheduled backups and a tested restore procedure.

It also documents the exact state of the existing installation in `C:\Users\Sam\Desktop\MyCloud` and the remaining activation steps.

For the simplest everyday "start it and use it" instructions, see [RUN-OFFLINE.md](RUN-OFFLINE.md).

> **Read this first:** MyCloud is pinned to Next.js 14.2.5 and has known production advisories. Keep it on a trusted tailnet or LAN. Do not port-forward it, do not use Tailscale Funnel, and do not expose it to the public internet. See [README.md](../README.md#known-dependency-advisories) and [SECURITY.md](SECURITY.md).

---

## 0. Conventions used in this guide

- Commands are PowerShell. Run a normal PowerShell window unless a step says **elevated**.
- "Elevated" means: right-click **Windows PowerShell** or **Terminal** and choose **Run as administrator**.
- The application folder in this installation is:

  ```powershell
  $AppDir = "C:\Users\Sam\Desktop\MyCloud"
  ```

  If you move the application to a permanent location such as `C:\MyCloud\app`, change `$AppDir` in every command and reinstall the service so NSSM points at the new path.

- Storage in this installation is `C:\MyCloudStorage`; backups are `D:\MyCloudBackups`.
- Never paste real passwords or `AUTH_SECRET` into documentation, chat, tickets or source control.

### Recommended disk layout

```text
C:\Users\Sam\Desktop\MyCloud     application code and node_modules
C:\MyCloudStorage               user files and thumbnails
D:\MyCloudData\mongodb          MongoDB database files
D:\MyCloudData\logs             MongoDB logs
D:\MyCloudBackups               backups (external/NAS copy too)
```

Keeping files, database and backups on different volumes is better. At minimum, keep backups off the machine.

---

## 1. Prerequisites

### 1.1 Hardware and operating system

- Windows 10 or Windows 11, 64-bit.
- NTFS volumes for the app, storage and MongoDB.
- Enough free space for files, thumbnails, MongoDB and at least one full backup.
- A UPS is recommended for an always-on server.

### 1.2 Network model

Recommended:

```text
Phone/laptop --Tailscale encrypted tunnel--> Windows PC
                                             |-- MyCloud on 127.0.0.1:3000
                                             |-- MongoDB on 127.0.0.1:27017
```

The only inbound path is Tailscale Serve, which terminates HTTPS and proxies to loopback. MongoDB and port 3000 are never exposed to the LAN or internet.

Alternative: a trusted private LAN with Windows Firewall restrictions. This does not encrypt traffic unless you add a local HTTPS reverse proxy.

### 1.3 Accounts

Use a Windows account that can run services and access the storage disk. The NSSM service installed by this project runs as `LocalSystem`, which has access to local disks. If you change the service account later, grant it access to:

- the application folder (read/execute);
- `.env.local` (read);
- `MYCLOUD_STORAGE_PATH` (modify);
- the logs folder (modify).

---

## 2. Install Node.js

Install the current Node.js LTS, version 20.11 or newer. This installation was verified with Node 24.18.0.

Using winget:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

Or download the Windows x64 LTS installer from <https://nodejs.org/en/download>.

Open a **new** PowerShell window and verify:

```powershell
node -v
npm -v
```

Expected: Node `v20.11.0` or newer.

Notes:

- Do not use a Node version manager for the service account. NSSM stores the absolute path to `node.exe`; nvm-style paths can change and break the service.
- `npm ci` compiles/downloads native packages (`sharp`, FFmpeg static binaries). Allow several minutes.

---

## 3. Install MongoDB 8.0 as a Windows service

MyCloud needs MongoDB only on loopback. Never bind it to `0.0.0.0`, never port-forward `27017`, and never put it on a shared network.

Choose **one** of the two options below.

### Option A - MongoDB Community Server MSI (recommended for a new machine)

1. Download **MongoDB Community Server 8.0 for Windows x64** from <https://www.mongodb.com/try/download/community>.
2. Run the `.msi`.
3. Choose **Complete** setup.
4. Keep **Install MongoDB as a Service** selected.
5. Service name: `MongoDB`.
6. Service account: **Network Service** (default) or a dedicated low-privilege account.
7. Set data and log directories if you want them off `C:`:
   - Data: `D:\MyCloudData\mongodb`
   - Log: `D:\MyCloudData\logs\mongod.log`
8. Finish the installer.

Verify and inspect the config:

```powershell
Get-Service MongoDB
Get-Content "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"
```

Ensure the `net` section binds loopback only:

```yaml
net:
  bindIp: 127.0.0.1
  port: 27017
```

If you change the config, restart the service:

```powershell
Restart-Service MongoDB
Get-Service MongoDB
```

### Option B - Portable MongoDB ZIP installed as a service

Use this if you already run a portable MongoDB (as on the current machine) or do not want an MSI.

1. Download the MongoDB 8.0 Windows x64 ZIP from the MongoDB download center or archive.
2. Extract it to a stable folder, for example:

   ```text
   C:\Users\Sam\Tools\mongodb-8.0.34
   ```

3. Create the data and log folders:

   ```powershell
   New-Item -ItemType Directory -Force D:\MyCloudData\mongodb | Out-Null
   New-Item -ItemType Directory -Force D:\MyCloudData\logs | Out-Null
   ```

4. Create the config file:

   ```powershell
   @'
   storage:
     dbPath: D:\MyCloudData\mongodb
   systemLog:
     destination: file
     path: D:\MyCloudData\logs\mongod.log
     logAppend: true
   net:
     bindIp: 127.0.0.1
     port: 27017
   '@ | Set-Content -LiteralPath "C:\Users\Sam\Tools\mongodb-8.0.34\mongod-mycloud.cfg" -Encoding UTF8
   ```

5. If a manual `mongod` is currently running, stop it before installing the service:

   ```powershell
   Get-Process mongod -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

6. Open an **elevated** PowerShell and install the service:

   ```powershell
   & "C:\Users\Sam\Tools\mongodb-8.0.34\bin\mongod.exe" `
     --config "C:\Users\Sam\Tools\mongodb-8.0.34\mongod-mycloud.cfg" `
     --install `
     --serviceName MongoDB `
     --serviceDisplayName "MongoDB 8.0 (MyCloud)" `
     --serviceDescription "Local MongoDB database for MyCloud. Bound to 127.0.0.1 only."
   ```

7. Start it and verify:

   ```powershell
   Start-Service MongoDB
   Get-Service MongoDB
   ```

8. Confirm it is listening only on loopback:

   ```powershell
   Get-NetTCPConnection -LocalPort 27017 -State Listen |
     Select-Object LocalAddress, LocalPort, OwningProcess
   ```

   `LocalAddress` must be `127.0.0.1` or `::1`, never `0.0.0.0`.

### Convert the current manual MongoDB to a service (this machine)

The current installation runs MongoDB manually from `C:\Users\Sam\Tools\mongodb-8.0.34` with `mongod-mycloud.cfg` and data in `D:\MyCloudData\mongodb`. To make it survive reboots:

1. Stop the manual process:

   ```powershell
   Get-Process mongod -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

2. In an **elevated** PowerShell, run the `--install` command from Option B step 6.
3. Start and verify:

   ```powershell
   Start-Service MongoDB
   Get-Service MongoDB
   ```

4. If a service named `MongoDB` already exists, inspect it first instead of duplicating:

   ```powershell
   Get-CimInstance Win32_Service -Filter "Name='MongoDB'" | Select-Object Name, State, StartMode, PathName
   ```

### Verify MongoDB responds

```powershell
Test-NetConnection 127.0.0.1 -Port 27017
```

`TcpTestSucceeded` should be `True`. If it is false:

- check `Get-Service MongoDB`;
- read `D:\MyCloudData\logs\mongod.log`;
- confirm `bindIp` and `dbPath` are correct;
- make sure the service account can write to the data and log folders.

---

## 4. Install MongoDB Database Tools

The backup and restore scripts use `mongodump` and `mongorestore`. These are not included with the MongoDB server ZIP.

### Option A - MSI

Download **MongoDB Database Tools** for Windows x64 from <https://www.mongodb.com/try/download/database-tools> and install it. The default location is under `C:\Program Files\MongoDB\Tools\100\bin` or `C:\Program Files\MongoDB\Database Tools\bin`.

### Option B - ZIP (used on this machine)

```powershell
$version = "100.19.1"
$zip = "$env:TEMP\mongodb-database-tools.zip"
Invoke-WebRequest `
  -Uri "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-$version.zip" `
  -OutFile $zip

$target = "$env:USERPROFILE\Tools\mongodb-database-tools"
$temp = "$env:TEMP\mongodb-database-tools-extract"
Remove-Item -LiteralPath $target, $temp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $zip -DestinationPath $temp
$inner = Get-ChildItem -LiteralPath $temp -Directory | Select-Object -First 1
Move-Item -LiteralPath $inner.FullName -Destination $target
```

Add `bin` to the user `PATH`:

```powershell
$toolBin = "$env:USERPROFILE\Tools\mongodb-database-tools\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
$parts = $userPath -split ";" | Where-Object { $_ }
if ($parts -notcontains $toolBin) {
  [Environment]::SetEnvironmentVariable("Path", (($parts + $toolBin) -join ";"), "User")
}
```

Open a new PowerShell window and verify:

```powershell
mongodump --version
mongorestore --version
```

If the commands are not found, the backup scripts also search:

- `C:\Program Files\MongoDB\Server\*\bin`
- `%USERPROFILE%\Tools\mongodb-database-tools\bin`
- `<app>\tools\mongodb-database-tools\bin`
- `<app>\tools`

---

## 5. Install or verify FFmpeg

MyCloud ships with `ffmpeg-static` and `ffprobe-static`, so video thumbnails and metadata normally work after `npm ci` with no extra install.

Verify the bundled binaries:

```powershell
Set-Location $AppDir
node -e "console.log(require('ffmpeg-static'))"
node -e "console.log(require('ffprobe-static').path)"
```

If both paths exist, no further action is needed.

For a more recent FFmpeg, install a Windows build (for example from <https://www.gyan.dev/ffmpeg/builds/>), extract it, and set explicit paths in `.env.local`:

```dotenv
MYCLOUD_FFMPEG_PATH=C:\Users\Sam\Tools\ffmpeg\bin\ffmpeg.exe
MYCLOUD_FFPROBE_PATH=C:\Users\Sam\Tools\ffmpeg\bin\ffprobe.exe
```

Verify:

```powershell
& "C:\Users\Sam\Tools\ffmpeg\bin\ffmpeg.exe" -version
& "C:\Users\Sam\Tools\ffmpeg\bin\ffprobe.exe" -version
```

If FFmpeg is unavailable, uploads still work but image thumbnails require `sharp` and video thumbnails/metadata are skipped. The admin health page reports both.

---

## 6. Place the application and install dependencies

```powershell
$AppDir = "C:\Users\Sam\Desktop\MyCloud"
Set-Location $AppDir
```

For a long-lived server, consider moving the folder somewhere not under `Downloads`, for example `C:\MyCloud\app`, then updating the service path and rebuilding.

Install exact locked dependencies:

```powershell
npm ci
```

If you are developing and intentionally changing dependencies, use `npm install` instead. Do not mix the two casually.

Optional verification before configuration:

```powershell
npm run typecheck
npm test
```

The project contains 63 Vitest unit tests. All should pass.

---

## 7. Configure `.env.local`

The repository includes `.env.example`. Create `.env.local` from it:

```powershell
Set-Location $AppDir
if (-not (Test-Path .env.local)) {
  Copy-Item .env.example .env.local
}
```

Generate a secret:

```powershell
npm run generate-secret
```

Copy the printed value into `.env.local` as `AUTH_SECRET`. Then edit the file:

```powershell
notepad .env.local
```

A correct production configuration looks like this (replace the secret and Tailscale name):

```dotenv
NODE_ENV=production

AUTH_URL=https://mycloud.your-tailnet.ts.net
AUTH_TRUST_HOST=true
AUTH_SECRET=<the generated value>

MONGODB_URI=mongodb://127.0.0.1:27017/mycloud
MYCLOUD_STORAGE_PATH=C:\MyCloudStorage
MYCLOUD_BACKUP_PATH=D:\MyCloudBackups

MYCLOUD_MAX_UPLOAD_BYTES=21474836480
MYCLOUD_CHUNK_SIZE_BYTES=33554432
MYCLOUD_DEFAULT_QUOTA_BYTES=0
MYCLOUD_TEMP_UPLOAD_HOURS=24
MYCLOUD_SESSION_DAYS=7
MYCLOUD_TRASH_RETENTION_DAYS=30

MYCLOUD_DISABLE_WORKER=false
MYCLOUD_FFMPEG_PATH=
MYCLOUD_FFPROBE_PATH=
MYCLOUD_APP_NAME=MyCloud
MYCLOUD_LOG_LEVEL=info
MYCLOUD_TRUST_FORWARDED_HEADERS=true
```

Important:

- `AUTH_SECRET` must be at least 32 characters. Changing it invalidates all existing login sessions.
- `MYCLOUD_STORAGE_PATH` must be absolute and must not be a drive root (`D:\` is rejected).
- Start with `AUTH_URL=http://localhost:3000` for local testing, then change it to the Tailscale HTTPS URL before using the phone.
- `MYCLOUD_TRUST_FORWARDED_HEADERS=true` is appropriate only when a local reverse proxy (Tailscale Serve/Caddy/IIS) is the only path to the app.
- `MYCLOUD_BACKUP_PATH` must not point inside `MYCLOUD_STORAGE_PATH`.

Protect the env file. The service runs as `LocalSystem`, so grant SYSTEM read access while keeping normal users out:

```powershell
$envPath = Join-Path $AppDir ".env.local"
$currentUser = "$env:USERDOMAIN\$env:USERNAME"
icacls $envPath /inheritance:r /grant:r "${currentUser}:(R,W)" "*S-1-5-18:(R)" "*S-1-5-32-544:(F)"
```

`*S-1-5-18` is `SYSTEM`; `*S-1-5-32-544` is the local Administrators group. If you later run the service under a dedicated account, grant that account read access too.

Create the storage folder:

```powershell
New-Item -ItemType Directory -Force "C:\MyCloudStorage" | Out-Null
New-Item -ItemType Directory -Force "D:\MyCloudBackups" | Out-Null
```

If you plan to run the service as `LocalSystem`, no extra storage ACL is normally needed. If the disk has restrictive permissions, grant it explicitly:

```powershell
icacls "C:\MyCloudStorage" /grant "*S-1-5-18:(OI)(CI)F" /T
```

---

## 8. Initialize MyCloud

Make sure MongoDB is running:

```powershell
Get-Service MongoDB
Start-Service MongoDB   # only if stopped
```

Run first-run setup:

```powershell
Set-Location $AppDir
npm run setup
```

`npm run setup`:

- validates `AUTH_SECRET`, `MONGODB_URI` and `MYCLOUD_STORAGE_PATH`;
- creates the storage layout (`files`, `thumbnails`, `previews`, `temp`);
- connects to MongoDB and synchronizes indexes;
- creates default system settings;
- reports FFmpeg/FFprobe availability;
- tells you whether an administrator exists.

Expected result includes:

```text
Storage layout: OK
MongoDB: connected, indexes synchronized
Accounts: 0 total, 0 active administrator(s)
No administrator exists yet. Create one with:
  npm run setup:admin
```

Run setup again after schema/index changes and after every restore.

---

## 9. Create the first administrator

Run this in an **interactive** terminal. Do not try to automate it or put the password on the command line.

```powershell
Set-Location $AppDir
npm run setup:admin
```

Prompts:

1. Display name.
2. Email address.
3. Password (hidden).
4. Confirm password (hidden).

Password rules:

- 12 to 128 characters;
- at least one lowercase letter;
- at least one uppercase letter;
- at least one number;
- at least one symbol.

The password is hashed with bcrypt cost 12 and cannot be recovered. Store it in a password manager. If you lose it, create another administrator account with `npm run setup:admin` while you still have admin access, or restore a known-good database backup.

To intentionally allow more administrators without the confirmation prompt:

```powershell
npm run setup:admin -- --force
```

There is no email-based password reset by design.

---

## 10. Build and start manually

```powershell
Set-Location $AppDir
npm run build
npm start
```

Expected:

```text
Next.js 14.2.5
Local: http://127.0.0.1:3000
Background worker started
Ready
MongoDB connected
```

In a second PowerShell window:

```powershell
Set-Location $AppDir
npm run healthcheck
```

Expected:

```text
HTTP 200 {"status":"ok","database":"ok","storage":"ok",...}
```

Open <http://127.0.0.1:3000>, sign in, and complete the first-run checklist:

- [ ] Login succeeds with the new administrator.
- [ ] Create a folder, upload a small image and a short video.
- [ ] Image thumbnail appears after a few seconds.
- [ ] Video thumbnail and metadata appear; video seeks in the preview.
- [ ] Download a file and verify its size/hash if important.
- [ ] Rename, move, copy, star, trash and restore an item.
- [ ] Empty/restore from trash; permanently delete a disposable item.
- [ ] Open **Admin > Settings**, enable public sharing temporarily, create a password-protected link, test it in a private window, revoke it, then **disable public sharing again**.
- [ ] Create a normal user in **Admin > Users**; their first login should force a password change.
- [ ] Share a folder with that user as viewer and confirm they cannot rename or delete the owner's items.
- [ ] Check **Admin > Health** and **Admin > Audit**.
- [ ] Check **Settings > Sessions** and revoke a session from another browser.

Stop the manual server with `Ctrl+C` before installing the Windows service.

---

## 11. Install MyCloud as a Windows service (NSSM)

NSSM runs the Next.js production server under Windows Service Control Manager, restarts it on failure, rotates logs, and starts it at boot.

### 11.1 Install NSSM

Using winget:

```powershell
winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements
```

Or download NSSM 2.24 from <https://nssm.cc/download>, extract it, and copy `win64\nssm.exe` to a stable folder such as `C:\Tools\nssm\nssm.exe`.

Verify:

```powershell
Get-Command nssm
# or:
Test-Path C:\Tools\nssm\nssm.exe
```

### 11.2 Install the service

Open an **elevated** PowerShell:

```powershell
Set-Location $AppDir
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-service.ps1
```

If NSSM is not on `PATH`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-service.ps1 `
  -NssmPath "C:\Tools\nssm\nssm.exe"
```

The script:

- verifies `.next\BUILD_ID`, `.env.local`, Node and the Next.js CLI;
- installs (or reconfigures) a service named `MyCloud`;
- runs `node node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000`;
- sets automatic startup, restart-on-failure and log rotation;
- writes logs to `logs\service.out.log` and `logs\service.error.log`.

### 11.3 Verify

```powershell
Get-Service MongoDB, MyCloud
Get-Process node,mongod -ErrorAction SilentlyContinue
npm run healthcheck
```

If MyCloud starts before MongoDB is ready, add a service dependency so MongoDB starts first:

```powershell
sc.exe config MyCloud depend= MongoDB
```

(Use the actual MongoDB service name if it is not `MongoDB`.) Then:

```powershell
Restart-Service MyCloud
```

Test a reboot when convenient:

```powershell
Restart-Computer
```

After reboot, without signing in, verify from another device on the tailnet (once Tailscale is configured) or locally:

```powershell
Get-Service MongoDB, MyCloud
npm run healthcheck
```

### 11.4 Service operations

```powershell
Get-Service MyCloud
Start-Service MyCloud
Stop-Service MyCloud
Restart-Service MyCloud
nssm edit MyCloud          # graphical editor, elevated
Get-Content .\logs\service.out.log -Tail 50 -Wait
Get-Content .\logs\service.error.log -Tail 50
```

After changing code or `.env.local`:

```powershell
Set-Location $AppDir
npm run build
Restart-Service MyCloud
```

If you change `next.config.mjs`, `package.json` or dependencies, always rebuild before restarting.

---

## 12. Publish privately over Tailscale

Tailscale Serve gives you a real HTTPS certificate for a private `*.ts.net` name and proxies only to `127.0.0.1:3000`. It requires no inbound firewall port and does not expose the service to the public internet.

### 12.1 Install and connect Tailscale

Using winget:

```powershell
winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
```

Or install from <https://tailscale.com/download/windows>.

Sign in, then verify:

```powershell
tailscale status
```

If the CLI is not on `PATH`, use:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" status
```

### 12.2 Enable MagicDNS and HTTPS certificates

In the Tailscale admin console:

1. Open **DNS**.
2. Enable **MagicDNS**.
3. Enable **HTTPS Certificates**.
4. Confirm the Windows machine has a stable machine name (for example `mycloud`).
5. In **Machines**, consider disabling key expiry for this always-on server so it does not silently drop off the tailnet.

### 12.3 Configure Tailscale Serve

```powershell
Set-Location $AppDir
npm run setup:tailscale
```

Or manually:

```powershell
tailscale serve --bg --https=443 http://127.0.0.1:3000
tailscale serve status
```

Find your URL:

```powershell
$status = tailscale status --json | ConvertFrom-Json
$status.Self.DNSName.TrimEnd(".")
```

It looks like `mycloud.tailnet-name.ts.net`. The HTTPS URL is:

```text
https://mycloud.tailnet-name.ts.net
```

### 12.4 Point `AUTH_URL` at the Tailscale name

Edit `.env.local`:

```dotenv
AUTH_URL=https://mycloud.tailnet-name.ts.net
AUTH_TRUST_HOST=true
MYCLOUD_TRUST_FORWARDED_HEADERS=true
```

Rebuild only if you changed build-time configuration; for an env-only change, restart the service:

```powershell
Restart-Service MyCloud
npm run healthcheck
```

Open the HTTPS URL on the server and on a phone that is signed in to the same tailnet. Login should redirect back to the `*.ts.net` origin, not to `localhost`.

### 12.5 Tailscale rules

- Use **Serve**, not **Funnel**. Funnel publishes to the public internet.
- Keep the tailnet ACL restricted to your own devices/users.
- Do not also port-forward 3000 or 27017 on your router.
- Tailscale Serve configuration persists across reboots; verify with `tailscale serve status` after changes.
- If the phone cannot load the page, confirm the phone's Tailscale app is connected and the server machine is online.

---

## 13. Firewall configuration

Open an **elevated** PowerShell:

```powershell
Set-Location $AppDir
npm run setup:firewall
```

This creates inbound block rules for TCP and UDP port 27017 on all profiles. It does not open port 3000; Tailscale Serve needs no inbound rule.

Verify from another machine on the LAN (if applicable):

```powershell
Test-NetConnection <server-lan-ip> -Port 27017
```

`TcpTestSucceeded` should be `False`.

### Optional trusted-LAN web access

Only if you deliberately want browsers on the LAN to connect directly:

```powershell
npm run setup:firewall -- -AllowLan
```

Then:

1. Reconfigure the service to bind `0.0.0.0` (NSSM `AppParameters` change) or use `npm run start:lan`.
2. Set `AUTH_URL` to the exact URL clients use, for example `http://192.168.1.20:3000`.
3. Restart the service.
4. Understand that plain HTTP sends passwords and session cookies unencrypted over the LAN.

Tailscale Serve is safer and is the recommended remote-access method.

---

## 14. Backups

### 14.1 What a backup contains

```text
D:\MyCloudBackups\mycloud-YYYYMMDD-HHMMSS\
  storage\            storage tree, temporary uploads excluded
  mongo.archive.gz    MongoDB dump (metadata, users, hashes, audit)
  manifest.json       creation time, host, included components
```

A backup is sensitive: it contains password hashes, audit records and all user files. Encrypt the backup drive (BitLocker) and restrict access.

### 14.2 Manual backup

Live backup (the app may be running, but the result is only crash-consistent):

```powershell
Set-Location $AppDir
npm run backup
```

Choose a destination and retention explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup.ps1 `
  -Destination "D:\MyCloudBackups" -Keep 14
```

Storage-only backup, no MongoDB:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup.ps1 -SkipDatabase
```

Do not use storage-only backups as your primary disaster recovery: database and files must match.

### 14.3 Consistent backup while the service is running

For the best consistency, stop the app while copying storage and dumping MongoDB. Use the wrapper:

```powershell
Set-Location $AppDir
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\scheduled-backup.ps1 `
  -Destination "D:\MyCloudBackups" -Keep 14
```

It:

1. stops the `MyCloud` service if it is running;
2. waits for it to stop;
3. runs `backup.ps1`;
4. restarts the service in a `finally` block, even if the backup fails;
5. appends output to `logs\backup.log`.

MongoDB keeps running; `mongodump` produces a consistent logical dump while MongoDB is up.

### 14.4 Schedule daily backups

Open an **elevated** PowerShell:

```powershell
Set-Location $AppDir
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-backup-task.ps1 `
  -Time "02:30" -Keep 14 -Destination "D:\MyCloudBackups"
```

The task:

- runs as `SYSTEM` with highest privileges;
- runs daily at the specified local time;
- starts late if the machine was asleep/off (`StartWhenAvailable`);
- calls `scheduled-backup.ps1`, which stops and restarts the service;
- keeps the newest 14 backups (the backup script prunes older `mycloud-*` folders).

Verify:

```powershell
Get-ScheduledTask -TaskName "MyCloud Backup"
Get-ScheduledTaskInfo -TaskName "MyCloud Backup"

# Run it once now and inspect the log:
Start-ScheduledTask -TaskName "MyCloud Backup"
Start-Sleep -Seconds 30
Get-Content .\logs\backup.log -Tail 60
Get-Service MyCloud
```

Remove the task:

```powershell
Unregister-ScheduledTask -TaskName "MyCloud Backup" -Confirm:$false
```

### 14.5 Backup hygiene

- Keep at least one copy on a different physical device, ideally off-site and encrypted.
- Periodically test a restore on a spare machine or spare storage path.
- Back up `.env.local` separately in a password manager or secure vault. It is not included in the backup. If lost, accounts and files remain, but all sessions are invalidated when a new `AUTH_SECRET` is generated.
- Do not put the backup destination inside `MYCLOUD_STORAGE_PATH`; the script rejects that.
- Monitor free space. A full disk stops uploads and backups.

---

## 15. Restore

Restore replaces the current storage tree and, when present, drops and restores the MongoDB database. Treat it as destructive.

### 15.1 Restore on the same machine

1. Stop the service and any manual server:

   ```powershell
   Stop-Service MyCloud -ErrorAction SilentlyContinue
   Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
   ```

   The second command must return nothing. If a manual `npm start` is running, press `Ctrl+C` or stop the Node process.

2. Run the restore script:

   ```powershell
   Set-Location $AppDir
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore.ps1 `
     -Source "D:\MyCloudBackups\mycloud-20261101-204843"
   ```

3. Type `RESTORE` when prompted. For unattended restore, add `-Force`.

4. The script:
   - verifies `manifest.json`;
   - refuses to run if port 3000 is listening or the MyCloud service is running;
   - mirrors the backup storage tree over `MYCLOUD_STORAGE_PATH` using `robocopy /MIR`;
   - restores MongoDB with `mongorestore --drop` when the backup includes a database archive.

5. Re-run setup and start:

   ```powershell
   npm run setup
   Start-Service MyCloud
   npm run healthcheck
   ```

6. Sign in with the credentials that existed in the restored database. If the backup predates the admin account, no account will exist; run `npm run setup:admin`.

### 15.2 Restore to a new machine

1. Install Node.js, MongoDB, Database Tools and FFmpeg as in sections 2-5.
2. Copy the application folder (without `node_modules` is fine) to the new machine.
3. Create `.env.local` with new absolute paths. You may reuse the old `AUTH_SECRET` if you have it securely; otherwise generate a new one (all old sessions become invalid).
4. Create the empty storage folder.
5. Copy the backup folder to the new machine.
6. Run `scripts\restore.ps1 -Source <backup>`.
7. Run `npm ci`, `npm run setup`, `npm run build`.
8. Install the service and configure Tailscale.
9. Test login, file download, thumbnail generation and a new upload.

### 15.3 Restore verification on this machine

The backup at `D:\MyCloudBackups\mycloud-20261101-204843` was created from the cleaned empty database and storage. It is suitable for exercising the restore workflow without risking real data. Always make a fresh backup before restoring real data.

---

## 16. Upgrades and maintenance

### 16.1 Routine upgrade procedure

```powershell
Set-Location $AppDir

# 1. Back up first (consistent, service-aware)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\scheduled-backup.ps1 -Keep 14

# 2. Stop the service while replacing code
Stop-Service MyCloud

# 3. Update dependencies and verify
npm ci
npm run typecheck
npm test
npm run lint
npm run build

# 4. Synchronize indexes/settings and restart
npm run setup
Start-Service MyCloud
npm run healthcheck
```

If anything fails, restore the backup and the previous application folder.

### 16.2 Weekly/monthly maintenance

- Check `Get-Service MongoDB, MyCloud`.
- Check `npm run healthcheck` and **Admin > Health**.
- Review **Admin > Audit** for unexpected logins or deletions.
- Review disk free space (`Get-PSDrive D`).
- Confirm the scheduled backup ran (`Get-ScheduledTaskInfo`).
- Test one restore per quarter.
- Review sessions and revoke stale devices.
- Apply Windows, Node.js, MongoDB and Tailscale security updates on a maintenance window.
- Revisit the Next.js advisory situation (section 17).

### 16.3 Dependency security upgrades

The project is pinned to Next.js 14.2.5 by requirement. A patch within the same minor, `next@14.2.35`, fixes the currently reported Next.js and PostCSS advisories with low migration risk. It has **not** been applied here.

If you decide to upgrade Next.js:

```powershell
npm install next@14.2.35 eslint-config-next@14.2.35 --save-exact
npm run typecheck
npm test
npm run lint
npm run build
```

Then run the full first-run/upload/share smoke checklist in section 10. Major upgrades of `sharp`, `zod` and `file-type` are separate semver-major changes and require code review and testing.

Do not expose MyCloud to the internet on 14.2.5. If remote access is needed before upgrading, keep it inside Tailscale.

---

## 17. Troubleshooting

### The app starts but `/api/health` returns 503

```powershell
npm run healthcheck
Get-Service MongoDB
Get-Content D:\MyCloudData\logs\mongod.log -Tail 80
Test-Path C:\MyCloudStorage
```

Common causes: MongoDB stopped, wrong `MONGODB_URI`, storage path missing, storage not writable by the service account, disk full.

### `npm run setup` fails with `AUTH_SECRET must be configured...`

Generate a secret and put the full value in `.env.local`:

```powershell
npm run generate-secret
notepad .env.local
```

The value must be at least 32 characters. Do not leave the placeholder.

### `ECONNREFUSED 127.0.0.1:27017`

```powershell
Get-Service MongoDB
Start-Service MongoDB
Get-NetTCPConnection -LocalPort 27017 -State Listen
```

Check `mongod.cfg` for `bindIp: 127.0.0.1`, and check the MongoDB log for data-directory permission errors.

### Login redirects to `localhost` or loops

- `AUTH_URL` must exactly match the URL in the browser, including scheme and port.
- After changing it, restart the service.
- Clear cookies for both the old and new origins.
- With Tailscale Serve, `AUTH_TRUST_HOST=true` and `MYCLOUD_TRUST_FORWARDED_HEADERS=true` must be set.
- Confirm `tailscale serve status` still points at `http://127.0.0.1:3000`.

### Everyone is logged out after a restart

Changing `AUTH_SECRET`, restoring an older database, or revoking sessions invalidates cookies. This is expected. Sign in again.

### Uploads fail or stall

- Check free space on the storage volume.
- Check `MYCLOUD_MAX_UPLOAD_BYTES` and the per-user quota.
- A chunk is 32 MiB by default; do not put a proxy in front that rejects bodies above that. The browser uploads four chunks in parallel.
- Incomplete uploads expire after `MYCLOUD_TEMP_UPLOAD_HOURS`.
- Look at the browser network response and `logs\service.out.log`.
- Dangerous extensions (`.exe`, `.bat`, `.cmd`, `.ps1`, `.js`, `.scr`, `.msi`, etc.) are rejected by design, even if added to `MYCLOUD_ALLOWED_EXTENSIONS`.

### Images have no thumbnails

```powershell
node -e "require('sharp')"
```

Reinstall native dependencies if it fails:

```powershell
npm rebuild sharp
```

Check the worker:

- `MYCLOUD_DISABLE_WORKER` must be `false` unless you run `npm run worker` as a separate service.
- Check `logs\service.out.log` for "Background worker started" and thumbnail errors.
- **Admin > Health** reports Sharp/FFmpeg status.

### Videos have no thumbnails or metadata

```powershell
& "C:\Users\Sam\Tools\ffmpeg\bin\ffmpeg.exe" -version
& "C:\Users\Sam\Tools\ffmpeg\bin\ffprobe.exe" -version
```

Check `MYCLOUD_FFMPEG_PATH` and `MYCLOUD_FFPROBE_PATH` in `.env.local`, then restart the service. Avoid paths with unescaped quotes.

### Service will not start

```powershell
Get-Service MyCloud
Get-Content .\logs\service.error.log -Tail 80
Get-Content .\logs\service.out.log -Tail 80
```

Then reproduce manually with the same command:

```powershell
Set-Location $AppDir
node .\node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000
```

Common causes: missing `.next\BUILD_ID`, Node path changed, `.env.local` unreadable by SYSTEM, port 3000 occupied, MongoDB unavailable. Fix and restart.

### Port 3000 is already in use

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id <OwningProcess>
```

Stop the old manual server or the conflicting process. The restore script also refuses to run while port 3000 is listening.

### Backups fail with `mongodump was not found`

Open a new shell after changing `PATH`, verify `mongodump --version`, or install Database Tools in one of the folders the script searches (section 4). Do not skip the database backup for routine backups.

### Restore refuses to run

The script refuses if:

- `manifest.json` is missing or the folder is not a MyCloud backup;
- the storage target is a filesystem root;
- port 3000 is listening;
- the `MyCloud` service is running.

Stop the service and any manual server, then retry.

### Tailscale Serve shows an error or certificate warning

```powershell
tailscale status
tailscale serve status
tailscale cert mycloud.your-tailnet.ts.net
```

Enable MagicDNS and HTTPS Certificates in the admin console. Ensure the machine name and URL match `AUTH_URL`. Port 443 must not be used by another service on the machine.

### Access from the phone fails while local access works

- Install and connect the Tailscale app on the phone.
- Confirm both devices are in the same tailnet and ACL allows access.
- Use the `*.ts.net` HTTPS URL, not the LAN IP.
- Check Windows sleep settings; a sleeping PC is offline.
- Disable key expiry for the server or re-authenticate Tailscale.

### Disk or permission errors for storage

```powershell
icacls "C:\MyCloudStorage"
icacls "C:\MyCloudStorage" /grant "*S-1-5-18:(OI)(CI)F" /T
```

Also check that antivirus is not locking uploaded files. Do not disable security software globally; add a narrow exclusion only if you understand the risk.

### The app is healthy but the UI shows stale data

Hard-refresh the browser, check the clock/timezone, and inspect the browser console. The server returns `Cache-Control: no-store` for dynamic API/content responses.

---

## 18. Activation checklist

### Security and configuration

- [ ] `AUTH_SECRET` is random, at least 32 characters, and stored in a password manager.
- [ ] `.env.local` is not in source control and is readable only by the service account/administrators.
- [ ] MongoDB listens only on `127.0.0.1:27017`.
- [ ] MyCloud listens only on `127.0.0.1:3000` (unless you deliberately chose trusted LAN mode).
- [ ] Public sharing is disabled unless you actively need it.
- [ ] Windows Firewall blocks inbound 27017.
- [ ] Tailscale Funnel is **not** enabled.
- [ ] BitLocker/full-disk encryption is enabled on the storage and backup volumes.
- [ ] Backups go to a separate disk/device and are protected.

### Runtime

- [ ] MongoDB is a Windows service with automatic startup.
- [ ] MyCloud is a Windows service with automatic startup and restart-on-failure.
- [ ] The service starts after a reboot without an interactive login.
- [ ] `npm run healthcheck` returns HTTP 200 with `status: ok`.
- [ ] Admin health shows database, storage, Sharp and FFmpeg healthy.
- [ ] The worker is running exactly once (embedded or standalone, not both).
- [ ] At least one administrator exists and can sign in.
- [ ] A test upload, thumbnail, preview, download, share and trash/restore cycle succeeds.
- [ ] The phone can reach the HTTPS Tailscale URL and play a video.

### Recovery

- [ ] A fresh backup exists after the final configuration.
- [ ] The scheduled backup task exists and has run successfully at least once.
- [ ] A restore has been tested (at least against the empty-state backup).
- [ ] You know how to stop/start both services and where the logs are.

---

## 19. Exact remaining steps for this installation

As of **2026-11-04**, the code, production build, local MongoDB, storage, FFmpeg, administrator account and backups are working. MyCloud starts automatically when you sign in to Windows. For normal laptop use, follow [RUN-OFFLINE.md](RUN-OFFLINE.md) and ignore the optional steps below.

Optional, only if you need always-on or remote access:

1. **Start before the Windows login screen:** install MongoDB as a service (section 3, "Convert the current manual MongoDB...") and install NSSM plus the MyCloud service (section 11), both from an elevated shell. Remove the Startup shortcut afterwards to avoid a duplicate start.
2. **Access from outside the house:** configure Tailscale Serve (section 12), set `AUTH_URL` to the `*.ts.net` URL, and restart the service.
3. **Run the firewall script** (section 13) elevated.
4. **Install the scheduled backup task** (section 14.4) elevated and run it once.
5. **Reboot and verify** `Get-Service MongoDB, MyCloud`, `npm run healthcheck`, browser login and phone access.
6. Keep Next.js 14.2.5 private; plan the `14.2.35` patch upgrade and re-test.

For day-to-day operation in the current sign-in setup, the only commands you normally need are:

```powershell
Set-Location C:\Users\Sam\Desktop\MyCloud
.\Start-MyCloud.cmd
.\Stop-MyCloud.cmd
npm run healthcheck
Get-Content .\logs\app.out.log -Tail 50
```

If you later install the services, use:

```powershell
Get-Service MongoDB, MyCloud
Get-Content C:\Users\Sam\Desktop\MyCloud\logs\service.out.log -Tail 50
```
