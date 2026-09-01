// Traducir — traduce texto con Google Translate
import { translate } from '@vitalets/google-translate-api';
export default {
  name: "traducir", aliases: ["translate", "trad"], category: "utility",
  description: "Traducir texto 🌐",
  usage: ".traducir <id> <texto> o responde .traducir <id>", cooldown: 5,
  async handler(sock, ctx) {
    const defaultLang = 'es';
    let lang = defaultLang, text = '';
    const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    if (quotedText) {
      if ((ctx.arg||'').trim().length===2) { lang = ctx.arg.trim(); text = quotedText; }
      else { text = quotedText; }
    } else if (ctx.arg) {
      const parts = ctx.arg.trim().split(/\s+/);
      if (parts[0].length===2) { lang = parts[0]; text = parts.slice(1).join(' '); }
      else { text = ctx.arg; }
    }
    if (!text) return "🌐 *Traducir*\n\nUso: `.traducir es Hello world`\nO responde a un mensaje con `.traducir en`";
    try { const r = await translate(text,{to:lang}); return r.text; }
    catch(e) { return `❌ Error: ${e.message}`; }
  }
};