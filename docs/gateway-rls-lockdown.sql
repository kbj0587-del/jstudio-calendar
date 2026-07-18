-- ══════════════════════════════════════════════════════════════
--  J.SMS 게이트웨이 보안 하드닝 — anon 전면 차단 (최종 단계)
--  ⚠️ 반드시 게이트웨이 폰에 v28 이상(백엔드 gw API 경유)이 설치·동작
--     확인된 뒤에 적용할 것. 그 전에 적용하면 구버전(anon) 폰의
--     발송/수신/주소록이 즉시 중단된다.
--
--  적용 후:
--   - anon 은 js_message_logs / js_gateway_status / js_gateway_contacts 에
--     읽기·쓰기·삭제 전부 불가 → APK에서 키 추출해도 PII 열람/이력 통삭제 불가.
--   - 폰(v28)은 /api/sms/gw/* (Bearer 토큰) 경유, 서버는 service-role pg풀로
--     RLS를 우회하므로 정상 동작.
--   - 웹 대시보드는 브라우저에서 anon 직접호출을 하지 않으므로 영향 없음.
--   - Storage(mms 버킷)는 서버가 anon 키로 업로드/공개URL 사용 → 그대로 둠.
-- ══════════════════════════════════════════════════════════════

drop policy if exists "Allow anon read/write for js_message_logs" on public.js_message_logs;
drop policy if exists "Allow all for realtime"                    on public.js_message_logs;

drop policy if exists "Allow anon read/write for js_gateway_status" on public.js_gateway_status;

drop policy if exists "anon insert contacts" on public.js_gateway_contacts;
drop policy if exists "anon delete contacts" on public.js_gateway_contacts;
drop policy if exists "anon select contacts" on public.js_gateway_contacts;

-- RLS는 계속 켜둔 상태 유지. authenticated 정책은 남겨둔다(향후 대시보드 대비).
-- 확인:
--   select tablename, policyname, roles::text, cmd from pg_policies
--   where schemaname='public'
--     and tablename in ('js_message_logs','js_gateway_status','js_gateway_contacts')
--   order by tablename, cmd;
