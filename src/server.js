import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config/index.js';
import { initDatabase } from './models/database.js';
import webhookRoutes from './routes/webhooks.js';
import apiRoutes from './routes/api.js';

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ─────────────────────────────────────────────────
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);

// ── Root ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'VoiceAI Hub',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      webhooks: '/webhooks/voice',
      api: '/api/calls',
      health: '/api/health',
    },
  });
});

// ── Start ──────────────────────────────────────────────────
async function start() {
  // Initialize database (sql.js loads WASM async)
  await initDatabase();

  app.listen(config.port, () => {
    console.log(`\n🚀 VoiceAI Hub running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Base URL:    ${config.baseUrl}`);
    console.log(`   Phone:       ${config.telnyx.phoneNumber}`);
    console.log(`   AI Voice:    ${config.ai.voice}\n`);
  });
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
