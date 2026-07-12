# JSMS 게이트웨이 앱 — 주소록 자동 연동 스펙 (A안 확정본)

> 이 문서를 게이트웨이 앱을 관리하는 세션/도구에 그대로 붙여넣으면 구현할 수 있도록 작성됨.
> 웹/DB 수신측은 **이미 배포 완료** — 앱이 push를 시작하는 즉시 웹에 자동 반영된다.

## 확정된 설계 (2026-07-12 사용자 결정)

1. **주소록 변경 감지 push** — ContentObserver로 주소록 변경을 감지해 즉시 push (디바운스 5초)
2. **앱 시작 시 변경분만 push** — 전체 재전송이 아니라, 마지막 push 스냅샷과 비교해 달라진 것만 전송
3. **일일 전체 동기화 없음** — 스냅샷 diff가 추가/수정/삭제를 모두 잡으므로 불필요 (사용자 판단으로 생략)

삭제 처리: 스냅샷에 있었는데 현재 주소록에 없는 번호는 서버에서 DELETE. 별도 전체 동기화 없이도 삭제가 반영되는 이유.

## 서버 수신 테이블 (배포됨)

```
js_gateway_contacts
  phone       text PRIMARY KEY   -- 숫자만! 하이픈 제거 (01012345678)
  name        text NOT NULL
  updated_at  timestamptz DEFAULT now()
```
- RLS: anon ALL 정책 — 앱이 기존 js_message_logs / js_gateway_status와 **동일한 anon 키·동일한 방식**으로 쓰면 됨
- 한 사람이 번호 2개면 → 2행 (번호가 PK). 동명이인도 자연스럽게 별도 행

## REST 스펙 (앱이 이미 쓰는 Supabase 그대로)

BASE = `https://owoviftkszmicysxgdpa.supabase.co`
공통 헤더 = `apikey: {anon키}`, `Authorization: Bearer {anon키}`

**추가/수정 (배치 upsert)**
```
POST {BASE}/rest/v1/js_gateway_contacts
Content-Type: application/json
Prefer: resolution=merge-duplicates
Body: [{"phone":"01012345678","name":"홍길동"}, {"phone":"01098765432","name":"홍길동"}]
```

**삭제 (번호 단위)**
```
DELETE {BASE}/rest/v1/js_gateway_contacts?phone=eq.01012345678
```

## 앱 구현 (Kotlin, 의존성 없음 — HttpURLConnection)

### 권한 (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```
런타임 권한 요청 필요 (기존 SMS 권한 요청하는 곳에 READ_CONTACTS 추가).

### ContactsSync.kt (드롭인)
```kotlin
import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object ContactsSync {
    private const val BASE = "https://owoviftkszmicysxgdpa.supabase.co"
    private const val ANON = "<앱이 이미 쓰는 anon 키 그대로>"
    private const val PREF = "contacts_sync_snapshot"   // phone -> name
    private val handler = Handler(Looper.getMainLooper())
    private var pending: Runnable? = null

    /** 앱 시작 시 1회 호출: 변경분만 push + 변경 감지 등록 */
    fun start(ctx: Context) {
        Thread { syncDiff(ctx) }.start()                 // ① 시작 시 변경분만
        ctx.contentResolver.registerContentObserver(     // ② 변경 감지
            ContactsContract.Contacts.CONTENT_URI, true,
            object : ContentObserver(handler) {
                override fun onChange(selfChange: Boolean) {
                    pending?.let { handler.removeCallbacks(it) }   // 5초 디바운스
                    pending = Runnable { Thread { syncDiff(ctx) }.start() }
                    handler.postDelayed(pending!!, 5000)
                }
            })
    }

    /** 현재 주소록 vs 마지막 push 스냅샷 → 달라진 것만 upsert/DELETE */
    @Synchronized private fun syncDiff(ctx: Context) {
        try {
            val current = readContacts(ctx)                        // phone -> name
            val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            val snapshot = sp.all.mapValues { it.value.toString() }

            val upserts = current.filter { (p, n) -> snapshot[p] != n }
            val deletes = snapshot.keys.filter { it !in current }
            if (upserts.isEmpty() && deletes.isEmpty()) return     // 변경 없음 → 아무것도 안 함

            if (upserts.isNotEmpty()) {
                val body = JSONArray()
                upserts.forEach { (p, n) ->
                    body.put(JSONObject().put("phone", p).put("name", n))
                }
                http("POST", "$BASE/rest/v1/js_gateway_contacts", body.toString(),
                     mapOf("Prefer" to "resolution=merge-duplicates"))
            }
            deletes.forEach { p ->
                http("DELETE", "$BASE/rest/v1/js_gateway_contacts?phone=eq.$p", null, emptyMap())
            }

            val ed = sp.edit(); ed.clear()                          // 스냅샷 갱신
            current.forEach { (p, n) -> ed.putString(p, n) }
            ed.apply()
        } catch (_: Exception) { /* 다음 변경/재시작 때 재시도됨 */ }
    }

    /** 주소록 읽기: 번호는 숫자만, 010/02로 시작하는 8자리 이상만 */
    private fun readContacts(ctx: Context): Map<String, String> {
        val out = HashMap<String, String>()
        val cur = ctx.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER),
            null, null, null) ?: return out
        cur.use {
            while (it.moveToNext()) {
                val name = it.getString(0)?.trim() ?: continue
                val phone = (it.getString(1) ?: "").replace(Regex("\\D"), "")
                if (name.isEmpty() || phone.length < 8) continue
                out[phone] = name                                   // 번호 중복 시 마지막 이름
            }
        }
        return out
    }

    private fun http(method: String, url: String, body: String?, extra: Map<String, String>) {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.setRequestProperty("apikey", ANON)
        c.setRequestProperty("Authorization", "Bearer $ANON")
        c.setRequestProperty("Content-Type", "application/json")
        extra.forEach { (k, v) -> c.setRequestProperty(k, v) }
        c.connectTimeout = 10000; c.readTimeout = 15000
        if (body != null) { c.doOutput = true; c.outputStream.use { it.write(body.toByteArray()) } }
        c.inputStream.use { it.readBytes() }                        // 응답 소비 (2xx 확인)
        c.disconnect()
    }
}
```

### 연결 (기존 서비스의 onCreate 등 1곳)
```kotlin
ContactsSync.start(applicationContext)
```

## 검증 방법
1. 앱 설치 후 폰 주소록에 새 연락처 저장 → 5초 내
   `https://jstudio-calendar.vercel.app/sms/contacts.html` 의 "게이트웨이 주소록" 버튼 숫자 증가 확인
2. 발송센터 대화 목록에서 해당 번호가 이름으로 표시되는지 확인
3. 주소록에서 삭제 → 웹에서도 사라지는지 확인 (스냅샷 diff의 DELETE 동작 확인)

## 주의
- anon 키는 앱이 메시지 로그에 쓰는 키와 동일한 것 사용 (새 키 발급 불필요)
- 번호 정규화(숫자만)를 지키지 않으면 웹 이름 매칭이 안 됨 — 서버는 하이픈 제거 후 비교하지만 PK 중복을 막기 위해 앱에서도 숫자만 저장할 것
