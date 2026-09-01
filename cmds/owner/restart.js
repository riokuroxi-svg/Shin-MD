// Restart — reinicia el bot
export default {
  name: "restart", aliases: ["reboot"], category: "owner", description: "Reiniciar el bot 🔄", ownerOnly: true, cooldown: 3,
  async handler(sock, ctx) {
    await sock.sendMessage(ctx.chatId, { text: "🔄 Reiniciando..." }, {});
    process.exit(0);
  }
};