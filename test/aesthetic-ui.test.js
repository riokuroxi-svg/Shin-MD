/**
 * Shin-MD - Aesthetic UI & Live Presence Suite Test
 * Verifica que todos los módulos de formato tipográfico, cajas Unicode,
 * generadores de contexto y comandos de menú funcionen con cero errores.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  toSmallCaps,
  toMathSansBold,
  readMore,
  createBracketBox,
  getCommandBadges,
  formatUptime,
  getTimeGreeting,
} from "../src/lib/formatter.js";
import {
  getWeatherSummary,
  getChannelContext,
  getVerifiedQuoted,
} from "../src/lib/contextBuilder.js";
import { generateProfileCard, generateWelcomeCard } from "../src/lib/cardGenerator.js";
import menuCmd from "../cmds/main/menu.js";
import menucatCmd from "../cmds/main/menucat.js";
import allmenuCmd from "../cmds/main/allmenu.js";
import setmenuCmd from "../cmds/owner/setmenu.js";
import deepseekCmd from "../cmds/utils/deepseek.js";

test("Aesthetic Formatter: toSmallCaps y toMathSansBold", () => {
  const sc = toSmallCaps("hello world");
  assert.equal(sc, "ʜᴇʟʟᴏ ᴡᴏʀʟᴅ");

  const mb = toMathSansBold("SHIN-MD");
  assert.equal(mb, "𝗦𝗛𝗜𝗡-𝗠𝗗");
});

test("Aesthetic Formatter: readMore invisible y cajas decorativas", () => {
  assert.ok(readMore.length >= 4000);
  const box = createBracketBox("TEST", ["cmd1", "cmd2"], "🚀");
  assert.ok(box.includes("TEST"));
  assert.ok(box.includes("cmd1"));
  assert.ok(box.includes("cmd2"));
  assert.ok(box.includes("🚀"));
});

test("Aesthetic Formatter: insignias de permisos", () => {
  assert.equal(getCommandBadges({ isOwner: true }), " 🅞");
  assert.equal(getCommandBadges({ isPremium: true, isAdmin: true }), " 🅟🅐");
});

test("ContextBuilder: getChannelContext y getVerifiedQuoted", () => {
  const cCtx = getChannelContext({ mentionedJid: ["123@s.whatsapp.net"] });
  assert.ok(cCtx.isForwarded);
  assert.ok(cCtx.forwardedNewsletterMessageInfo.newsletterJid);

  const vQuote = getVerifiedQuoted({ botName: "Shin-MD" });
  assert.ok(vQuote.message.contactMessage.displayName.includes("Shin-MD"));
});

test("Canvas Card Generator: generateProfileCard y generateWelcomeCard", async () => {
  const pCard = await generateProfileCard({
    name: "RioKuroxi",
    rank: "OWNER",
    level: 10,
    exp: 500,
    maxExp: 1000,
    coins: 25000,
  });
  assert.ok(Buffer.isBuffer(pCard));
  assert.ok(pCard.length > 5000);

  const wCard = await generateWelcomeCard({
    groupName: "Shin-MD Community",
    memberName: "Alex",
    memberCount: 42,
  });
  assert.ok(Buffer.isBuffer(wCard));
  assert.ok(wCard.length > 5000);
});

test("DeepSeek AI Command: maneja argumentos vacíos con guía explicativa", async () => {
  let replyText = "";
  const fakeMsg = {
    reply: (txt) => { replyText = txt; return true; }
  };
  await deepseekCmd.run({ msg: fakeMsg, usedPrefix: ".", command: "deepseek", text: "" });
  assert.ok(replyText.includes("DEEPSEEK-R1 REASONING"));
  assert.ok(replyText.includes(".deepseek <pregunta o problema>"));
});

test("Menu Commands: menucat devuelve catálogo o categoría", async () => {
  const dummySock = {
    sendMessage: async (chat, content) => {
      assert.ok(content.text.includes("INFORMACIÓN") || content.text.includes("SHIN-MD"));
      return { key: { id: "msg1" } };
    },
  };
  const dummyCtx = {
    chatId: "123@s.whatsapp.net",
    senderId: "123@s.whatsapp.net",
    usedPrefix: ".",
    arg: "info",
    full: {},
  };
  const mockCommands = new Map([
    ["ping", { name: "ping", category: "info", description: "Ver latencia" }],
  ]);

  await menucatCmd.handler(dummySock, dummyCtx, null, mockCommands);
});

test("Menu Commands: setmenu valida variantes y actualiza setting", async () => {
  const dummySock = { user: { id: "bot@s.whatsapp.net" } };
  const res1 = await setmenuCmd.handler(dummySock, { arg: "", usedPrefix: "." });
  assert.ok(res1.includes("CONFIGURACIÓN DE ESTILO"));

  const res2 = await setmenuCmd.handler(dummySock, { arg: "v2", usedPrefix: "." });
  assert.ok(res2.includes("ESTILO DE MENÚ ACTUALIZADO"));
});
