import chalk from "chalk";
import moment from "moment";
import { formatCommandError } from "#lib/errors";
import { isOneOfOwner } from "#lib/jidIdentity";

export default async function mainRouter(sock, msg, messages) {
  if (!msg || !msg.text) return;

  const sender = msg.sender;
  const from = msg.chat;
  const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const isOwner = isOneOfOwner(sender, global.owner);
  const isROwner = sender === botJid || isOwner;

  const prefix = Array.isArray(global.prefix) ? global.prefix : ["#", "/", ".", "!", "-"];
  let usedPrefix = "";
  for (const p of prefix) {
    if (msg.body && msg.body.startsWith(p)) { usedPrefix = p; break; }
  }
  if (!usedPrefix) return;

  let args = msg.body.slice(usedPrefix.length).trim().split(/ +/);
  let command = (args.shift() || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let text = args.join(" ");
  if (!command) return;

  const cmdData = global.comandos && global.comandos.get(command);
  if (!cmdData) {
    await sock.sendMessage(from, { text: "✧ El comando *" + command + "* no existe.\n> Usa *" + usedPrefix + "help* para ver la lista." }, { quoted: msg });
    return;
  }

  // Permisos
  if ((cmdData.isOwner || cmdData.ownerOnly) && !isROwner) {
    return msg.reply(global.mess.owner || "Solo el creador puede usar esto.");
  }
  if (cmdData.groupOnly && !msg.isGroup) {
    return msg.reply(global.mess.grupo || "Solo en grupos.");
  }

  // Log
  console.log(
    "╭────────────────────────────·\n" +
    "│ Bot: " + botJid + "\n" +
    "│ Comando: " + command + "\n" +
    "│ Usuario: " + sender + "\n" +
    "╰────────────────────────────·"
  );

  // Ejecutar
  try {
    await cmdData.run({
      msg, sock, args, usedPrefix, command, text,
      isOwner: isROwner,
      __dirname: global.plugins && global.plugins[cmdData.pluginKey]
        ? global.plugins[cmdData.pluginKey].dirname : "",
    });
  } catch (error) {
    const errMsg = formatCommandError(error, command, { isOwner: isROwner });
    await sock.sendMessage(from, { text: errMsg }, { quoted: msg });
  }
}
