'use strict';

/*
 * 운동패스(UN:DONG) → 제이스튜디오 웹 시간표 자료 연동
 * ---------------------------------------------------------------
 * 수업 내용의 주인은 운동패스다. 이 파일은 운동패스의 공개 API 를 읽어
 * 웹 시간표 상태(js_schedule_state)의 "칸 안 글자"만 갈아끼운다.
 *
 * 건드리지 않는 것 — 표의 줄 구조, 디자인·글꼴·색, 배너, Notice 띠,
 * 안내문 행, 프로그램 소개 설명표, 지난 달 데이터.
 *
 * 두 시간표는 표를 만드는 방식이 다르다.
 *   운동패스 : 시작시각마다 한 줄 (토요일만 10:30 이면 그 줄이 따로 생김)
 *   웹 시간표: "10:10 / 토는 10:30" 처럼 한 줄로 묶고, 칸마다 startTime 을 둔다
 * 그래서 운동패스 줄을 그대로 가져오지 않고, **웹 시간표의 줄 구조를 틀로 삼아**
 * 운동패스 수업을 (요일, 시각)이 맞는 칸에 꽂아 넣는다.
 *
 * 시각 표기도 다르다. 운동패스는 19:30(24시간제), 웹 시간표는 7:30(12시간제)로
 * 저장한다. 비교 전에 12시간제로 맞춘다.
 */

const DEFAULT_BASE = 'https://young-gym.vercel.app';
const DEFAULT_STUDIO = 'ST001';
const FETCH_TIMEOUT_MS = 8000;

const baseUrl   = () => (process.env.UNDONGPASS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
const studioId  = () => process.env.UNDONGPASS_STUDIO_ID || DEFAULT_STUDIO;

/* 24시간제·0 패딩을 웹 시간표 표기(12시간제, 앞자리 0 없음)로 맞춘다 */
function to12(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  if (h >= 13) h -= 12;
  return `${h}:${m[2]}`;
}

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`운동패스 응답 오류 (${res.status})`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('운동패스 서버가 응답하지 않습니다.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUndongpass() {
  const sid = encodeURIComponent(studioId());
  const [timetable, studio] = await Promise.all([
    getJson(`${baseUrl()}/api/timetable-view/data?studioId=${sid}`),
    getJson(`${baseUrl()}/api/studio-settings?studioId=${sid}`).catch(() => null),
  ]);
  return { timetable, studio };
}

/* 운동패스가 내려준 달 — 공개되는 건 "발행(active)"된 한 달뿐이다 */
function pickMonth(timetable) {
  const months = (timetable && timetable.monthsData) || {};
  const keys = Object.keys(months);
  if (!keys.length) return null;
  const key = keys.sort()[keys.length - 1];
  return { key, label: months[key].monthLabel || '', schedule: months[key].schedule || [] };
}

/* 웹 시간표 한 줄에서 "이 요일은 몇 시" 인지 뽑는다 (칸에 없으면 그 줄의 대표 시각) */
function rowExpect(row, days) {
  const main = to12(row.mainTime || '');
  const out = {};
  for (const d of days) {
    const cell = (row.days || {})[d] || {};
    out[d] = to12(cell.startTime || '') || main;
  }
  return out;
}

const cellText = (c) => [c.title, c.level, c.teacher].filter(Boolean).join(' / ') || '(빈칸)';

/*
 * 병합 계산 — 실제로 쓰지는 않고 "이렇게 바뀐다" 를 돌려준다.
 * state 는 건드리지 않는다(복사본을 만들어 돌려줌).
 */
function buildPlan(state, incoming) {
  const month = pickMonth(incoming.timetable);
  if (!month) {
    const err = new Error('운동패스에 발행된 시간표가 없습니다. 운동패스에서 시간표를 발행한 뒤 다시 시도해 주세요.');
    err.code = 'NO_ACTIVE_TIMETABLE';
    throw err;
  }

  const monthKey = state.activeMonthKey;
  const target = ((state.monthsData || {})[monthKey] || {});
  const rows = Array.isArray(target.schedule) ? target.schedule : [];
  if (!rows.length) {
    const err = new Error('웹 시간표에 현재 달 표가 없습니다.');
    err.code = 'NO_TARGET_MONTH';
    throw err;
  }

  /* 웹 시간표가 쓰는 요일 목록을 그대로 따른다 (일요일 운영 여부도 웹 표 기준) */
  const days = Object.keys(rows[0].days || {});
  const order = ['월', '화', '수', '목', '금', '토', '일'];
  days.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  /* (요일, 12시간제 시각) → 줄 번호 */
  const lut = new Map();
  const expects = rows.map((r) => rowExpect(r, days));
  expects.forEach((exp, i) => {
    for (const d of days) {
      const k = `${d}|${exp[d]}`;
      if (!lut.has(k)) lut.set(k, i);
    }
  });

  /* 운동패스 수업을 틀에 꽂는다 */
  const filled = rows.map(() => {
    const o = {};
    for (const d of days) o[d] = { title: '', level: '', teacher: '' };
    return o;
  });
  const newSlots = [];
  for (const r of month.schedule) {
    for (const [d, c] of Object.entries(r.days || {})) {
      if (!c || !c.title) continue;
      const t = to12(c.startTime || r.mainTime || '');
      const i = lut.get(`${d}|${t}`);
      if (i === undefined) {
        newSlots.push({ day: d, time: t, title: c.title, level: c.level || '', teacher: c.teacher || '' });
        continue;
      }
      filled[i][d] = { title: c.title, level: c.level || '', teacher: c.teacher || '' };
    }
  }

  /* 달라지는 칸 모으기 + 반영된 새 표 만들기 */
  const changes = [];
  const stats = { same: 0, changed: 0, added: 0, removed: 0 };
  const nextRows = rows.map((row, i) => {
    const nextDays = Object.assign({}, row.days);
    for (const d of days) {
      const old = (row.days || {})[d] || {};
      const neu = filled[i][d];
      const before = { title: old.title || '', level: old.level || '', teacher: old.teacher || '' };
      if (before.title === neu.title && before.level === neu.level && before.teacher === neu.teacher) {
        if (before.title) stats.same += 1;
        continue;
      }
      const kind = !before.title ? 'added' : (!neu.title ? 'removed' : 'changed');
      stats[kind] += 1;
      changes.push({
        kind,
        day: d,
        time: to12(row.mainTime || ''),
        before: cellText(before),
        after: cellText(neu),
      });
      /* 칸의 나머지 값(startTime 등)은 그대로 두고 글자만 바꾼다 */
      nextDays[d] = Object.assign({}, old, neu);
    }
    return Object.assign({}, row, { days: nextDays });
  });

  /* 센터 정보 — 이름과, 안내줄 안의 전화번호만 맞춘다 */
  const brand = Object.assign({}, state.brandConfig || {});
  const centerChanges = [];
  const st = incoming.studio || {};
  if (st.studioName && st.studioName !== brand.studioName) {
    centerChanges.push({ field: '센터 이름', before: brand.studioName || '(없음)', after: st.studioName });
    brand.studioName = st.studioName;
  }
  if (st.studioPhone) {
    const pretty = formatPhone(st.studioPhone);
    const line = String(brand.location || '');
    const found = line.match(/\d{2,3}-\d{3,4}-\d{4}/);
    if (found && found[0] !== pretty) {
      centerChanges.push({ field: '전화번호', before: found[0], after: pretty });
      brand.location = line.replace(found[0], pretty);
    }
  }

  const logo = {
    different: !!(st.logoUrl && st.logoUrl !== state.customLogo),
    value: st.logoUrl || '',
  };

  return {
    monthKey,
    monthLabel: target.monthLabel || state.month || '',
    undongpassMonth: month.label,
    monthMismatch: !!(month.label && target.monthLabel && month.label !== target.monthLabel),
    stats,
    changes,
    newSlots,
    centerChanges,
    logo,
    nextRows,
    nextBrand: brand,
  };
}

function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

/* 계산된 결과를 상태에 반영한 새 상태를 돌려준다 (원본은 건드리지 않는다) */
function applyPlan(state, plan, opts) {
  const next = Object.assign({}, state);
  next.monthsData = Object.assign({}, state.monthsData || {});
  next.monthsData[plan.monthKey] = Object.assign({}, next.monthsData[plan.monthKey], {
    schedule: plan.nextRows,
  });
  /* 앱은 현재 달 표를 최상위 schedule 로도 들고 있다 — 둘 다 맞춰야 화면이 어긋나지 않는다 */
  if (state.activeMonthKey === plan.monthKey) next.schedule = plan.nextRows;
  next.brandConfig = plan.nextBrand;
  if (opts && opts.applyLogo && plan.logo.different && plan.logo.value) {
    next.customLogo = plan.logo.value;
  }
  return next;
}

/* 보여 주기용 요약 — 서버가 들고 있는 큰 값(표·로고)은 빼고 돌려준다 */
function summarize(plan) {
  return {
    monthKey: plan.monthKey,
    monthLabel: plan.monthLabel,
    undongpassMonth: plan.undongpassMonth,
    monthMismatch: plan.monthMismatch,
    stats: plan.stats,
    changes: plan.changes,
    newSlots: plan.newSlots,
    centerChanges: plan.centerChanges,
    logoDifferent: plan.logo.different,
  };
}

module.exports = { fetchUndongpass, buildPlan, applyPlan, summarize, to12, studioId, baseUrl };
