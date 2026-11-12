/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  button-v2.js — Constructor fluido de mensajes interactivos
//  Envuelve sendInteractive (botones estándar, sin viewOnce) con
//  una API encadenable: título, cuerpo, pie, imagen y botones.
// ═══════════════════════════════════════════════════════════════════

import { sendInteractive, quickReply, ctaUrl, ctaCopy, singleSelect } from "../commands/interactive.js";

export class ButtonV2 {
  constructor(sock) {
    if (!sock) throw new Error("Se requiere el socket");
    this.sock = sock;
    this.title = "";
    this.body = "";
    this.footer = "";
    this.image = null;
    this.video = null;
    this.buttons = [];
    this.contextInfo = null;
    this.quoted = null;
    this.fallbackText = "";
  }

  setTitle(title) { this.title = String(title || ""); return this; }
  setBody(body) { this.body = String(body || ""); return this; }
  setFooter(footer) { this.footer = String(footer || ""); return this; }
  setImage(image) { this.image = image || null; return this; }
  setVideo(video) { this.video = video || null; return this; }
  setContextInfo(contextInfo) { this.contextInfo = contextInfo || null; return this; }
  setQuoted(quoted) { this.quoted = quoted || null; return this; }
  setFallbackText(text) { this.fallbackText = String(text || ""); return this; }

  addQuickReply(label, id) { this.buttons.push(quickReply(label, id)); return this; }
  addUrl(label, url) { this.buttons.push(ctaUrl(label, url)); return this; }
  addCopy(label, code) { this.buttons.push(ctaCopy(label, code)); return this; }
  addList(title, sections) { this.buttons.push(singleSelect(title, sections)); return this; }
  addRaw(button) {
    if (!button || !button.name || !button.buttonParamsJson) {
      throw new TypeError("Botón nativo inválido: requiere name y buttonParamsJson");
    }
    this.buttons.push(button);
    return this;
  }

  async send(jid, opts = {}) {
    return sendInteractive(this.sock, jid, {
      title: this.title,
      body: this.body,
      footer: this.footer,
      image: this.image,
      video: this.video,
      buttons: this.buttons,
      contextInfo: this.contextInfo || opts.contextInfo,
      quoted: this.quoted || opts.quoted,
      fallbackText: this.fallbackText || opts.fallbackText || this.body,
    });
  }
}

export default ButtonV2;
