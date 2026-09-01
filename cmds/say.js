// Say — repite texto
export default {
  name: "say", aliases: ["decir"], category: "utility",
  description: "Hacer que el bot repita un mensaje 🔁",
  usage: ".say <texto>", cooldown: 3, ownerOnly: false,
  async handler(sock, ctx) {
    if (!ctx.arg) return "🔁 *Say*\n\nUso: `.say <texto>`";
    return ctx.arg.trim();
  }
};