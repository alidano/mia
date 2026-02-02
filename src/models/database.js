import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

// ============================================================
// Database initialization (async because sql.js loads WASM)
// ============================================================
const DB_PATH = config.dbPath || './data/voiceai.db';
const DB_DIR = path.dirname(DB_PATH);

let db = null;

export async function initDatabase() {
  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      call_control_id TEXT UNIQUE,
      call_leg_id TEXT,
      direction TEXT DEFAULT 'inbound',
      from_number TEXT,
      to_number TEXT,
      status TEXT DEFAULT 'initiated',
      started_at TEXT,
      answered_at TEXT,
      ended_at TEXT,
      duration_seconds INTEGER DEFAULT 0,
      hangup_cause TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT,
      role TEXT,
      content TEXT,
      timestamp TEXT,
      FOREIGN KEY (call_id) REFERENCES calls(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id TEXT UNIQUE,
      summary TEXT,
      sentiment TEXT,
      action_items TEXT,
      topics TEXT,
      outcome TEXT,
      raw_payload TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (call_id) REFERENCES calls(id)
    )
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_calls_started ON calls(started_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_calls_control_id ON calls(call_control_id)`);

  console.log('✅ Database initialized');
  return db;
}

// Save to disk after writes
function persist() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ============================================================
// Calls
// ============================================================
export const callsDb = {
  create(call) {
    db.run(
      `INSERT INTO calls (id, call_control_id, call_leg_id, direction, from_number, to_number, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [call.id, call.call_control_id, call.call_leg_id, call.direction, call.from_number, call.to_number, call.status, call.started_at]
    );
    persist();
  },

  getByControlId(callControlId) {
    const stmt = db.prepare(`SELECT * FROM calls WHERE call_control_id = ?`);
    stmt.bind([callControlId]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  updateStatus(callControlId, status) {
    db.run(`UPDATE calls SET status = ? WHERE call_control_id = ?`, [status, callControlId]);
    persist();
  },

  markAnswered(callControlId, answeredAt) {
    db.run(`UPDATE calls SET status = 'answered', answered_at = ? WHERE call_control_id = ?`, [answeredAt, callControlId]);
    persist();
  },

  markEnded(callControlId, { ended_at, duration_seconds, hangup_cause }) {
    db.run(
      `UPDATE calls SET status = 'ended', ended_at = ?, duration_seconds = ?, hangup_cause = ? WHERE call_control_id = ?`,
      [ended_at, duration_seconds, hangup_cause, callControlId]
    );
    persist();
  },

  getRecent(limit = 20) {
    const results = [];
    const stmt = db.prepare(`SELECT * FROM calls ORDER BY started_at DESC LIMIT ?`);
    stmt.bind([limit]);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  query({ direction, status, from_date, to_date, limit = 50, offset = 0 }) {
    let where = [];
    let params = [];

    if (direction) { where.push('direction = ?'); params.push(direction); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (from_date) { where.push('started_at >= ?'); params.push(from_date); }
    if (to_date) { where.push('started_at <= ?'); params.push(to_date); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // Count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM calls ${whereClause}`);
    countStmt.bind(params);
    countStmt.step();
    const total = countStmt.getAsObject().total;
    countStmt.free();

    // Rows
    const rows = [];
    const rowStmt = db.prepare(`SELECT * FROM calls ${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`);
    rowStmt.bind([...params, limit, offset]);
    while (rowStmt.step()) {
      rows.push(rowStmt.getAsObject());
    }
    rowStmt.free();

    return { rows, total };
  },
};

// ============================================================
// Transcriptions
// ============================================================
export const transcriptionsDb = {
  add({ call_id, role, content, timestamp }) {
    db.run(
      `INSERT INTO transcriptions (call_id, role, content, timestamp) VALUES (?, ?, ?, ?)`,
      [call_id, role, content, timestamp]
    );
    persist();
  },

  getByCall(callId) {
    const results = [];
    const stmt = db.prepare(`SELECT * FROM transcriptions WHERE call_id = ? ORDER BY timestamp ASC`);
    stmt.bind([callId]);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },
};

// ============================================================
// Insights
// ============================================================
export const insightsDb = {
  add({ call_id, summary, sentiment, action_items, topics, outcome, raw_payload }) {
    db.run(
      `INSERT OR REPLACE INTO insights (call_id, summary, sentiment, action_items, topics, outcome, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [call_id, summary, sentiment, action_items, topics, outcome, raw_payload]
    );
    persist();
  },

  getByCall(callId) {
    const stmt = db.prepare(`SELECT * FROM insights WHERE call_id = ?`);
    stmt.bind([callId]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },
};

// ============================================================
// Stats
// ============================================================
export const statsDb = {
  daily(from_date, to_date) {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status IN ('initiated', 'missed') THEN 1 ELSE 0 END) as missed,
        SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
        SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound,
        AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END) as avg_duration,
        SUM(duration_seconds) as total_duration
      FROM calls
      WHERE started_at >= ? AND started_at <= ?
    `);
    stmt.bind([from_date, to_date]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  sentiment(from_date, to_date) {
    const stmt = db.prepare(`
      SELECT
        SUM(CASE WHEN i.sentiment = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN i.sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN i.sentiment = 'negative' THEN 1 ELSE 0 END) as negative
      FROM insights i
      JOIN calls c ON c.id = i.call_id
      WHERE c.started_at >= ? AND c.started_at <= ?
    `);
    stmt.bind([from_date, to_date]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  outcomes(from_date, to_date) {
    const results = [];
    const stmt = db.prepare(`
      SELECT outcome, COUNT(*) as count
      FROM insights i
      JOIN calls c ON c.id = i.call_id
      WHERE c.started_at >= ? AND c.started_at <= ?
      GROUP BY outcome
    `);
    stmt.bind([from_date, to_date]);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },
};
