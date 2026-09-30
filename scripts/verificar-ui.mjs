/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * verificar-ui.mjs — Qué manda REALMENTE cada comando tuneado.
 *
 * No dibuja maquetas: ejecuta el código de verdad con un socket de
 * mentira, captura el mensaje exacto que habría salido por el cable y
 * lo vuelca a JSON. Así se puede comparar lo prometido con lo enviado.
 *
 *   node scripts/verificar-ui.mjs            → resumen en pantalla
 *   node scripts/verificar-ui.mjs --json ruta → vuelca el detalle
 */

import { writeFileSync } from "node:fs";

/** Socket de mentira que apunta todo lo que se le manda. */
function socketFalso() {
  const enviados = [];
  return {
    enviados,
    user: { id: "521550000000@s.whatsapp.net" },
    async relayMessage(jid, message, opts = {}) {
      enviados.push({ via: "relay", jid, message, nodos: opts.additionalNodes || null });
      return opts.messageId;
    },
    async sendMessage(jid, content) {
      enviados.push({ via: "send", jid, content });
      return { key: { id: "FAKE" + enviados.length, remoteJid: jid } };
    },
    async waUploadToServer() { throw new Error("sin subida de medios en la verificación"); },
  };
}

const GRUPO = "120363000000000000@g.us";
const PRIVADO = "521550000000@s.whatsapp.net";

/** Resume un mensaje: qué tipo es, qué botones lleva y qué se lee. */
function resumir(env) {
  if (env.via === "send") {
    const c = env.content || {};
    const tipo = c.poll ? "encuesta simple" : c.image ? "imagen" : c.video ? "vídeo" : c.audio ? "audio" : "texto";
    return { clase: "corriente", tipo, texto: c.text || c.caption || "", botones: [], nodos: null };
  }
  const m = env.message || {};
  const inter = m.interactiveMessage || m.viewOnceMessage?.message?.interactiveMessage;
  const salida = { clase: "nativo", nodos: (env.nodos || []).map((n) => n.tag) };

  if (inter?.carouselMessage) {
    salida.tipo = "carrusel";
    salida.texto = inter.body?.text || "";
    salida.pie = inter.footer?.text || "";
    salida.botones = [];
    salida.tarjetas = (inter.carouselMessage.cards || []).map((c) => ({
      titulo: c.header?.title || "",
      cuerpo: c.body?.text || "",
      botones: (c.nativeFlowMessage?.buttons || []).map((b) => {
        let p = {};
        try { p = JSON.parse(b.buttonParamsJson || "{}"); } catch { /* da igual */ }
        return { tipo: b.name, texto: p.display_text || "" };
      }),
    }));
    return salida;
  }

  if (inter) {
    const nf = inter.nativeFlowMessage || {};
    salida.tipo = "tarjeta interactiva";
    salida.texto = inter.body?.text || "";
    salida.pie = inter.footer?.text || "";
    salida.botones = (nf.buttons || []).map((b) => {
      let p = {};
      try { p = JSON.parse(b.buttonParamsJson || "{}"); } catch { /* da igual */ }
      return { tipo: b.name, texto: p.display_text || p.title || "" };
    });
    salida.hoja = nf.messageParamsJson || null;
    salida.envueltoEnViewOnce = !!m.viewOnceMessage;
    return salida;
  }
  if (m.pollCreationMessageV3) {
    const p = m.pollCreationMessageV3;
    salida.tipo = p.pollType === 1 ? "quiz nativo" : "encuesta nativa";
    salida.texto = p.name;
    salida.opciones = p.options.map((o) => o.optionName);
    salida.correcta = p.correctAnswer?.optionName || null;
    salida.multi = p.selectableOptionsCount;
    salida.botones = [];
    return salida;
  }
  if (m.protocolMessage?.type === 14) {
    const ed = m.protocolMessage.editedMessage || {};
    salida.tipo = "edición del mensaje anterior";
    salida.texto = ed.extendedTextMessage?.text || ed.conversation || "";
    salida.pasos = ed.messageContextInfo?.botMetadata?.progressIndicatorMetadata?.stepsMetadata
      ?.map((p) => `${p.statusTitle} (${p.status})`) || null;
    salida.botones = [];
    return salida;
  }
  if (m.messageContextInfo?.botMetadata) {
    const pi = m.messageContextInfo.botMetadata.progressIndicatorMetadata || {};
    salida.tipo = "panel de pasos";
    salida.texto = m.extendedTextMessage?.text || "";
    salida.descripcion = pi.progressDescription || "";
    salida.pasos = (pi.stepsMetadata || []).map((p) => `${p.statusTitle} (${p.status})`);
    salida.botones = [];
    return salida;
  }
  if (m.albumMessage) {
    salida.tipo = "álbum (mensaje padre)";
    salida.texto = `${m.albumMessage.expectedImageCount} fotos · ${m.albumMessage.expectedVideoCount} vídeos`;
    salida.botones = [];
    return salida;
  }
  if (m.audioMessage) {
    salida.tipo = "nota de voz";
    salida.texto = `onda de ${m.audioMessage.waveform?.length || 0} bytes`;
    salida.botones = [];
    return salida;
  }
  salida.tipo = Object.keys(m).filter((k) => k !== "messageContextInfo").join(", ") || "desconocido";
  salida.botones = [];
  return salida;
}

const casos = [];
const anotar = (comando, donde, esperado, envs, nota = "") =>
  casos.push({ comando, donde, esperado, nota, mensajes: envs.map(resumir) });

// ── .menu ──────────────────────────────────────────────────────────
{
  const { sendInteractive, singleSelect, quickReply, ctaUrl, ctaCopy } = await import("../src/commands/interactive.js");
  for (const [donde, jid] of [["grupo", GRUPO], ["privado", PRIVADO]]) {
    const sock = socketFalso();
    await sendInteractive(sock, jid, {
      title: "✨ SHIN-MD 3.0.3",
      body: "INFORMACIÓN SHIN-MD…",
      footer: "Shin-MD • Bot de WhatsApp Profesional",
      buttons: [
        singleSelect("📂 Explorar Categorías", [
          { title: "Lo más usado", highlight_label: "TOP", rows: [{ id: "play", title: "🎵 Descargar música", description: "" }] },
          { title: "反魂 · Categorías", rows: [{ id: "menucat:downloads", title: "⬇️ Descargas", description: "16 comandos" }] },
        ]),
        quickReply("📜 Ver Todo (.allmenu)", "allmenu"),
        quickReply("🏓 Ping", "ping"),
        ctaUrl("📢 Canal Oficial", "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522"),
        ctaCopy("📋 Copiar prefijo", "."),
        ctaUrl("⭐ Código fuente", "https://github.com/riokuroxi-svg/Shin-MD"),
      ],
      hoja: { titulo: "Shin-MD · más opciones", boton: "Ver todo", divisiones: [2] },
    });
    anotar(".menu", donde, "tarjeta con 3 botones a la vista y el resto en la hoja", sock.enviados);
  }
}

// ── .play: tarjeta y panel de pasos ────────────────────────────────
{
  const { sendNativeQuickReply } = await import("../src/lib/native-reply.js");
  const { buildBottomSheet, buildMessageParams } = await import("../src/lib/native-params.js");
  const url = "https://youtu.be/3vKrHEmKJow";
  for (const [donde, jid] of [["grupo", GRUPO], ["privado", PRIVADO]]) {
    const sock = socketFalso();
    await sendNativeQuickReply({
      sock, jid,
      title: "❦ Shin-MD",
      body: "🎬 RESULTADO\n> ❖ Título › Cunumi - Faraon Love Shady",
      footer: "❦ Shin-MD",
      buttons: [
        { text: "🎵 Audio ⚡", id: "t_pa" },
        { text: "🎬 Video MP4", id: "t_pv" },
        { text: "📄 Audio como documento", id: "t_pad" },
        { text: "▶️ Abrir en YouTube", url },
        { text: "📋 Copiar enlace", copy_code: url },
      ],
      params: buildMessageParams({
        bottomSheet: buildBottomSheet({ inThreadLimit: 2, dividers: [2], listTitle: "Cunumi", buttonTitle: "Más opciones" }),
      }),
    });
    anotar(".play (tarjeta)", donde, "audio y vídeo a la vista, tres más en la hoja", sock.enviados);
  }

  const { createProgress } = await import("../src/lib/progress.js");
  for (const [donde, jid] of [["grupo", GRUPO], ["privado", PRIVADO]]) {
    const sock = socketFalso();
    const prog = createProgress(sock, jid, {
      descripcion: "Cunumi - Faraon Love Shady",
      pasos: [{ titulo: "Buscando el audio", detalle: "Cunumi" }, { titulo: "Descargando audio" }, { titulo: "Enviando" }],
    });
    await prog.start({ title: "Descargando audio", detail: "Cunumi", pct: 20 });
    await prog.finish({ title: "Listo · Cunumi", detail: "audio · 3:28", pct: 100 });
    anotar(".play (progreso)", donde, "un envío y una edición; panel de pasos con texto dentro", sock.enviados,
      donde === "grupo" ? "en grupos WhatsApp no admite el nodo `bot`: puede quedarse solo el texto de pasos" : "");
  }
}

// ── .encuesta ──────────────────────────────────────────────────────
{
  const { sendQuiz } = await import("../src/lib/poll-plus.js");
  const sock = socketFalso();
  await sendQuiz(sock, GRUPO, { pregunta: "¿Capital de Japón?", opciones: ["Kioto", "Tokio", "Osaka"], correcta: 1 });
  anotar(".encuesta (quiz)", "grupo", "quiz nativo: WhatsApp pinta la correcta en verde", sock.enviados);
}

// ── .imagen ────────────────────────────────────────────────────────
{
  const { buildAlbumParent, planAlbum } = await import("../src/lib/album.js");
  const plan = planAlbum([
    { image: { url: "https://x/1.jpg" }, caption: "uno" },
    { image: { url: "https://x/2.jpg" }, caption: "dos" },
    { image: { url: "https://x/3.jpg" }, caption: "tres" },
  ]);
  const sock = socketFalso();
  await sock.relayMessage(GRUPO, buildAlbumParent(plan), { messageId: "A1" });
  anotar(".imagen", "grupo", "un padre de álbum y las fotos colgando de él", sock.enviados,
    "antes llamaba a un método inexistente y no mandaba nada");
}

// ── .tts ───────────────────────────────────────────────────────────
{
  const { vestirAudio } = await import("../src/lib/voice-art.js");
  const audioMessage = { url: "enc://x", mimetype: "audio/mpeg", seconds: 4 };
  vestirAudio(audioMessage, { patron: "firma", semilla: "hola shin" });
  const sock = socketFalso();
  await sock.relayMessage(GRUPO, { audioMessage }, { messageId: "V1" });
  anotar(".tts", "grupo", "nota de voz con onda propia de 64 bytes", sock.enviados);
}

// ── .recordar ──────────────────────────────────────────────────────
{
  const { sendInteractive, ctaReminder, quickReply } = await import("../src/commands/interactive.js");
  const sock = socketFalso();
  await sendInteractive(sock, GRUPO, {
    body: "✅ Recordatorio programado para dentro de 5 min.",
    footer: "Si el bot se reinicia, el recordatorio de WhatsApp sigue en pie.",
    buttons: [ctaReminder("⏰ Que me avise WhatsApp", "recordatorio"), quickReply("📋 Mis recordatorios", "recordar lista")],
  });
  anotar(".recordar", "grupo", "aviso con botón de recordatorio nativo", sock.enviados);
}

// ── .trivia ────────────────────────────────────────────────────────
{
  const { sendInteractive, quickReply } = await import("../src/commands/interactive.js");
  const sock = socketFalso();
  await sendInteractive(sock, GRUPO, {
    body: "🧠 Pregunta 1/10",
    footer: "🎮 Trivia · Shin-MD",
    buttons: ["A", "B", "C", "D"].map((l, i) => quickReply(l, `trivia:${i}`)).concat(quickReply("❌ Salir", "trivia:stop")),
    hoja: { titulo: "Elige tu respuesta", boton: "Ver respuestas", divisiones: [4] },
  });
  anotar(".trivia", "grupo", "cinco botones: tres a la vista y dos en la hoja", sock.enviados);
}


// ── .acortar y .tourl: enlaces que se copian de un toque ───────────
{
  const { sendInteractive, ctaCopy, ctaUrl } = await import("../src/commands/interactive.js");
  const sock = socketFalso();
  await sendInteractive(sock, GRUPO, {
    body: "🔗 *Enlace acortado:*\n\n> https://tinyurl.com/shinmd\n\n_Original:_ https://github.com/riokuroxi-svg/Shin-MD",
    footer: "TinyURL · Shin-MD",
    buttons: [ctaCopy("📋 Copiar el corto", "https://tinyurl.com/shinmd"), ctaUrl("🌐 Abrirlo", "https://tinyurl.com/shinmd")],
  });
  anotar(".acortar · .tourl", "grupo", "el enlace, copiable sin seleccionarlo a mano", sock.enviados);
}

// ── .guardar: rescatar un mensaje temporal ─────────────────────────
{
  const { buildKeep, sendNative } = await import("../src/lib/native-actions.js");
  const sock = socketFalso();
  await sendNative(sock, GRUPO, buildKeep({ id: "ABC", remoteJid: GRUPO, fromMe: false }));
  anotar(".guardar", "grupo", "keepInChatMessage: el mensaje deja de caducar", sock.enviados);
}

// ── .pin: fijar arriba del grupo ───────────────────────────────────
{
  const { buildPinPayload } = await import("../cmds/group/pin.js");
  const sock = socketFalso();
  await sock.sendMessage(GRUPO, buildPinPayload({ id: "ABC", remoteJid: GRUPO }, { segundos: 604800 }));
  anotar(".pin", "grupo", "fijado de 7 días (WhatsApp solo admite 24h, 7d o 30d)", sock.enviados);
}

// ── .evento ────────────────────────────────────────────────────────
{
  const { buildEventContent } = await import("../cmds/group/evento.js");
  const sock = socketFalso();
  const inicio = new Date(Date.now() + 86400000);
  await sock.relayMessage(GRUPO, buildEventContent({ nombre: "Noche de trivia", descripcion: "Traed café", inicio }), { messageId: "E1" });
  anotar(".evento", "grupo", "tarjeta de evento con voy / no voy / quizá", sock.enviados);
}

// ── .translate ─────────────────────────────────────────────────────
{
  const { sendTraduccion } = await import("../src/lib/translate.js");
  const sock = socketFalso();
  await sendTraduccion(sock, GRUPO, {
    original: "Good morning everyone", traduccion: "Buenos días a todos", de: "en", a: "es", fuente: "Google",
  });
  anotar(".translate · .autotraducir", "grupo", "tarjeta con el original, la traducción y las banderas", sock.enviados);
}

// ── .ia / .chatgpt / .deepseek ─────────────────────────────────────
{
  const { sendAiResponse } = await import("../src/lib/aiFormatter.js");
  const sock = socketFalso();
  await sendAiResponse(sock, GRUPO, {
    model: "DeepSeek-R1", query: "qué es el protocolo de WhatsApp",
    answer: "Es el idioma en el que hablan los teléfonos con los servidores de Meta.",
    latencyMs: 420, senderName: "Rio",
  });
  anotar(".ia · .chatgpt · .deepseek", "grupo", "respuesta con copiar, regenerar y limpiar memoria", sock.enviados);
}

// ── .daily (recompensa diaria) ─────────────────────────────────────
{
  const { sendNativeQuickReply } = await import("../src/lib/native-reply.js");
  const sock = socketFalso();
  await sendNativeQuickReply({
    sock, jid: GRUPO, title: "❦ Shin-MD", body: "🎁 Recompensa diaria: 500 monedas", footer: "Vuelve mañana",
    buttons: [{ text: "💰 Mi saldo", id: "balance" }, { text: "🏆 Ranking", id: "economyboard" }],
  });
  anotar(".daily", "grupo", "tarjeta de recompensa con atajos", sock.enviados);
}

// ── .ytsearch: el carrusel ─────────────────────────────────────────
{
  const { buildTarjeta, sendCarousel } = await import("../src/lib/carousel.js");
  const vids = [
    ["Cunumi - Faraon Love Shady (Video Oficial)", "3:28", "20,127,468", "Faraón Love Shady"],
    ["Cunumi (Letra)", "3:30", "812,345", "Letras"],
    ["Cunumi en vivo", "4:02", "99,123", "Conciertos"],
  ];
  const sock = socketFalso();
  await sendCarousel(sock, GRUPO, {
    texto: "🔎 *cunumi*\n> 3 resultados · pásalos con el dedo",
    pie: "❦ Shin-MD · 反魂",
    tarjetas: vids.map(([t, d, v, c], i) => buildTarjeta({
      titulo: t,
      cuerpo: `ⴵ *${d}*  ·  ✿ ${v} vistas\n❖ ${c}`,
      pie: `${i + 1} de ${vids.length}`,
      botones: [
        { texto: "⬇️ Descargar", id: ".play https://youtu.be/x" },
        { texto: "▶️ Ver en YouTube", url: "https://youtu.be/x" },
        { texto: "📋 Copiar enlace", copiar: "https://youtu.be/x" },
      ],
    })),
  });
  anotar(".ytsearch", "grupo", "carrusel: 3 tarjetas que se pasan con el dedo", sock.enviados,
    "antes era una foto y un ladrillo de texto con todos los resultados pegados");
}

// ── Los estados del sistema, antes y después ───────────────────────
//  Lo que más se ve de un bot no son sus tarjetas: son sus "no",
//  sus "te falta algo" y sus "se rompió". Aquí están, peinados.
{
  const { estilizar, state } = await import("../src/lib/theme.js");
  const crudos = [
    ["Comando de dueño", "🚫 *Solo el dueño* puede usar este comando.", state("onlyOwner")],
    ["Ayuda de .tourl", "《✧》 Responde a una imagen, video, audio o sticker con .tourl para subirlo y obtener un enlace.", null],
    ["Enlace inválido", "《✧》 El texto no parece un enlace válido (debe empezar con http:// o https://).", null],
    ["Descarga fallida", "ꕥ No se pudo descargar el archivo.", null],
    ["Dato borrado", "✎ Tu descripción ha sido eliminada.", null],
    ["Sin resultados", "《✧》 Anime no encontrado.", null],
  ];
  for (const [nombre, antes, forzado] of crudos) {
    casos.push({
      comando: nombre, donde: "estado", esperado: "así se veía antes del pase de estilo",
      nota: "", antes,
      mensajes: [{ clase: "corriente", tipo: "texto", texto: forzado || estilizar(antes), botones: [], nodos: null }],
    });
  }
}

// ── salida ─────────────────────────────────────────────────────────
const destino = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
if (destino) {
  writeFileSync(destino, JSON.stringify(casos, null, 2));
  console.log("Volcado en " + destino);
}

for (const c of casos) {
  console.log(`\n■ ${c.comando}  [${c.donde}]`);
  console.log(`  esperado: ${c.esperado}`);
  for (const m of c.mensajes) {
    const nodos = m.nodos?.length ? ` · nodos: ${m.nodos.join("+")}` : "";
    console.log(`  → ${m.tipo}${nodos}`);
    if (m.botones?.length) console.log(`     botones: ${m.botones.map((b) => `${b.texto} (${b.tipo})`).join(" | ")}`);
    if (m.hoja) console.log(`     hoja: ${m.hoja}`);
    if (m.pasos) console.log(`     pasos: ${m.pasos.join(" → ")}`);
    if (m.opciones) console.log(`     opciones: ${m.opciones.join(", ")} · correcta: ${m.correcta}`);
    if (m.texto) console.log(`     texto: ${JSON.stringify(m.texto.slice(0, 90))}`);
    if (m.envueltoEnViewOnce) console.log("     ⚠️ envuelto en viewOnce");
  }
  if (c.nota) console.log(`  ⚠ ${c.nota}`);
}
console.log(`\n${casos.length} casos verificados.`);
