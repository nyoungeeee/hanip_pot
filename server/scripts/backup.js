// SQLite 온라인 백업 + 업로드 이미지 미러링.
//   node scripts/backup.js           한 번 백업
//   node scripts/backup.js --loop    BACKUP_INTERVAL_HOURS마다 반복(compose backup 서비스)
//   node scripts/backup.js --verify <파일>   백업 파일 무결성 확인(복원 테스트용)
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';
const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';
const KEEP = Number(process.env.BACKUP_KEEP || 14);
const INTERVAL_H = Number(process.env.BACKUP_INTERVAL_HOURS || 24);

function stamp() {
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString(); // KST
  return d.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
}

function verify(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const [{ integrity_check }] = db.pragma('integrity_check');
  const counts = ['users', 'posts', 'menus', 'vendors'].map((t) => `${t}=${db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n}`);
  db.close();
  if (integrity_check !== 'ok') throw new Error(`integrity_check: ${integrity_check}`);
  return counts.join(' ');
}

async function backupOnce() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const src = path.join(DATA_DIR, 'hanippot.sqlite');
  if (!fs.existsSync(src)) return console.log(`[backup] DB 없음: ${src}`);
  const out = path.join(BACKUP_DIR, `hanippot-${stamp()}.sqlite`);
  const db = new Database(src, { fileMustExist: true });
  db.pragma('busy_timeout = 10000');
  await db.backup(out);
  db.close();
  console.log(`[backup] ${out} (${verify(out)})`);

  // 업로드는 새 파일만 복사(파일명이 UUID라 덮어쓰기 없음)
  const upSrc = path.join(UPLOAD_DIR, 'menus');
  const upDst = path.join(BACKUP_DIR, 'uploads', 'menus');
  if (fs.existsSync(upSrc)) {
    fs.mkdirSync(upDst, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(upSrc)) {
      const to = path.join(upDst, f);
      if (!fs.existsSync(to)) {
        fs.copyFileSync(path.join(upSrc, f), to);
        n++;
      }
    }
    console.log(`[backup] uploads +${n}`);
  }

  const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^hanippot-\d{8}-\d{4}\.sqlite$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f));
  if (old.length) console.log(`[backup] 오래된 백업 ${old.length}개 삭제`);
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--verify') {
    console.log(verify(args[1]));
    return;
  }
  await backupOnce();
  if (args[0] === '--loop') {
    setInterval(() => backupOnce().catch((e) => console.error('[backup] 실패', e)), INTERVAL_H * 3600 * 1000);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
