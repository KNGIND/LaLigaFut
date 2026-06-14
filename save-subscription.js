/* ============================================================
   /api/save-subscription
   Guarda (o actualiza) la suscripción push de un dispositivo
   en la tabla `lsl_push_subscriptions` de Supabase.

   Variables de entorno necesarias (Vercel → Settings → Environment Variables):
     SUPABASE_URL              -> URL de tu proyecto Supabase
     SUPABASE_SERVICE_ROLE_KEY -> Service Role key (¡secreta, NO la anon key!)
   ============================================================ */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Falta subscription.endpoint' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: 'Faltan variables de entorno de Supabase' });
    }

    // upsert por endpoint (clave única) para no duplicar suscripciones
    const r = await fetch(`${SUPABASE_URL}/rest/v1/lsl_push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        subscription: subscription,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: 'Error guardando en Supabase', detail: text });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error desconocido' });
  }
}
