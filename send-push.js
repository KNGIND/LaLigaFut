/* ============================================================
   /api/send-push
   Envía una notificación push a TODOS los dispositivos
   suscriptos, usando las claves VAPID.

   Variables de entorno necesarias (Vercel → Settings → Environment Variables):
     SUPABASE_URL              -> URL de tu proyecto Supabase
     SUPABASE_SERVICE_ROLE_KEY -> Service Role key (secreta)
     VAPID_PUBLIC_KEY          -> clave pública VAPID
     VAPID_PRIVATE_KEY         -> clave privada VAPID
     VAPID_SUBJECT             -> ej: "mailto:tu-email@dominio.com"

   Body esperado (JSON):
     { "title": "...", "body": "...", "icon": "...", "url": "...", "tag": "..." }

   Requiere la dependencia "web-push" en package.json:
     { "dependencies": { "web-push": "^3.6.7" } }
   ============================================================ */

import webpush from 'web-push';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, body, icon, url, tag, badge } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Falta "title"' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
    const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
    const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: 'Faltan variables de entorno de Supabase' });
    }
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Faltan claves VAPID' });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Traer todas las suscripciones guardadas
    const r = await fetch(`${SUPABASE_URL}/rest/v1/lsl_push_subscriptions?select=id,endpoint,subscription`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: 'Error leyendo suscripciones', detail: text });
    }
    const rows = await r.json();

    const payload = JSON.stringify({
      title,
      body: body || '',
      icon: icon || '/logo.png',
      badge: badge || '/logo.png',
      tag: tag || undefined,
      data: { url: url || '/' },
    });

    let sent = 0, failed = 0;
    const expiredIds = [];

    await Promise.all((rows || []).map(async row => {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        // 404/410 = la suscripción ya no existe (usuario desinstaló, etc.) → limpiar
        if (err.statusCode === 404 || err.statusCode === 410) {
          expiredIds.push(row.id);
        }
      }
    }));

    // Limpiar suscripciones vencidas
    if (expiredIds.length) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/lsl_push_subscriptions?id=in.(${expiredIds.join(',')})`, {
          method: 'DELETE',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
        });
      } catch (e) {}
    }

    return res.status(200).json({ ok: true, sent, failed, total: rows?.length || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error desconocido' });
  }
}
