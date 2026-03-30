# GitHub + Railway 배포 가이드
# 제이스튜디오 캘린더 PWA

---

## STEP 1 : GitHub 계정 만들기

1. 크롬 주소창에 **https://github.com** 입력 후 Enter
2. 오른쪽 위 **[Sign up]** 클릭
3. 아래 정보 입력:
   - Enter your email → 이메일 주소 입력
   - Create a password → 비밀번호 입력
   - Enter a username → 사용할 이름 입력 (예: jstudio2024)
4. 이메일로 온 인증 코드 6자리 입력
5. 설문 화면은 건너뛰기 (Skip personalization)
6. ✅ 대시보드 화면이 나오면 계정 완성

---

## STEP 2 : GitHub Desktop 설치

> 터미널 명령어 없이 마우스 클릭만으로 사용 가능한 프로그램

1. **https://desktop.github.com** 접속
2. **[Download for Windows]** 클릭 → 설치 파일 다운로드
3. 다운받은 `GitHubDesktopSetup.exe` 더블클릭 → 자동 설치
4. 설치 완료 후 GitHub Desktop 자동 실행
5. **[Sign in to GitHub.com]** 클릭
6. 브라우저가 열리면 GitHub 계정으로 로그인 → **[Authorize desktop]** 클릭
7. GitHub Desktop으로 돌아오면 로그인 완료 ✅

---

## STEP 3 : 저장소(Repository) 만들기

1. GitHub Desktop 왼쪽 위 **[File]** → **[Add Local Repository]** 클릭
2. **[Choose...]** 클릭 후 아래 폴더 선택:
   ```
   C:\Users\J.STUDIO\Desktop\calendar
   ```
3. **[Add Repository]** 클릭
4. 왼쪽 상단에 `calendar` 가 표시되면 성공 ✅

---

## STEP 4 : GitHub에 올리기 (Publish)

1. 상단 메뉴에서 **[Publish repository]** 버튼 클릭
2. 아래와 같이 설정:
   - Name: `jstudio-calendar`
   - Description: 제이스튜디오 캘린더 PWA
   - **⬜ Keep this code private** 에 체크 (비공개로 유지)
3. **[Publish Repository]** 클릭
4. 잠시 기다리면 GitHub에 업로드 완료 ✅

> 확인: https://github.com/[내계정]/jstudio-calendar 접속하면
> 파일들이 보여야 합니다.

---

## STEP 5 : Railway에 배포

1. **https://railway.com** 접속 → **[Login]** 클릭
2. **[Login with GitHub]** 선택 → GitHub 계정으로 로그인
3. 대시보드에서 **[New Project]** 클릭
4. **[Deploy from GitHub repo]** 선택
5. `jstudio-calendar` 저장소 선택
   - 목록에 없으면 **[Configure GitHub App]** 클릭 → 저장소 권한 허용
6. Railway가 자동으로 빌드 시작 (1~2분 소요)
7. 빌드 완료 후:
   - 왼쪽 메뉴 **[Settings]** 클릭
   - **[Networking]** 섹션에서 **[Generate Domain]** 클릭
8. `https://jstudio-calendar-xxxx.up.railway.app` 형태의 주소 발급 ✅

---

## STEP 6 : PWA 설치 (앱으로 설치)

1. 위에서 받은 HTTPS 주소를 크롬에서 열기
2. 주소창 오른쪽 끝 **⊕ 아이콘** (컴퓨터+화살표) 클릭
3. **[설치]** 클릭
4. 바탕화면에 제이스튜디오 캘린더 앱 아이콘 생성 ✅
5. 앱 아이콘 더블클릭하면 독립 창으로 실행

---

## 이후 수정사항 반영 방법

코드가 바뀌면 GitHub Desktop에서:

1. 왼쪽에 변경된 파일 목록 표시됨
2. 아래 Summary 칸에 변경 내용 한 줄 입력 (예: "달력 스타일 수정")
3. **[Commit to main]** 클릭
4. 상단 **[Push origin]** 클릭
5. Railway가 자동으로 재배포 (1~2분)

---

## 문제 해결

| 증상 | 해결 방법 |
|---|---|
| Railway 빌드 실패 | Logs 탭에서 오류 확인 후 문의 |
| PWA 설치 버튼 안 보임 | HTTPS 주소인지 확인, 크롬 사용 권장 |
| 아이콘이 안 보임 | Railway 재배포 후 크롬 캐시 삭제 (Ctrl+Shift+Del) |
| 오프라인 동작 안 됨 | 한 번 HTTPS 주소로 접속 후 새로고침 필요 |
