import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import Telnyx from 'telnyx';
import { config } from '../config/index.js';
import { callsDb, transcriptionsDb, insightsDb } from '../models/database.js';
import { startAIAssistant, sendSMS } from '../services/telnyx.js';

const telnyx = new Telnyx({ apiKey: config.telnyx.apiKey });

const router = Router();

// ============================================================
// POST /webhooks/voice — Main Telnyx webhook handler
// ============================================================
router.post('/voice', async (req, res) => {
  // Always respond 200 immediately so Telnyx doesn't retry
  res.sendStatus(200);

  const event = req.body?.data;
  if (!event) return;

  const eventType    = event.event_type;
  const payload      = event.payload;
  const callControlId = payload?.call_control_id;

  console.log(`📨 Webhook: ${eventType} | Call: ${callControlId?.slice(0, 12)}...`);

  try {
    switch (eventType) {

      // ── Call initiated (ringing) ──────────────────────────
      case 'call.initiated': {
        const callId = uuid();
        callsDb.create({
          id: callId,
          call_control_id: callControlId,
          call_leg_id: payload.call_leg_id,
          direction: payload.direction || 'inbound',
          from_number: payload.from,
          to_number: payload.to,
          status: 'initiated',
          started_at: new Date().toISOString(),
        });

        if (payload.direction === 'incoming' || payload.direction === 'inbound') {
          const ansRes = await fetch(
            `https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${config.telnyx.apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            }
          );
          const ansData = await ansRes.json();
          if (!ansRes.ok) {
            console.error(`❌ Answer failed (${ansRes.status}):`, JSON.stringify(ansData));
          }
        }
        break;
      }

      // ── Call answered ─────────────────────────────────────
      case 'call.answered': {
        callsDb.markAnswered(callControlId, new Date().toISOString());

        // 🤖 Start the AI Assistant
        await startAIAssistant(callControlId);
        callsDb.updateStatus(callControlId, 'ai_active');
        break;
      }

      // ── AI conversation ended ─────────────────────────────
      case 'call.conversation.ended': {
        console.log(`💬 AI conversation ended on ${callControlId}`);

        const call = callsDb.getByControlId(callControlId);
        if (call && payload.transcription) {
          const messages = payload.transcription;
          if (Array.isArray(messages)) {
            for (const msg of messages) {
              transcriptionsDb.add({
                call_id: call.id,
                role: msg.role || 'unknown',
                content: msg.content || msg.text || '',
                timestamp: msg.timestamp || new Date().toISOString(),
              });
            }
          }
        }
        break;
      }

      // ── Conversation insights (summary, sentiment, etc.) ──
      case 'call.conversation_insights.generated': {
        const call = callsDb.getByControlId(callControlId);
        if (call) {
          const ins = payload.insights || payload;
          insightsDb.add({
            call_id: call.id,
            summary: ins.summary || null,
            sentiment: ins.sentiment?.overall || ins.sentiment || null,
            action_items: JSON.stringify(ins.action_items || []),
            topics: JSON.stringify(ins.topics || []),
            outcome: classifyOutcome(ins),
            raw_payload: JSON.stringify(payload),
          });
          console.log(`📊 Insights saved: ${ins.sentiment?.overall || 'N/A'} | ${ins.summary?.slice(0, 60)}...`);
        }
        break;
      }

      // ── Call hangup ───────────────────────────────────────
      case 'call.hangup': {
        const call = callsDb.getByControlId(callControlId);
        const answeredAt = call?.answered_at ? new Date(call.answered_at) : null;
        const duration = answeredAt
          ? Math.round((Date.now() - answeredAt.getTime()) / 1000)
          : 0;

        callsDb.markEnded(callControlId, {
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          hangup_cause: payload.hangup_cause || 'normal',
        });

        console.log(`📵 Call ended | Duration: ${duration}s | Cause: ${payload.hangup_cause}`);
        break;
      }

      default:
        console.log(`   ↳ Unhandled event: ${eventType}`);
    }
  } catch (error) {
    console.error(`❌ Error handling ${eventType}:`, error.message);
  }
});

// ============================================================
// POST /webhooks/tools/send-sms — AI tool: send info SMS
// ============================================================
router.post('/tools/send-sms', async (req, res) => {
  try {
    const { message_type, custom_text } = req.body;
    const callControlId = req.body.call_control_id;

    // Get caller number from the call database
    const call = callsDb.getByControlId(callControlId);
    const to = call?.from_number;

    if (!to) {
      console.error('❌ SMS: No caller number found for call', callControlId);
      return res.json({ success: false, message: 'No se encontró el número del llamante.' });
    }

    const messages = {
      location: '📍 Revita Wellness - Villas de San Francisco Plaza II, Ave. De Diego #87, Suite 214, San Juan PR\n\nGoogle Maps: https://maps.app.goo.gl/YourLinkHere',
      appointment: '📅 Agenda tu cita en Revita Wellness:\nhttps://booking.setmore.com/scheduleappointment/revitawellness',
      weight_loss: '⚖️ Completa tu evaluación para el programa de pérdida de peso:\nhttps://revitawellnesspr.com/weight-loss-evaluation',
      prices: '💰 Consulta nuestros precios y servicios:\nhttps://revitawellnesspr.com/prices',
      product: custom_text
        ? `🛒 Información del producto: ${custom_text}`
        : '🛒 Conoce nuestros productos:\nhttps://revitawellnesspr.com/products',
    };

    const text = messages[message_type] || custom_text || 'Gracias por contactar a Revita Wellness.';

    await sendSMS(to, text);

    console.log(`📱 Info SMS (${message_type}) sent to ${to}`);
    res.json({ success: true, message: `SMS de ${message_type} enviado exitosamente.` });
  } catch (error) {
    console.error('❌ SMS webhook error:', error.message);
    res.json({ success: false, message: 'Error al enviar el SMS.' });
  }
});

// ============================================================
// POST /webhooks/tools/book-appointment — AI tool webhook
// ============================================================
router.post('/tools/book-appointment', (req, res) => {
  const params = req.body;
  console.log('📅 Appointment request:', params);

  // TODO: Connect to your calendar/CRM here
  res.json({
    success: true,
    message: `Cita registrada para ${params.client_name} — ${params.service}`,
  });
});

// ============================================================
// Helper: Classify call outcome from insights
// ============================================================
function classifyOutcome(insights) {
  const summary = (insights.summary || '').toLowerCase();
  const actions = (insights.action_items || []).join(' ').toLowerCase();
  const combined = summary + ' ' + actions;

  if (combined.includes('cita') || combined.includes('agendar') || combined.includes('appointment'))
    return 'appointment';
  if (combined.includes('transfer') || combined.includes('humano') || combined.includes('agente'))
    return 'transfer';
  if (combined.includes('info') || combined.includes('pregunt') || combined.includes('consult'))
    return 'info';
  return 'other';
}

export default router;
