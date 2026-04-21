# Deploy CRM Online

## Muc tieu giai doan test
- Dua CRM len online de team dang nhap va dung thu
- Khong phu thuoc may local cua ban bat hay tat
- Tam thoi chi dung persistent disk cua host cho `data/` va `backups/`
- Chua bat backup Google Drive neu chua can

## Repo structure quan trong
- `src/`: frontend React
- `server.js`: backend Node + API + serve frontend build
- `dist/`: frontend build output
- `data/`: state chinh cua CRM
- `backups/`: file backup JSON local
- `render.yaml`: cau hinh deploy Render

## Build / start
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check: `/api/health`

## Env can thiet cho giai doan test
Chi can cac bien sau:

- `HOST=0.0.0.0`
- `DATA_DIR=/var/data/gip-crm/data`
- `BACKUP_DIR=/var/data/gip-crm/backups`
- `ENABLE_LOCAL_BACKUP=true`
- `ENABLE_DRIVE_UPLOAD=false`

Khong can set trong giai doan nay:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_DRIVE_SYNC_DIR`

## Persistent disk can mount
Gan disk vao:

- `/var/data/gip-crm`

Backend da duoc cau hinh de dung:

- state: `/var/data/gip-crm/data`
- backups: `/var/data/gip-crm/backups`

## Checklist deploy toi gian tren Render
1. Day project len GitHub.
2. Tao Web Service moi tren Render tu repo do.
3. Chon dung `render.yaml`.
4. Xac nhan disk mount:
   - mount path: `/var/data/gip-crm`
5. Xac nhan env:
   - `HOST=0.0.0.0`
   - `DATA_DIR=/var/data/gip-crm/data`
   - `BACKUP_DIR=/var/data/gip-crm/backups`
   - `ENABLE_LOCAL_BACKUP=true`
   - `ENABLE_DRIVE_UPLOAD=false`
6. Deploy.

## Verify sau deploy
1. Mo URL service online.
2. Kiem tra app load duoc giao dien CRM.
3. Mo:
   - `/api/health`
   - phai tra `{"ok":true}`
4. Dang nhap bang 1 owner test.
5. Tao hoac sua 1 deal.
6. Refresh trang de xac nhan du lieu van con.
7. Kiem tra:
   - `/api/backups`
   - phai thay danh sach backup local tren host
8. Neu can, restart service mot lan va kiem tra du lieu van ton tai.

## Cach backup hoat dong trong giai doan test
- Backup local van chay khi server start
- Backup local van chay dinh ky
- File backup nam trong persistent disk cua host
- Khong upload Google Drive vi `ENABLE_DRIVE_UPLOAD=false`

## Buoc sau khi app online on dinh
Sau khi team test on dinh, ban co the bat cloud backup bang mot trong 2 huong:

1. Shared Drive + service account
2. Phuong an backup cloud khac

Khi do moi can them:
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- va doi `ENABLE_DRIVE_UPLOAD=true`
