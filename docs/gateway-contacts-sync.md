# 게이트웨이 앱 ↔ 웹 주소록 연동 (구현 완료본)

> **상태: 구현 완료 (2026-07-13).** 게이트웨이 앱(`~/Documents/AppDevelop/jsms-gateway`, Flutter)과 웹 대시보드
> (이 저장소) 양쪽 모두 반영됨. 이 문서는 "무엇을 어떻게 만들었는지"의 기록.
>
> ⚠️ 이전 버전(커밋 1848548)은 네이티브 Kotlin + anon upsert를 가정한 **틀린 스펙**이었음.
> 실제 앱은 Flutter이고, 대상 테이블은 anon upsert가 불가하다. 아래가 실제 구현이다.

## 전체 그림

```
게이트웨이 폰(Galaxy A32, Flutter 앱)
  READ_CONTACTS → 폰 주소록 읽기(JsmsSender.getContacts)
  앱 시작·재개 시 → js_gateway_contacts 전체 삭제 후 재삽입
        │
        ▼
Supabase: js_gateway_contacts (phone PK, name, updated_at)
        │
        ▼
웹 대시보드(이 저장소)
  /api/sms/threads → 대화 목록 이름 해석에 반영 (회원 명부 우선, 그다음 주소록)
  /api/sms/gateway-contacts + 연락처 페이지 "게이트웨이 주소록 가져오기" → js_members 등록
```

## 핵심 제약: 왜 upsert가 아니라 "삭제 후 재삽입"인가

`js_gateway_contacts`의 RLS 정책(실제 DB 확인):
- anon **INSERT** 허용 (with_check: true)
- anon **DELETE** 허용 (using: true)
- anon **UPDATE 없음**, anon **SELECT 없음**
- authenticated는 ALL

→ `upsert`는 내부적으로 UPDATE를 시도하므로 **42501(권한 거부)로 실패**한다.
→ 따라서 갱신 = **전체 DELETE 후 bulk INSERT**(전체 새로고침) 방식.
→ INSERT/DELETE 시 결과 row를 돌려받으면 SELECT가 필요해 또 실패하므로,
  **`return=minimal`(supabase-dart에서 `.select()`를 체이닝하지 않으면 자동)** 로 호출한다.

## 앱 쪽 구현 (`~/Documents/AppDevelop/jsms-gateway/lib/main.dart`)

`syncContactsToServer(SupabaseClient, Map<String,String>)`:
1. 번호를 숫자만으로 정규화, 8자리 이상 + 이름 있는 것만, 중복 시 마지막 이름 우선
2. **빈 목록이면 즉시 반환**(삭제 안 함) — 권한 거부 등으로 목록이 비면 서버를 지우지 않기 위한 안전장치
3. 직전 동기화 내용과 해시가 같으면 스킵(불필요한 전체 재삽입 방지)
4. `delete().neq('phone','___none___')` 로 전체 삭제 → 500건 청크로 `insert(rows)` 재삽입

두 가지 모드:
- `incremental`(변경분): 마지막 스냅샷과 비교해 추가/이름변경/삭제분만 반영. 이름 변경도
  UPDATE 불가라 "DELETE 후 INSERT". 스냅샷은 SharedPreferences(FGT)에 JSON으로 영속.
- `full`(전체): 서버 전체 삭제 후 현재 주소록 전량 재삽입.

호출 지점:
- 자동(`_HomeShellState`, `WidgetsBindingObserver`): 앱 시작 + 앱 재개 시 → `incremental`
- 수동(게이트웨이 화면 버튼): "변경분 동기화"=`incremental`, "전체 재동기화"=`full`.
  마지막 동기화 요약(시각·총원·추가/삭제 수)을 화면에 표시.
- ⚠️ 실시간 백그라운드 변경 감지(ContentObserver)는 미구현 — 앱을 열거나 버튼을 눌러야 반영.

## 웹 쪽 구현 (이 저장소 — 이미 배포됨)

- `sms-api.js`
  - `GET /api/sms/threads`: 이름 해석 시 `js_gateway_contacts` → `js_members` 순으로 덮어써
    회원 명부 이름을 우선 표시
  - `GET /api/sms/gateway-contacts`: 목록 + 회원 등록 여부(`in_members`)
  - `POST /api/sms/gateway-contacts/import`: 미등록 연락처를 `js_members`에 일괄 등록
    (서버는 DATABASE_URL 직접 연결이라 RLS를 우회 → 이 조회/등록은 정상)
- `sms/contacts.html`: "📱 게이트웨이 주소록 가져오기 (N)" 버튼

## 검증 방법
1. 앱을 게이트웨이 폰에 설치 → 앱 실행 → 연락처 권한 허용
2. Supabase에서 `select count(*) from js_gateway_contacts;` 가 폰 주소록 수와 비슷해지는지 확인
3. 웹 발송센터 대화 목록에서 번호가 이름으로 표시되는지 확인
4. 폰 주소록에서 연락처 추가 → 앱을 백그라운드 갔다가 다시 열기 → 위 count 증가 확인

## 남은 하드닝 (별개 과제)
`js_message_logs`·`js_members`·`js_gateway_status`는 아직 anon 전면 개방 상태다
(anon 키가 APK에 있어 추출 시 접근 가능). 완전 잠금 = 폰 앱도 대시보드처럼 백엔드 API를
경유하도록 바꾸고 anon 정책을 끄는 것(웹+앱 양쪽 큰 작업). `~/Documents/AppDevelop/jsms-gateway/HANDOFF.md` 8번 참조.
