import { Router } from 'express';
import { callsDb, transcriptionsDb, insightsDb, statsDb } from '../models/database.js';
import { dialOutbound } from '../services/telnyx.js';

const router = Router();

// ============================================================
// GET /api/calls — List calls with filters & pagination
// ============================================================
router.get('/calls', (req, res) => {
  const {
    direction = null,
    status = null,
    from_date = null,
    to_date = null,
    limit = '50',
    offset = '0',
  } = req.query;

  const { rows, total } = callsDb.query({
    direction: direction || null,
    status: status || null,
    from_date: from_date || null,
    to_date: to_date || null,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });

  res.json({
    data: rows,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    },
  });
});

// ============================================================
// GET /api/calls/recent — Quick recent calls
// ============================================================
router.get('/calls/recent', (req, res) => {
  const limit = parseInt(req.query.limit || '20');
  const calls = callsDb.getRecent(limit);
  res.json({ data: calls });
});

// ============================================================
// GET /api/calls/:callControlId — Single call detail
// ============================================================
router.get('/calls/:callControlId', (req, res) => {
  const call = callsDb.getByControlId(req.params.callControlId);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  const transcription = transcriptionsDb.getByCall(call.id);
  const insight = insightsDb.getByCall(call.id);

  res.json({
    data: {
      ...call,
      transcription,
      insight,
    },
  });
});

// ============================================================
// GET /api/stats/today — Today's dashboard stats
// ============================================================
router.get('/stats/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const from_date = `${today}T00:00:00.000Z`;
  const to_date = `${today}T23:59:59.999Z`;

  const daily = statsDb.daily(from_date, to_date);
  const sentiment = statsDb.sentiment(from_date, to_date);
  const outcomes = statsDb.outcomes(from_date, to_date);

  res.json({
    data: {
      calls: {
        total: daily?.total_calls || 0,
        completed: daily?.completed || 0,
        missed: daily?.missed || 0,
        inbound: daily?.inbound || 0,
        outbound: daily?.outbound || 0,
        avg_duration: Math.round(daily?.avg_duration || 0),
        total_duration: daily?.total_duration || 0,
      },
      sentiment: {
        positive: sentiment?.positive || 0,
        neutral: sentiment?.neutral || 0,
        negative: sentiment?.negative || 0,
      },
      outcomes: outcomes || [],
    },
  });
});

// ============================================================
// GET /api/stats/range — Stats for a date range
// ============================================================
router.get('/stats/range', (req, res) => {
  const { from_date, to_date } = req.query;
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date and to_date required' });
  }

  const daily = statsDb.daily(from_date, to_date);
  const sentiment = statsDb.sentiment(from_date, to_date);
  const outcomes = statsDb.outcomes(from_date, to_date);

  res.json({ data: { calls: daily, sentiment, outcomes } });
});

// ============================================================
// POST /api/calls/outbound — Initiate an outbound call
// ============================================================
router.post('/calls/outbound', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" phone number' });

  try {
    const result = await dialOutbound(to);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/health — Health check for monitoring
// ============================================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

export default router;
