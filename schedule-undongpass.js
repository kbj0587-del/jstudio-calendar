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
    getJson(`${baseUrl()}/api/timetable-view/data?studioId=${sid}&scope=all`),
    getJson(`${baseUrl()}/api/studio-settings?studioId=${sid}`).catch(() => null),
  ]);
  return { timetable, studio };
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

/* 줄을 찾는 기준은 "몇 시대인가" 다.
   요일마다 시작 시각이 조금씩 다르고(토요일만 10:30), 달이 바뀌면 그 시각도
   달라지기 때문에(11월은 토요일이 10:10) 분까지 맞추면 들어갈 자리를 잃는다.
   10시대 수업은 10시대 줄로 보내고, 칸에 적히는 시각은 운동패스 값을 쓴다. */
const hourOf = (t12) => parseInt(String(t12).split(':')[0], 10);

/* 새로 생기는 달은 기존 달의 줄 구조(디자인·안내문 포함)를 그대로 물려받는다 */
function cloneFrame(rows) {
  return rows.map((r) => {
    const days = {};
    for (const [d, c] of Object.entries(r.days || {})) {
      days[d] = Object.assign({}, c, { title: '', level: '', teacher: '' });
    }
    return Object.assign({}, r, { days });
  });
}

/*
 * 병합 계산 — 실제로 쓰지는 않고 "이렇게 바뀐다" 를 돌려준다.
 * state 는 건드리지 않는다(복사본을 만들어 돌려줌).
 *
 * 운동패스가 들고 있는 달을 모두(활성·임시·보관) 웹 시간표에 비춘다.
 *   이미 있는 달 → 그 달의 줄 구조를 그대로 두고 칸 내용만 갈아끼운다
 *   없는 달     → 기준 달의 줄 구조를 복사해 새로 만든다
 */
function buildPlan(state, incoming) {
  const tt = incoming.timetable || {};
  const monthsData = tt.monthsData || {};
  const statuses = tt.months || {};
  const keys = Object.keys(monthsData).sort();
  if (!keys.length) {
    const err = new Error('운동패스에 시간표가 없습니다.');
    err.code = 'NO_TIMETABLE';
    throw err;
  }

  /* 새 달을 만들 때 베낄 기준 틀 — 지금 보고 있는 달, 없으면 가장 최근 달 */
  const webMonths = state.monthsData || {};
  const refKey = webMonths[state.activeMonthKey] ? state.activeMonthKey
               : Object.keys(webMonths).sort().pop();
  const refRows = refKey && Array.isArray(webMonths[refKey].schedule) ? webMonths[refKey].schedule : null;
  if (!refRows || !refRows.length) {
    const err = new Error('웹 시간표에 기준이 될 표가 없습니다.');
    err.code = 'NO_FRAME';
    throw err;
  }

  const months = [];
  const nextMonths = Object.assign({}, webMonths);

  for (const key of keys) {
    const src = monthsData[key];
    const existing = webMonths[key];
    const isNew = !existing;
    const rows = isNew ? cloneFrame(refRows)
                       : (Array.isArray(existing.schedule) ? existing.schedule : []);
    if (!rows.length) continue;

    const days = Object.keys(rows[0].days || {});

    /* (요일, 시간대) → 줄 번호 */
    const lut = new Map();
    rows.forEach((r, i) => {
      const main = hourOf(to12(r.mainTime || ''));
      for (const d of days) {
        const c = (r.days || {})[d] || {};
        const h = c.startTime ? hourOf(to12(c.startTime)) : main;
        const k = d + '|' + h;
        if (!lut.has(k)) lut.set(k, i);
      }
    });

    /* 운동패스 수업을 줄에 꽂는다 */
    const filled = rows.map(() => ({}));
    const newSlots = [];
    const conflicts = [];
    for (const r of src.schedule || []) {
      for (const [d, c] of Object.entries(r.days || {})) {
        if (!c || !c.title) continue;
        const t = to12(c.startTime || r.mainTime || '');
        const i = lut.get(d + '|' + hourOf(t));
        if (i === undefined) {
          newSlots.push({ day: d, time: t, title: c.title, level: c.level || '' });
          continue;
        }
        if (filled[i][d]) { conflicts.push({ day: d, time: t, title: c.title }); continue; }
        filled[i][d] = { title: c.title, level: c.level || '', teacher: c.teacher || '', startTime: t };
      }
    }

    /* 달라지는 칸 모으기 */
    const changes = [];
    const timeShifts = [];
    const stats = { same: 0, changed: 0, added: 0, removed: 0 };
    const nextRows = rows.map((row, i) => {
      const nextDays = Object.assign({}, row.days);
      for (const d of days) {
        const old = (row.days || {})[d] || {};
        const neu = filled[i][d] || { title: '', level: '', teacher: '', startTime: old.startTime || '' };
        const before = { title: old.title || '', level: old.level || '', teacher: old.teacher || '' };
        const after = { title: neu.title, level: neu.level, teacher: neu.teacher };

        /* 칸의 시각이 달라지면 줄 옆 표기 문구를 사람이 확인해야 한다 */
        const oldT = to12(old.startTime || '');
        const newT = neu.title ? to12(neu.startTime || '') : oldT;
        if (neu.title && oldT && newT && oldT !== newT) {
          timeShifts.push({ day: d, before: oldT, after: newT });
        }

        nextDays[d] = Object.assign({}, old, after, neu.title ? { startTime: neu.startTime } : {});

        if (before.title === after.title && before.level === after.level && before.teacher === after.teacher) {
          if (before.title) stats.same += 1;
          continue;
        }
        const kind = !before.title ? 'added' : (!after.title ? 'removed' : 'changed');
        stats[kind] += 1;
        if (!isNew) {
          changes.push({ kind, day: d, time: to12(row.mainTime || ''),
                         before: cellText(before), after: cellText(after) });
        }
      }
      return Object.assign({}, row, { days: nextDays });
    });

    nextMonths[key] = Object.assign({}, existing, {
      monthLabel: (existing && existing.monthLabel) || src.monthLabel || '',
      schedule: nextRows,
    });

    months.push({
      key,
      label: nextMonths[key].monthLabel,
      status: (statuses[key] || {}).status || '',
      isNew,
      stats,
      changes,
      timeShifts,
      newSlots,
      conflicts,
    });
  }

  /* 웹에만 있고 운동패스에는 없는 달 — 알려만 주고 지우지 않는다 */
  const orphans = Object.keys(webMonths).filter((k) => !monthsData[k])
    .map((k) => ({ key: k, label: (webMonths[k] || {}).monthLabel || k }));

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

  /* 반영 뒤에는 운동패스가 쓰고 있는 달을 펼쳐 준다 */
  const activeKey = (tt.activeMonthKey && nextMonths[tt.activeMonthKey])
    ? tt.activeMonthKey
    : (state.activeMonthKey || keys[keys.length - 1]);

  return {
    months,
    orphans,
    centerChanges,
    activeKey,
    activeLabel: (nextMonths[activeKey] || {}).monthLabel || '',
    logo: { different: !!(st.logoUrl && st.logoUrl !== state.customLogo), value: st.logoUrl || '' },
    nextMonths,
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
  next.monthsData = plan.nextMonths;
  next.activeMonthKey = plan.activeKey;
  /* 앱은 펼쳐 둔 달의 표를 최상위 schedule 로도 들고 있다 — 둘 다 맞춰야 화면이 어긋나지 않는다 */
  const shown = plan.nextMonths[plan.activeKey];
  if (shown) {
    next.schedule = shown.schedule;
    next.month = shown.monthLabel || next.month;
  }
  next.brandConfig = plan.nextBrand;
  if (opts && opts.applyLogo && plan.logo.different && plan.logo.value) {
    next.customLogo = plan.logo.value;
  }
  return next;
}

/* 보여 주기용 요약 — 서버가 들고 있는 큰 값(표·로고)은 빼고 돌려준다 */
function summarize(plan) {
  const total = plan.months.reduce(function (n, m) {
    return n + m.stats.changed + m.stats.added + m.stats.removed;
  }, 0);
  return {
    months: plan.months,
    orphans: plan.orphans,
    centerChanges: plan.centerChanges,
    activeKey: plan.activeKey,
    activeLabel: plan.activeLabel,
    logoDifferent: plan.logo.different,
    totalChanges: total + plan.centerChanges.length,
    newMonths: plan.months.filter(function (m) { return m.isNew; }).length,
  };
}

module.exports = { fetchUndongpass, buildPlan, applyPlan, summarize, to12, studioId, baseUrl };
