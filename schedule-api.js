'use strict';

const { randomUUID } = require('crypto');

const DAYS = ['월', '화', '수', '목', '금', '토'];

const INITIAL_JUNE_DATA = {
  slots: [
    {
      id: randomUUID(),
      label: 'AM 10:10',
      dayTimes: { '토': 'AM 10:30' },
      days: {
        '월': null, '화': null,
        '수': { name: '스텝박스', level: '유산소/근력', instructor: '현정', note: '' },
        '목': { name: '번지피지오', level: '베이직', instructor: '민정', note: '' },
        '금': null,
        '토': { name: '번지피지오', level: '워크아웃', instructor: '1,3주 연재 / 2,4주 민정', note: '' }
      }
    },
    {
      id: randomUUID(),
      label: 'AM 11:10',
      dayTimes: { '토': 'AM 11:30' },
      days: {
        '월': { name: '번지피지오', level: '안무베이직', instructor: '연재', note: '' },
        '화': { name: '번지피지오', level: '워크아웃', instructor: '민정', note: '' },
        '수': { name: '플라잉요가', level: 'Lv.0', instructor: '연재', note: '' },
        '목': { name: '플라잉요가', level: 'Lv.0', instructor: '민정', note: '' },
        '금': { name: '플라잉스트레칭', level: '아로마/로우', instructor: '현정', note: '' },
        '토': { name: '플라잉요가', level: 'Lv.0', instructor: '1,3주 연재 / 2,4주 민정', note: '' }
      }
    },
    {
      id: randomUUID(),
      label: 'AM 12:30',
      dayTimes: {},
      days: {
        '월': null, '화': null, '수': null, '목': null, '금': null,
        '토': { name: '번지피지오', level: '베이직', instructor: '1,3주 연재 / 2,4주 민정', note: '' }
      }
    },
    {
      id: randomUUID(),
      label: 'PM 7:30',
      dayTimes: { '화': 'PM 7:00', '목': 'PM 7:00' },
      days: {
        '월': { name: '플라잉요가', level: 'Lv.1', instructor: '민정', note: '' },
        '화': { name: '스텝박스', level: '유산소/근력', instructor: '현정', note: '' },
        '수': { name: '번지피지오', level: '콤비네이션', instructor: '민정', note: '' },
        '목': { name: '플라잉요가', level: 'Lv.0', instructor: '현정', note: '' },
        '금': { name: '체어플라잉', level: '스트레칭/근력', instructor: '현정', note: '' },
        '토': null
      }
    },
    {
      id: randomUUID(),
      label: 'PM 8:30',
      dayTimes: { '화': 'PM 8:00', '목': 'PM 8:00' },
      days: {
        '월': { name: '플라잉스트레칭', level: '아로마/로우', instructor: '민정', note: '' },
        '화': { name: '번지피지오', level: '베이직', instructor: '연재', note: '' },
        '수': { name: '플라잉요가', level: 'Lv.0', instructor: '민정', note: '' },
        '목': { name: '번지피지오', level: '워크아웃', instructor: '연재', note: '' },
        '금': { name: '번지피지오', level: '안무베이직', instructor: '현정', note: '' },
        '토': null
      }
    },
    {
      id: randomUUID(),
      label: 'PM 9:30',
      dayTimes: { '화': 'PM 9:00', '목': 'PM 9:00' },
      days: {
        '월': { name: '번지피지오', level: '', instructor: '', note: '' },
        '화': { name: '플라잉요가', level: '', instructor: '', note: '' },
        '수': { name: '번지피지오', level: '', instructor: '', note: '' },
        '목': { name: '스텝박스', level: '', instructor: '', note: '' },
        '금': null, '토': null
      }
    }
  ]
};

function registerScheduleRoutes(app, deps) {
  const { getPool, isAdmin } = deps;

  const q = (sql, params) => {
    const pool = getPool();
    if (!pool) throw new Error('DB 연결 없음 (DATABASE_URL 필요)');
    return pool.query(sql, params);
  };

  async function ensureTable() {
    await q(`
      CREATE TABLE IF NOT EXISTS js_timetable (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        year INT NOT NULL,
        month INT NOT NULL,
        data JSONB NOT NULL DEFAULT '{"slots":[]}'::jsonb,
        published BOOLEAN NOT NULL DEFAULT true,
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT js_timetable_ym_key UNIQUE(year, month)
      )
    `);
    // Seed June 2026 data if empty
    const { rows } = await q('SELECT COUNT(*)::int AS cnt FROM js_timetable', []);
    if (rows[0].cnt === 0) {
      await q(
        `INSERT INTO js_timetable (year, month, data, published, note)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT DO NOTHING`,
        [2026, 6, JSON.stringify(INITIAL_JUNE_DATA),
          '수업 시작 전 10분, 몸과 마음을 준비하는 시간입니다.']
      );
      console.log('📅 6월 시간표 초기 데이터 삽입 완료');
    }
  }

  // GET /api/schedule/list
  app.get('/api/schedule/list', async (req, res) => {
    try {
      const adminMode = isAdmin(req);
      const result = await q(
        `SELECT year, month, published, note, updated_at
         FROM js_timetable
         ${adminMode ? '' : 'WHERE published = true'}
         ORDER BY year DESC, month DESC`,
        []
      );
      res.json({ months: result.rows });
    } catch (e) {
      console.error('schedule list error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/schedule/current
  app.get('/api/schedule/current', async (req, res) => {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      let result = await q(
        `SELECT * FROM js_timetable WHERE year=$1 AND month=$2 AND published=true`,
        [y, m]
      );
      if (!result.rows.length) {
        result = await q(
          `SELECT * FROM js_timetable WHERE published=true ORDER BY year DESC, month DESC LIMIT 1`,
          []
        );
      }
      res.json({ timetable: result.rows[0] || null });
    } catch (e) {
      console.error('schedule current error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/schedule/:year/:month
  app.get('/api/schedule/:year/:month', async (req, res) => {
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      const adminMode = isAdmin(req);
      const result = await q(
        `SELECT * FROM js_timetable WHERE year=$1 AND month=$2${adminMode ? '' : ' AND published=true'}`,
        [y, m]
      );
      if (!result.rows.length) return res.status(404).json({ error: '시간표 없음' });
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      console.error('schedule get error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/schedule — create or upsert whole timetable
  app.post('/api/schedule', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const { year, month, data, note, published } = req.body;
      if (!year || !month) return res.status(400).json({ error: 'year, month 필수' });
      const safeData = data || { slots: [] };
      const result = await q(
        `INSERT INTO js_timetable (year, month, data, note, published, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (year, month) DO UPDATE
           SET data=$3, note=$4, published=$5, updated_at=NOW()
         RETURNING *`,
        [year, month, JSON.stringify(safeData), note || null, published !== false]
      );
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      console.error('schedule create error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/schedule/:year/:month/cell — edit one cell
  app.put('/api/schedule/:year/:month/cell', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      const { slotId, day, cell } = req.body;
      if (!slotId || !day) return res.status(400).json({ error: 'slotId, day 필수' });

      const cur = await q('SELECT data FROM js_timetable WHERE year=$1 AND month=$2', [y, m]);
      if (!cur.rows.length) return res.status(404).json({ error: '시간표 없음' });

      const data = cur.rows[0].data;
      const slot = data.slots.find(s => s.id === slotId);
      if (!slot) return res.status(404).json({ error: '슬롯 없음' });

      if (cell === null || cell === undefined) {
        slot.days[day] = null;
      } else {
        slot.days[day] = {
          name: cell.name || '',
          level: cell.level || '',
          instructor: cell.instructor || '',
          note: cell.note || ''
        };
      }

      const result = await q(
        'UPDATE js_timetable SET data=$1, updated_at=NOW() WHERE year=$2 AND month=$3 RETURNING *',
        [JSON.stringify(data), y, m]
      );
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      console.error('schedule cell error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/schedule/:year/:month/slot — add / update / delete / reorder slots
  app.put('/api/schedule/:year/:month/slot', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      const { action, slot } = req.body;

      const cur = await q('SELECT data FROM js_timetable WHERE year=$1 AND month=$2', [y, m]);
      if (!cur.rows.length) return res.status(404).json({ error: '시간표 없음' });
      const data = cur.rows[0].data;

      if (action === 'add') {
        const newSlot = {
          id: randomUUID(),
          label: slot?.label || '새 시간',
          dayTimes: slot?.dayTimes || {},
          days: Object.fromEntries(DAYS.map(d => [d, null]))
        };
        data.slots.push(newSlot);
      } else if (action === 'update') {
        const idx = data.slots.findIndex(s => s.id === slot.id);
        if (idx !== -1) {
          data.slots[idx].label = slot.label;
          data.slots[idx].dayTimes = slot.dayTimes || {};
        }
      } else if (action === 'delete') {
        data.slots = data.slots.filter(s => s.id !== slot.id);
      } else if (action === 'reorder') {
        const map = Object.fromEntries(data.slots.map(s => [s.id, s]));
        data.slots = (slot.ids || []).map(id => map[id]).filter(Boolean);
      }

      const result = await q(
        'UPDATE js_timetable SET data=$1, updated_at=NOW() WHERE year=$2 AND month=$3 RETURNING *',
        [JSON.stringify(data), y, m]
      );
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      console.error('schedule slot error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/schedule/:year/:month/note — update timetable note
  app.put('/api/schedule/:year/:month/note', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      const result = await q(
        'UPDATE js_timetable SET note=$1, updated_at=NOW() WHERE year=$2 AND month=$3 RETURNING *',
        [req.body.note || null, y, m]
      );
      if (!result.rows.length) return res.status(404).json({ error: '시간표 없음' });
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/schedule/:year/:month/publish — toggle published
  app.post('/api/schedule/:year/:month/publish', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      const result = await q(
        'UPDATE js_timetable SET published=$1, updated_at=NOW() WHERE year=$2 AND month=$3 RETURNING *',
        [req.body.published !== false, y, m]
      );
      if (!result.rows.length) return res.status(404).json({ error: '시간표 없음' });
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/schedule/:year/:month/copy-from — copy another month's slots
  app.post('/api/schedule/:year/:month/copy-from', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      const { fromYear, fromMonth } = req.body;
      const src = await q('SELECT data FROM js_timetable WHERE year=$1 AND month=$2', [fromYear, fromMonth]);
      if (!src.rows.length) return res.status(404).json({ error: '원본 없음' });

      // Deep clone and reassign UUIDs
      const srcData = JSON.parse(JSON.stringify(src.rows[0].data));
      srcData.slots = srcData.slots.map(s => ({
        ...s,
        id: randomUUID(),
        days: { ...s.days }
      }));

      const result = await q(
        `INSERT INTO js_timetable (year, month, data, published, updated_at)
         VALUES ($1, $2, $3, false, NOW())
         ON CONFLICT (year, month) DO UPDATE SET data=$3, updated_at=NOW()
         RETURNING *`,
        [y, m, JSON.stringify(srcData)]
      );
      res.json({ timetable: result.rows[0] });
    } catch (e) {
      console.error('schedule copy error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/schedule/:year/:month
  app.delete('/api/schedule/:year/:month', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const y = parseInt(req.params.year);
      const m = parseInt(req.params.month);
      await q('DELETE FROM js_timetable WHERE year=$1 AND month=$2', [y, m]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  ensureTable().catch(e => console.error('시간표 테이블 초기화 실패:', e));
  console.log('📅 J.Studio 시간표 라우트 등록 완료 (/api/schedule/*)');
}

module.exports = { registerScheduleRoutes };
