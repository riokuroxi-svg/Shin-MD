// Resuelve el JID real del canal oficial al conectar por primera vez.
// Usa sock.newsletterMetadata("invite", code) que devuelve el @newsletter JID correcto.
const DEFAULT_CHANNEL_CODE = "0029VbDVFpSGJP89hfZUe522";
const DEFAULT_CHANNEL_LINK = "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522";
const DEFAULT_CHANNEL_NAME = "Shin-MD Official Channel";

let triedOnce = false;

export async function resolveChannel(sock, db, force = false) {
  let channelCode = globalThis.links?.channelCode || DEFAULT_CHANNEL_CODE;
  const channelName = globalThis.links?.channelName || DEFAULT_CHANNEL_NAME;

  if (typeof channelCode === "string" && /whatsapp\.com\/channel\/([0-9A-Za-z]{22,24})/i.test(channelCode)) {
    const match = channelCode.match(/whatsapp\.com\/channel\/([0-9A-Za-z]{22,24})/i);
    if (match) channelCode = match[1];
  }

  if (!sock) return globalThis.channelJid || null;
  if (globalThis.channelJid?.resolved && !force) return globalThis.channelJid;

  const botId = sock?.user?.id?.split(':')[0] + '@s.whatsapp.net';
  // Si ya está guardado en la DB del bot, lo usamos
  if (botId && !force && db) {
    try {
      const st = db?.getSettings?.(botId);
      if (st?.newsletter_id && String(st.newsletter_id).endsWith('@newsletter')) {
        globalThis.channelJid = {
          id: st.newsletter_id,
          name: st.nameid || channelName,
          resolved: true
        };
        return globalThis.channelJid;
      }
    } catch {}
  }

  if (triedOnce && !force) return globalThis.channelJid || null;
  triedOnce = true;

  try {
    if (typeof sock.newsletterMetadata === "function") {
      const info = await sock.newsletterMetadata('invite', channelCode);
      if (info?.id) {
        const name = info.thread_metadata?.name?.text || channelName;
        globalThis.channelJid = { id: info.id, name, resolved: true };
        // Guardar en DB para futuros arranques
        if (botId && db) {
          try {
            db.setSettings(botId, 'newsletter_id', info.id);
            db.setSettings(botId, 'nameid', name);
          } catch (_) {}
        }
        return globalThis.channelJid;
      }
    }
  } catch (_) {
    // sin internet o sin permisos: fallback a configuración
  }
  return globalThis.channelJid || null;
}

export function getChannelInfo() {
  return globalThis.channelJid || {
    id: globalThis.links?.channelId || '120363380000000000@newsletter',
    name: globalThis.links?.channelName || DEFAULT_CHANNEL_NAME,
    url: globalThis.links?.channel || DEFAULT_CHANNEL_LINK,
    code: globalThis.links?.channelCode || DEFAULT_CHANNEL_CODE,
    resolved: !!globalThis.channelJid?.resolved
  };
}
