# 한입팟(부락편)

부산락페(2026-10-02~04)에서 F&B 메뉴를 나눠 먹을 모임을 찾는 모바일 웹. 요구사항은 [REQUIREMENTS.md](REQUIREMENTS.md), 인수 이미지는 `docs/handoff/`.

```
web/      React + Vite SPA (Pretendard, 390px 기준)
server/   NestJS API + 정적 파일 제공, SQLite(better-sqlite3)
  seed/menus.json          공식 업체·메뉴 시드 (포스터 기준)
  seed/vendor-images/      포스터에서 잘라낸 업체 대표 사진
  scripts/backup.js        SQLite 온라인 백업/검증
  test/api.test.ts         검증 시나리오 API 테스트
Dockerfile, docker-compose.yml   단일 app 컨테이너 + backup 컨테이너
```

## 로컬 개발

```bash
cd server && npm ci && cp .env.development.example .env && npm run dev   # :3000, 모의 로그인
cd web && npm ci && npm run dev                                           # :5173 → /api 프록시
```

`AUTH_MOCK=1`이면 카카오 대신 모의 로그인 화면이 떠서 카카오 id와 성별(female / male / 제공 안 함)을 고를 수 있다. 운영 모드에서는 이 값이 있으면 서버가 기동하지 않는다.

테스트: `cd server && npm test` (서버를 모의 로그인 모드로 띄워 요구사항 6장 시나리오 1~7을 확인)

## 카카오 Developers 설정

1. 앱 생성 → **REST API 키** → `KAKAO_REST_API_KEY`
2. 카카오 로그인 활성화, Redirect URI에 `https://<도메인>/api/auth/kakao/callback` 등록
3. 동의항목: **성별(gender)** 필수 또는 선택 동의로 설정. 닉네임·프로필 등 다른 항목은 받지 않는다.
4. 보안 → Client Secret 사용 시 `KAKAO_CLIENT_SECRET`
5. 앱 키 → **Admin 키** → `KAKAO_ADMIN_KEY` (탈퇴 시 연결 해제 `unlink`에 사용. 액세스 토큰을 저장하지 않기 때문)

성별 확인 흐름: 로그인할 때마다 `/v2/user/me`의 `kakao_account.gender`를 확인한다.
- `female`이면 계정·세션(7일)을 만든다.
- 값이 없으면 계정을 만들지 않고 안내 화면으로 보낸다. 거기서 "다시 시도"를 누르면 `scope=gender` 추가 동의를 요청한다.
- 다른 값이면 계정을 만들지 않는다.

성별 값 자체는 DB에 저장하지 않고, 확인 시각(`gender_check_at`)만 남긴다.

## 배포 (B201과 같은 서버, 별도 Compose 프로젝트)

```bash
cp .env.example .env          # PUBLIC_URL, SESSION_SECRET(openssl rand -hex 32), 카카오 키
mkdir -p backups && sudo chown 1000:1000 backups   # 컨테이너는 node(uid 1000)로 실행
docker compose up -d --build
```

- 프로젝트 이름 `hanippot`, 볼륨 `hanippot_hanippot-data`(SQLite) / `hanippot_hanippot-uploads`(업로드 이미지)
- 앱은 `127.0.0.1:${HOST_PORT:-3210}`에만 열린다. B201이 쓰는 포트와 겹치지 않는지 확인할 것
- SQLite는 writer가 하나여야 하므로 레플리카를 늘리지 않는다

기존 Nginx에 추가할 예시:

```nginx
server {
  server_name hanippot.example.com;
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:3210;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Cloudflare를 거친다면 `/api/*`는 캐시하지 않는다. 서버가 모든 API 응답에 `Cache-Control: no-store`를 붙이긴 하지만, 공개 목록이 캐시에 남지 않도록 규칙으로도 막아 두는 편이 안전하다.

### 백업·복원

`backup` 서비스가 `BACKUP_INTERVAL_HOURS`(기본 6시간)마다 `./backups/hanippot-YYYYMMDD-HHMM.sqlite`를 만든다. 백업 직후 `integrity_check`로 검사하고, 최근 `BACKUP_KEEP`개만 남긴다. 업로드 이미지는 `./backups/uploads/`로 미러링한다.

```bash
docker compose run --rm backup node scripts/backup.js                              # 즉시 백업
docker compose run --rm backup node scripts/backup.js --verify /backups/<파일>     # 백업 파일 검증
# 복원
docker compose stop web-api
docker run --rm -v hanippot_hanippot-data:/data -v "$PWD/backups":/b alpine \
  sh -c 'rm -f /data/hanippot.sqlite-wal /data/hanippot.sqlite-shm && cp /b/<파일> /data/hanippot.sqlite && chown 1000:1000 /data/hanippot.sqlite'
docker compose start web-api
```

### 공식 메뉴 갱신

`server/seed/menus.json`을 고친 뒤 이미지를 다시 빌드하거나 재시작하면 된다. 반영 규칙:
- `slug`가 같으면 이름·가격을 갱신한다.
- 목록에서 빠진 메뉴는 삭제하지 않고 숨긴다. 기존 모집글과의 연결은 유지된다.
- `slug`는 바꾸지 않는다.

## 요구사항 미확정 항목에 넣은 초기값

요구사항 9장에서 확정되지 않은 항목은 아래 값으로 우선 구현했다. 값은 `server/src/common/event.ts`의 `POST_RULES`에 모여 있다.

| 항목 | 초기값 |
|---|---|
| 제목 / 내용 길이 | 40자 / 500자, 둘 다 필수 |
| 희망 인원 | 2~10명 (기본 4) |
| 모임 시각 | 10분 단위. 과거 시각은 등록·수정 불가 |
| 메뉴 수 | 한 글에 최대 5개(목업 04 기준), 그중 기타 메뉴는 3개까지 |
| 동시 모집중 글 | 1인 최대 10개 |
| 오픈카톡 URL | `https://open.kakao.com/o/<코드>` 형식만. 모집종료·취소된 글에서는 작성자 본인 화면 외에는 내려주지 않음 |
| 수정 | 모집중일 때만. 모집종료 글은 "목록에서 내리기(취소)"만 가능 |
| 기타 메뉴 노출 | 공식 업체명과 같으면 그 업체 아래, 다르면 "이용자 추가" 업체로 표시. 그날 공개 글이 있을 때만 메뉴별 화면에 보임 |
| 탈퇴 | 모집중 글은 취소 처리. 탈퇴 회원의 글은 전부 공개 목록·상세에서 숨김. 닉네임은 `탈퇴회원_<id>`로 바꾸고 카카오 id를 지움. 다시 로그인하면 새 계정 |
| 업로드 | JPG/PNG/WEBP/HEIC, 8MB 이하. 1200px WebP로 다시 인코딩하면서 EXIF(위치정보 포함) 제거 |
| 공개 목록 응답 | 제목·메뉴·시각·희망 인원·상태만 포함. 설명·닉네임·오픈카톡 URL은 상세(로그인)에서만 |
| 등록 안내 동의 | 글마다 `guideline_version`과 동의 시각을 저장. 문구를 바꾸면 `GUIDELINE_VERSION`을 올린다 |

## 포스터 원본과 REQUIREMENTS 8장 전사가 다른 부분

포스터 이미지를 다시 확인해서 시드에는 포스터 표기를 넣었다.

| REQUIREMENTS 8장 | 포스터 원본 |
|---|---|
| 청춘돼지국밥 | **청천돼지국밥** |
| 조이셰프 | **조이쉐프** |
| 다음컵밥 | **다옴컵밥** |
| 햅스후, 오사카야끼 | 표기 그대로 확인됨 |

수안커피는 총 5종 중 3종, 이흥용과자점은 총 8종 중 3종만 포스터에 있다. 공식 공지로 나머지를 보충해야 한다.
