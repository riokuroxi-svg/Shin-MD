// Exec — ejecutar comandos en el servidor (solo owner)
import { execSync } from 'child_process';
export default {
  name: "exec", aliases: ["ex","e"], category: "owner", description: "Ejecutar comando en servidor ⚡", ownerOnly: true, cooldown: 3,
  async handler(sock, ctx) {
    if(!ctx.arg) return "⚡ .exec <comando>";
    try {
      const r=execSync(ctx.arg.trim(),{encoding:'utf8',timeout:10000});
      return `$ ${ctx.arg}\n${(r.stdout||'').slice(0,3500)}`;
    } catch(e) { return `❌ ${e.message}`; }
  }
};