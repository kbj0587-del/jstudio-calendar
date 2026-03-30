# Railway 배포 가이드 – 제이스튜디오 캘린더 PWA

## 배포 순서

### 1단계: GitHub에 저장소 만들기

1. https://github.com 접속 → 로그인
2. 우상단 **+** → **New repository**
3. Repository name: `jstudio-calendar`
4. **Private** 선택 (비공개)
5. **Create repository** 클릭

### 2단계: 로컬 코드를 GitHub에 올리기

GitHub에서 방금 만든 저장소 주소를 복사한 뒤,
`calendar` 폴더 안에서 아래 명령어 실행:

```bash
git remote add origin https://github.com/[내계정]/jstudio-calendar.git
git branch -M main
git push -u origin main
```

> **방법 2 (GitHub Desktop 사용):**
> GitHub Desktop → File → Add Local Repository → `calendar` 폴더 선택 → Publish Repository

---

### 3단계: Railway에서 배포

1. https://railway.com 접속 → 로그인 (GitHub 계정 권장)
2. **New Project** 클릭
3. **Deploy from GitHub repo** 선택
4. `jstudio-calendar` 저장소 선택
5. Railway가 자동으로:
   - `package.json` 감지
   - `npm install` 실행
   - `node server.js` 시작
6. 배포 완료 후 **Settings → Domains → Generate Domain** 클릭
7. `https://jstudio-calendar-xxxx.up.railway.app` 형태의 주소 발급

---

### 4단계: PWA 설치 확인

1. Chrome에서 발급된 HTTPS 주소 접속
2. 주소창 오른쪽 **⊕ 설치 버튼** 클릭
3. 데스크톱/모바일 홈화면에 앱 추가 완료

---

## 이후 업데이트 방법

코드 수정 후 아래 명령어만 실행하면 Railway가 자동 재배포:

```bash
git add .
git commit -m "변경 내용 설명"
git push
```

---

## 파일 구조

```
calendar/
├── index.html        # 메인 앱 HTML
├── style.css         # 스타일
├── app.js            # 앱 로직
├── manifest.json     # PWA 메타데이터
├── sw.js             # 서비스 워커 (오프라인)
├── server.js         # Express 서버 (Railway용)
├── package.json      # Node.js 의존성
├── railway.toml      # Railway 빌드 설정
└── icons/
    ├── icon-192.png  # 앱 아이콘
    └── icon-512.png  # 앱 아이콘
```
