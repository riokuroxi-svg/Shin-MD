// ReadViewOnce — lee mensajes de una sola vista
import { downloadContentFromMessage, extractMessageContent } from 'baileys';
export default {
  name: "read", aliases: ["readviewonce","readvo"], category: "utility",
  description: "Ver contenido de una vista 👁️",
  usage: ".read (responde a mensaje ViewOnce)", cooldown: 5,
  async handler(sock, ctx, engine) {
    const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                   ctx.full?.msg?.contextInfo?.quotedMessage;
    if (!quoted) return "👁️ *ReadViewOnce*\n\nResponde a un mensaje *ViewOnce* con .read";
    try {
      const content = extractMessageContent(quoted);
      if (!content) return '❌ No se pudo extraer contenido.';
      const msgType = Object.keys(content)[0];
      const mediaMsg = content[msgType];
      const stream = await downloadContentFromMessage(mediaMsg, msgType.replace('Message','').toLowerCase());
      let buffer = Buffer.from([]);
      for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
      const type = msgType.includes('video')?'video':msgType.includes('audio')?'audio':'image';
      const msg = {};
      if (type==='video') { msg.video=buffer; msg.mimetype='video/mp4'; msg.caption=mediaMsg.caption||''; }
      else if (type==='audio') { msg.audio=buffer; msg.mimetype='audio/ogg; codecs=opus'; msg.ptt=mediaMsg.ptt||false; }
      else { msg.image=buffer; msg.caption=mediaMsg.caption||''; }
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,msg,{quoted:ctx.full}),{messageLength:20});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};