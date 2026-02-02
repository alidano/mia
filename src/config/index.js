import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  dbPath: process.env.DB_PATH || './data/voiceai.db',

  telnyx: {
    apiKey: process.env.TELNYX_API_KEY,
    publicKey: process.env.TELNYX_PUBLIC_KEY,
    connectionId: process.env.TELNYX_CONNECTION_ID,
    phoneNumber: process.env.TELNYX_PHONE_NUMBER,
  },

  ai: {
    assistantId: process.env.AI_ASSISTANT_ID,
  },

  transferNumber: process.env.TRANSFER_NUMBER,
  messagingProfileId: '4001922f-ac67-4faf-8adf-490e3ecba067',
};

// Validate required config
const required = ['TELNYX_API_KEY', 'TELNYX_CONNECTION_ID', 'TELNYX_PHONE_NUMBER'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`⚠️  Missing env var: ${key}`);
  }
}
