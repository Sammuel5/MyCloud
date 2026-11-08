# MyCloud - everyday run guide for this laptop

This is the simple, offline-friendly guide for the MyCloud installation on this laptop.

Last verified: **2026-11-04**

| Item | Value |
| --- | --- |
| Application folder | `C:\Users\Sam\Desktop\MyCloud` |
| File storage | `C:\MyCloudStorage` |
| Backups | `D:\MyCloudBackups` |
| MongoDB program | `C:\Users\Sam\Tools\mongodb-8.0.34` |
| MongoDB data | `D:\MyCloudData\mongodb` |
| Web address on this laptop | <http://localhost:3000> |
| Web address on the same Wi-Fi | <http://192.168.100.248:3000> |

> Your administrator email and password are not written in this guide. Use the account you already created.

---

## 1. Is it complete?

**Yes for local and home-network use.** The application is built, the database is running, and the data is present.

Verified on this laptop:

- [x] Production build created (`.next\BUILD_ID` exists)
- [x] Configuration loads from `.env.local`
- [x] MongoDB connects and indexes are synchronized
- [x] Storage folder exists at `C:\MyCloudStorage`
- [x] Existing stored files are present
- [x] Two accounts exist, including one active administrator
- [x] `npm run healthcheck` returns `HTTP 200` with `status: ok`
- [x] TypeScript check passes
- [x] Lint passes with no warnings
- [x] All 63 unit tests pass
- [x] App listens on `0.0.0.0:3000`, so this laptop and other devices on the same Wi-Fi can reach it
- [x] Start/stop scripts created
- [x] Auto-start at Windows sign-in installed

Not done yet:

- MyCloud is **not installed as a Windows service**. It starts when you sign in to Windows, not before the sign-in screen. For a normal laptop this is fine.
- MongoDB is **not installed as a Windows service** either. The start script launches it automatically.
- Tailscale is **not configured**. That is only needed for access from outside your home.
- Scheduled backups are **not installed**. Run a manual backup occasionally, or use the optional service steps later.

---

## 2. What "offline" means here

MyCloud does **not** need internet access. Your files and database are on this laptop.

| Situation | What works |
| --- | --- |
| Laptop connected to home Wi-Fi, internet down | Laptop at `http://localhost:3000`; phone/tablet at `http://192.168.100.248:3000` |
| Laptop Wi-Fi turned off completely | Only the laptop itself at `http://localhost:3000` |
| Laptop shut down | Nothing is reachable. Turn it on and sign in |
| Away from home | Nothing works unless you set up Tailscale. See `docs/TUTORIAL.md` |

The phone/tablet must be on the **same Wi-Fi network** as the laptop. Guest Wi-Fi usually blocks device-to-device access.

---

## Upload speed

Uploads were slow because the old storage folder was on the external `D:` USB hard drive. A disk test showed only **31.6 MB/s** there, and the browser uploaded one 8 MiB chunk at a time.

Changed on **2026-11-04**:

- File storage moved to the internal SSD at `C:\MyCloudStorage`.
- Upload chunk size increased from 8 MiB to **32 MiB**.
- The browser now uploads **four chunks in parallel**.
- The server writes chunks with a streaming pipeline instead of one small write at a time.

Local benchmark with a 1 GiB file:

```text
Upload:   360 MiB/s
Finalize: 1.4 s
Total:    4.2 s for 1 GiB (242 MiB/s end-to-end)
```

For a phone over 5 GHz Wi-Fi, the laptop's Wi-Fi link is 866 Mbps, so expect roughly **30–80 MiB/s** depending on the phone and router. A 20 GB file should take about **4–10 minutes** instead of being limited to the old disk speed.

The old `D:\MyCloudStorage` folder is a frozen copy and is no longer used. After you verify your files in the app, you can delete it to free space. Backups remain on `D:`.

> A 20 GB upload temporarily needs about 40 GB free on `C:` during final verification. Keep an eye on free space if you upload several huge files.

### For the fastest 20 GB upload

1. **On the laptop, use `http://localhost:3000`, not the Wi-Fi address.** Uploading through `localhost` avoids sending the file over Wi-Fi at all.
2. **On a phone, use 5 GHz Wi-Fi** and stay reasonably close to the router. Do not use guest Wi-Fi or a VPN.
3. **Keep the browser tab open and the phone screen on** while the upload runs. iOS and Android can pause background browser tabs.
4. **Prefer Ethernet for the laptop** if the router is nearby. The laptop has a Gigabit Ethernet port; Wi-Fi then only carries the phone-to-router hop.
5. Upload one huge file at a time. The app already uses four parallel chunks for that file, which is enough to saturate most home Wi-Fi links.

---

## 3. Daily use - the easy way

The auto-start shortcut is already installed.

1. Turn on the laptop.
2. Sign in to Windows.
3. Wait about 10-30 seconds. MongoDB and MyCloud start hidden in the background.
4. On the laptop, open:

   ```text
   http://localhost:3000
   ```

5. Sign in with your administrator account.

From a phone or another computer on the same Wi-Fi:

```text
http://192.168.100.248:3000
```

No terminal window is needed. No `npm` command is needed.

> The first startup after a Windows update or a long shutdown can take a little longer. If the page does not open after one minute, see [Troubleshooting](#11-troubleshooting).

---

## 4. Manual start and stop

Double-click these files in `C:\Users\Sam\Desktop\MyCloud`:

| File | What it does |
| --- | --- |
| `Start-MyCloud.cmd` | Starts MongoDB if needed, starts MyCloud, checks health, opens the browser |
| `Stop-MyCloud.cmd` | Stops the MyCloud web server only; MongoDB keeps running |
| `Stop-MyCloud.cmd -IncludeMongo` | Stops the web server and MongoDB |

From PowerShell in the app folder:

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"

# Start
.\Start-MyCloud.cmd

# Start without opening a browser
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-mycloud.ps1 -NoBrowser

# Stop the web server
.\Stop-MyCloud.cmd

# Stop everything
.\Stop-MyCloud.cmd -IncludeMongo

# Check health
npm run healthcheck
```

`Start-MyCloud.cmd` is safe to run more than once. If MyCloud is already running, it just opens the browser.

---

## 5. Auto-start controls

The auto-start shortcut is here:

```text
C:\Users\Sam\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\MyCloud.lnk
```

It runs `scripts\start-mycloud.ps1 -NoBrowser` when you sign in to Windows. It does not open a browser by itself.

Check it:

```powershell
Test-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MyCloud.lnk"
```

Remove it:

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1 -Remove
```

Put it back:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

If it does not start after signing in:

1. Open **Task Manager > Startup apps** and make sure **MyCloud** is enabled.
2. Start it manually with `Start-MyCloud.cmd`.
3. Check `logs\app.error.log` and `D:\MyCloudData\logs\mongod.log`.

Some Windows cleanup/optimizer tools disable Startup shortcuts. Re-enable MyCloud in Task Manager or reinstall the shortcut.

---

## 6. If your Wi-Fi address changes

The laptop currently uses `192.168.100.248` on Wi-Fi. A router restart or a new network can change it.

Find the current address:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object InterfaceAlias, IPAddress
```

If it changed, edit `.env.local`:

```dotenv
AUTH_URL=http://NEW-IP-ADDRESS:3000
```

Then restart MyCloud:

```powershell
.\Stop-MyCloud.cmd
.\Start-MyCloud.cmd
```

No rebuild is needed. Update your phone bookmark too.

For a permanent fix, reserve the laptop's address in your router's DHCP settings.

---

## 7. Verify that everything is running

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
npm run healthcheck
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process mongod, node -ErrorAction SilentlyContinue | Select-Object ProcessName, Id
```

Healthy result:

```text
HTTP 200 {"status":"ok","database":"ok","storage":"ok",...}
```

The web server should listen on `0.0.0.0:3000` for Wi-Fi access, or `127.0.0.1:3000` for laptop-only access.

Logs:

```text
C:\Users\Sam\Desktop\MyCloud\logs\app.out.log
C:\Users\Sam\Desktop\MyCloud\logs\app.error.log
D:\MyCloudData\logs\mongod.log
```

---

## 8. Files, storage and backups

- Uploaded files are stored under `C:\MyCloudStorage\files\...`.
- MongoDB stores only metadata, accounts and permissions.
- Do **not** move or rename files inside `C:\MyCloudStorage` by hand.
- Do **not** delete `D:\MyCloudData\mongodb`.

### Make a backup

For a consistent backup, stop the web app first, back up, then start it again:

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
.\Stop-MyCloud.cmd
npm run backup
.\Start-MyCloud.cmd
```

Backups are written to:

```text
D:\MyCloudBackups\mycloud-YYYYMMDD-HHMMSS\
```

Copy at least one backup to a USB drive or another computer occasionally. A backup on the same laptop does not protect against disk failure or theft.

### Restore a backup

Stop the app first, then use the restore script. This is destructive.

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
.\Stop-MyCloud.cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore.ps1 `
  -Source "D:\MyCloudBackups\mycloud-YYYYMMDD-HHMMSS"
```

Type `RESTORE` when prompted. Then run `npm run setup` and start the app again. See `docs/TUTORIAL.md` for the full restore procedure.

---

## 9. If the laptop is wiped or you move to another PC

The short version:

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
npm ci
npm run setup
npm run build
.\Start-MyCloud.cmd
```

On a new PC you must also install Node.js, MongoDB, MongoDB Database Tools and copy `C:\MyCloudStorage` plus a backup. Follow `docs/MIGRATION.md` for the complete procedure.

---

## 10. Optional: run before sign-in as Windows services

Do this only if you want MyCloud available while the laptop is sitting at the Windows login screen. It requires **Administrator** PowerShell.

> If you do this, remove the Startup shortcut so the app is not started twice:
>
> ```powershell
> powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1 -Remove
> ```

### 10.1 MongoDB as a service

Stop the manual MongoDB first:

```powershell
Get-Process mongod -ErrorAction SilentlyContinue | Stop-Process -Force
```

In an **elevated** PowerShell:

```powershell
& "C:\Users\Sam\Tools\mongodb-8.0.34\bin\mongod.exe" `
  --config "C:\Users\Sam\Tools\mongodb-8.0.34\mongod-mycloud.cfg" `
  --install `
  --serviceName MongoDB `
  --serviceDisplayName "MongoDB 8.0 (MyCloud)" `
  --serviceDescription "Local MongoDB database for MyCloud. Bound to 127.0.0.1 only."

Start-Service MongoDB
Get-Service MongoDB
```

### 10.2 MyCloud as a service

Install NSSM if it is not already installed:

```powershell
winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements
```

Then, still elevated:

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
npm run install-service -- -BindAddress 0.0.0.0
sc.exe config MyCloud depend= MongoDB
Get-Service MongoDB, MyCloud
npm run healthcheck
```

The app will now start at boot, before you sign in. Logs are written to `logs\service.out.log` and `logs\service.error.log`.

To undo the service setup:

```powershell
nssm stop MyCloud
nssm remove MyCloud confirm
```

Then reinstall the Startup shortcut if you want sign-in startup again.

---

## 11. Troubleshooting

### The browser says "This site can't be reached"

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
npm run healthcheck
```

If nothing is listening, start it:

```powershell
.\Start-MyCloud.cmd
```

If it still fails, read the last lines of the logs:

```powershell
Get-Content .\logs\app.error.log -Tail 40
Get-Content .\logs\app.out.log -Tail 40
Get-Content D:\MyCloudData\logs\mongod.log -Tail 40
```

### "Port 3000 is already in use"

Another program, or an older MyCloud process, owns the port.

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-Process -Id <OwningProcess>
```

If it is MyCloud, run:

```powershell
.\Stop-MyCloud.cmd
.\Start-MyCloud.cmd
```

If it is another program, stop that program or change the MyCloud port in the start script.

### MongoDB does not start

```powershell
Get-Process mongod -ErrorAction SilentlyContinue
Get-Content D:\MyCloudData\logs\mongod.log -Tail 60
```

Start it manually:

```powershell
Start-Process -FilePath "C:\Users\Sam\Tools\mongodb-8.0.34\bin\mongod.exe" `
  -ArgumentList '--config "C:\Users\Sam\Tools\mongodb-8.0.34\mongod-mycloud.cfg"' `
  -WindowStyle Hidden
```

Then run `.\Start-MyCloud.cmd` again.

### The phone cannot connect, but the laptop can

Check all of these:

1. The phone is on the same Wi-Fi, not mobile data and not guest Wi-Fi.
2. The laptop's current address is `192.168.100.248`:

   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 |
     Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
     Select-Object InterfaceAlias, IPAddress
   ```

3. The app is listening on `0.0.0.0:3000`, not `127.0.0.1:3000`.
4. Windows network profile is **Private**, and Node.js is allowed through the firewall.
5. Router/access-point client isolation is disabled for your own network.

### Login redirects to the wrong address

`AUTH_URL` in `.env.local` must match the address in the browser. Fix it, then restart:

```powershell
.\Stop-MyCloud.cmd
.\Start-MyCloud.cmd
```

Clear old cookies for the previous address if needed.

### I forgot the administrator password

There is no email reset. From the app folder:

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"
npm run setup:admin
```

Create another administrator, sign in, and reset the old account from **Admin > Users**.

---

## 12. Security rules

- Keep MyCloud on your home network or Tailscale. Do **not** forward port 3000 or 27017 on your router.
- Do not enable Tailscale Funnel.
- The LAN address is plain HTTP. Do not use it on public Wi-Fi.
- Keep `.env.local` private. It contains `AUTH_SECRET`.
- Keep MongoDB bound to `127.0.0.1` only.
- Keep at least one backup on a different physical device.
- MyCloud uses Next.js 14.2.5, which has known security advisories. This is acceptable only on a trusted private network. See `README.md` and `docs/SECURITY.md`.

---

## 13. Quick reference

```powershell
Set-Location "C:\Users\Sam\Desktop\MyCloud"

# Start and open
.\Start-MyCloud.cmd

# Stop
.\Stop-MyCloud.cmd

# Stop everything
.\Stop-MyCloud.cmd -IncludeMongo

# Health
npm run healthcheck

# Backup
.\Stop-MyCloud.cmd
npm run backup
.\Start-MyCloud.cmd

# Rebuild after code changes
npm run build
.\Stop-MyCloud.cmd
.\Start-MyCloud.cmd

# Open the app
Start-Process "http://localhost:3000"
```
