import { test } from "node:test";
import assert from "node:assert/strict";

import { parseButtonResponse, isButtonResponse, quickReply, ctaUrl } from "#interactive";
import { createRouter } from "#router";

test("quickReply construye botón nativo correcto", () => {
  const btn = quickReply("🎮 Juegos", "menu games");
  assert.equal(btn.name, "quick_reply");
  const parsed = JSON.parse(btn.buttonParamsJson);
  assert.equal(parsed.display_text, "🎮 Juegos");
  assert.equal(parsed.id, "menu games");
});

test("ctaUrl construye botón de URL", () => {
  const btn = ctaUrl("GitHub", "https://github.com");
  assert.equal(btn.name, "cta_url");
  const parsed = JSON.parse(btn.buttonParamsJson);
  assert.equal(parsed.url, "https://github.com");
});

test("parseButtonResponse extrae id de buttonsResponseMessage", () => {
  const msg = {
    message: {
      buttonsResponseMessage: { selectedButtonId: "menu games", selectedDisplayText: "🎮" },
    },
  };
  assert.equal(parseButtonResponse(msg), "menu games");
  assert.equal(isButtonResponse(msg), true);
});

test("parseButtonResponse extrae id de interactiveResponseMessage", () => {
  const msg = {
    message: {
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: "ttt a1" }) },
      },
    },
  };
  assert.equal(parseButtonResponse(msg), "ttt a1");
});

test("parseButtonResponse devuelve null para mensaje normal", () => {
  const msg = { message: { conversation: "hola" } };
  assert.equal(parseButtonResponse(msg), null);
  assert.equal(isButtonResponse(msg), false);
});

test("router convierte clic de botón en comando", async () => {
  const engine = createEngineStub();
  const router = await (async () => { const r = createRouter(engine); await r.init(); return r; })();
  const sock = fakeSock();

  // Simular clic en botón "ping"
  const click = {
    key: { remoteJid: "521234567890@s.whatsapp.net", participant: "521234567890@s.whatsapp.net", fromMe: false, id: "C1" },
    message: {
      interactiveResponseMessage: {
        nativeFlowResponseMessage: { paramsJson: JSON.stringify({ id: "ping" }) },
      },
    },
    pushName: "Owner",
    messageTimestamp: Math.floor(Date.now() / 1000),
  };

  await router.handle(sock, click);
  assert.ok(sock.sent.length >= 1, "debe responder al clic del botón");
  assert.ok(sock.sent.some(s => s.content.text && s.content.text.includes("Pong")),
    "debe ejecutar el comando ping del botón");
});

// --- helpers ---
function createEngineStub() {
  const base = {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getRiskScore: () => 0, getStatus: () => ({ score: 0, level: "safe", events: 0 }) }),
    getSendQueue: () => ({
      enqueue: (fn) => fn(),
      length: () => 0,
      isPaused: () => false,
    }),
    setOwnerJid: () => {},
    getOwnerJid: () => "521234567890@s.whatsapp.net",
    getSock: () => null,
    LIFECYCLE: { READY: 3 },
    emit: () => {},
    on: () => {},
    transit: () => {},
  };
  return base;
}

function fakeSock() {
  const sent = [];
  return {
    user: { id: "521234567890:4@s.whatsapp.net" },
    sent,
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: "FAKE" + sent.length } };
    },
    async relayMessage() {
      sent.push({ jid: arguments[0], content: { relayed: true }, opts: arguments[2] });
      return { key: { id: "RELAY" + sent.length } };
    },
    waUploadToServer: () => Promise.resolve({}),
  };
}
