# 제이스튜디오 캘린더 프로젝트

## 프로젝트 개요
- 제이스튜디오 (플라잉요가/번지피지오) 센터 운영 관리 PWA 캘린더
- Express.js + PostgreSQL (Supabase) 백엔드
- Vanilla JS + CSS 프론트엔드 (빌드 없음)

## 배포 환경
- **앱 주소**: https://jstudio-calendar.vercel.app
- **호스팅**: Vercel (무료)
- **DB**: Supabase PostgreSQL (무료)
- **GitHub**: https://github.com/kbj0587-del/jstudio-calendar

## 로컬 실행
```bash
npm install
node server.js
# http://localhost:8080
```

## 주요 파일
- `server.js` — Express 서버, API, DB 연결
- `app.js` — 프론트엔드 전체 로직
- `style.css` — 스타일
- `index.html` — HTML 구조
- `manifest.json` — PWA 설정
- `sw.js` — 서비스 워커 (캐시 없음)
- `vercel.json` — Vercel 배포 설정

## 아키텍처
- `USE_DB` — DATABASE_URL 환경변수 있으면 PostgreSQL, 없으면 /tmp 파일
- `IS_VERCEL` — Vercel 서버리스 환경 감지 (지연 초기화, 5초 TTL 캐시)
- `store` — 인메모리 데이터 (events, users, categories, settings)
- `syncEnabled` — 서버 연결 여부 플래그

## 시스템 카테고리
```
SYSTEM_CAT_IDS = ['daeggang','incentive','trial','review','classnoshow','sales','consult']
STATUS_CAT_IDS = ['trial','review','consult']  // 취소/변경 상태 지원
```

## 주요 함수 (app.js)
- `renderExtraFields(catId, ev)` — 카테고리별 동적 폼
- `collectExtraFields(type)` — 폼 데이터 수집
- `autoTitle(type, f)` — 시스템 카테고리 제목 자동 생성
- `getDisplayTitle(ev)` — 표시용 제목
- `getChipText(ev)` — 달력 칩 텍스트
- `getSysListTitle(ev)` — 리스트 뷰 제목
- `getExtraDetailHtml(ev)` — 상세 팝업 HTML
- `getExtraSummaryHtml(ev)` — 리스트 요약 HTML
- `renderSalesSummary(monthStr)` — 월별 매출 현황
- `renderIncentiveSummary(monthStr)` — 월별 인센티브 정산
- `saveQuickMemo()` — 상세 뷰 인라인 메모 저장
- `initAmtInput(id)` — 금액 천단위 콤마 포맷
- `initTelInput(id)` — 전화번호 자동 하이픈
- `fmtAmt(v)` — 금액 포맷 문자열 반환
- `parseAmt(id)` — 콤마 제거 후 숫자 반환

## extraFields 구조 (카테고리별)
- **daeggang**: instructorA, instructorB
- **incentive**: incentiveType, staffName, memberName, incentiveAmt, linkedSales{}
- **trial**: clientName, clientContact, noshow, reserved, reserveName, trialFee, personCount, trialTotal, status, linkedRegistration{}, linkedIncentive{staffName, memberName(=clientName 자동), amt(정액, 기본=incentiveDefaults.trialAmount)}
- **review**: clientName, clientContact, noshow, reserved, reserveName, status
- **consult**: clientName, clientContact, status, linkedRegistration{}, linkedIncentive{staffName, memberName(=clientName 자동), rate(%), amt(=payment×rate/100)}, linkedTrial{trialFee(기본35000), personCount, trialTotal} ← 상담>체험, 매출 합산·인센티브 없음

## 인센티브 기본값 (관리자 설정)
- `incentiveDefaults = { trialAmount:10000, consultRate:5 }` — 서버 로드, sectionIncentiveDefaults에서 관리자 설정
- 체험>등록=정액(trialAmount) · 상담>등록=비율(consultRate) · 상담>체험=인센티브 없음
- 체험/상담 후 등록 인센티브 폼에서 이 값이 기본값으로 자동 입력, 등록 시 조정 가능
- **classnoshow**: studentName, studentContact, className
- **sales**: clientName, regType, lessonType, duration, freq, sessionCount, payment

## 관리자 계정
- 기본 관리자: `@kbj0587` / ADMIN_PASSWORD 환경변수
- Vercel 환경변수: DATABASE_URL, ADMIN_PASSWORD

## ⚠️ 마이그레이션 관련 주의사항 (2026-06-16)

### 비활성화된 함수: `migrateSalesPersonalLesson()`
- **위치**: server.js line ~208 (호출부 주석처리됨), line ~245 (함수 정의)
- **이전 동작**: `initStore()` 실행 시마다 `type=sales + extraFields.lessonType=개인레슨` 이벤트를 `personallesson`으로 자동 변환
- **Vercel TTL 5초** → 매 요청마다 실행 → 사용자가 `sales`로 수정해도 5초 내 다시 롤백
- **데이터 손상**: 변환 시 extraFields를 `{clientName, sessionCount, migratedFrom:'sales'}`만 남기고 나머지(regType, lessonType, payment, freq, duration) 전부 삭제됨
- **해결**: 호출 라인 주석처리로 완전 비활성화. 구형 sales→personallesson 마이그레이션은 이미 완료.
- **재활성화 금지**: 이 함수를 다시 활성화하면 정상 등록된 `sales+lessonType=개인레슨` 이벤트가 모두 손상됨

### `personallesson` vs `sales` 카테고리 구분
- `personallesson`: 수업 일정 기록용 (수강생·강사·횟수·룸)
- `sales`: 매출/등록 기록용 (고객명·등록구분·수업유형·횟수·금액)
- 두 카테고리는 별개이며 자동 변환 로직 없음

## Google Play 등록 진행 중
- 개발자 계정 등록 완료 (본인 확인 검토 중)
- 승인 후 PWABuilder로 APK 생성 예정

## Apple App Store
- 개발자 계정 보유 ($99/년)
- Mac에서 PWABuilder → Xcode → App Store 제출 예정
