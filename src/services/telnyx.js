import Telnyx from 'telnyx';
import { config } from '../config/index.js';
const telnyx = new Telnyx({ apiKey: config.telnyx.apiKey });

// ============================================================
// Start AI Assistant on an answered call
// ============================================================
export async function startAIAssistant(callControlId) {
  try {
    const body = {
      assistant: {
        id: config.ai.assistantId,
      },
    };

    const response = await fetch(
      `https://api.telnyx.com/v2/calls/${callControlId}/actions/ai_assistant_start`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.telnyx.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ AI Assistant response:', JSON.stringify(data));
      throw new Error(`${response.status} ${JSON.stringify(data)}`);
    }

    console.log(`🤖 AI Assistant started on call ${callControlId}`);
    return data;
  } catch (error) {
    console.error('❌ Failed to start AI Assistant:', error.message);
    throw error;
  }
}

// ============================================================
// Make an outbound call
// ============================================================
export async function dialOutbound(toNumber, webhookUrl) {
  try {
    const response = await telnyx.calls.dial({
      connection_id: config.telnyx.connectionId,
      from: config.telnyx.phoneNumber,
      to: toNumber,
      webhook_url: webhookUrl || `${config.baseUrl}/webhooks/voice`,
    });

    console.log(`📞 Outbound call initiated to ${toNumber}`);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to dial outbound:', error.message);
    throw error;
  }
}

// ============================================================
// Transfer call to human
// ============================================================
export async function transferCall(callControlId, destination) {
  try {
    await telnyx.calls.actions.transfer(callControlId, {
      to: destination || config.transferNumber,
    });
    console.log(`🔀 Call ${callControlId} transferred to ${destination || config.transferNumber}`);
  } catch (error) {
    console.error('❌ Failed to transfer call:', error.message);
    throw error;
  }
}

// ============================================================
// Hangup a call
// ============================================================
export async function hangupCall(callControlId) {
  try {
    await telnyx.calls.actions.hangup(callControlId);
    console.log(`📵 Call ${callControlId} hung up`);
  } catch (error) {
    console.error('❌ Failed to hangup call:', error.message);
    throw error;
  }
}

// ============================================================
// Send SMS
// ============================================================
export async function sendSMS(to, text) {
  try {
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.telnyx.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.telnyx.phoneNumber,
        to,
        text,
        messaging_profile_id: config.messagingProfileId,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ SMS send failed:', JSON.stringify(data));
      throw new Error(`${response.status} ${JSON.stringify(data)}`);
    }

    console.log(`📱 SMS sent to ${to}`);
    return data;
  } catch (error) {
    console.error('❌ Failed to send SMS:', error.message);
    throw error;
  }
}

export default { startAIAssistant, dialOutbound, transferCall, hangupCall, sendSMS };
