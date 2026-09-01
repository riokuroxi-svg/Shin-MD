// Encuesta — crea encuesta en WhatsApp
export default {
  name: "encuesta", aliases: ["poll", "votacion"], category: "utility",
  description: "Crear una encuesta 📊",
  usage: ".encuesta <pregunta> | <op1> | <op2> | ...", cooldown: 10,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "📊 *Encuesta*\n\nUso: `.encuesta Pregunta | Op1 | Op2 | Op3`\nEj: `.encuesta ¿Qué color? | Rojo | Azul | Verde`";
    const parts = ctx.arg.split('|').map(s=>s.trim());
    if (parts.length < 3) return "❌ Necesito: Pregunta | Opción1 | Opción2 ...";
    const question = parts[0];
    const options = parts.slice(1).filter(Boolean);
    if (options.length < 2) return "❌ Al menos 2 opciones.";
    try {
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{
        poll: {name:question, values:options.map(o=>({optionName:o}))}
      },{quoted:ctx.full}),{messageLength:50});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};