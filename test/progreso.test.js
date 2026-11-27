/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  progreso.test.js — el indicador nativo existe en el proto y viaja.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarProgreso, armarBytesProgreso, PASO } from "#menu-kit/progreso";
import { proto } from "baileys";

test("progreso: el proto del paquete trae progressIndicatorMetadata", () => {
  // Los tipos de contexto viven en la raíz del paquete, no dentro de
  // proto.Message: se comprueba el que de verdad se usa al enviar.
  assert.ok(proto.MessageContextInfo, "tiene que existir MessageContextInfo");
  assert.ok(proto.BotMetadata, "tiene que existir BotMetadata");
  // Y que el mensaje real lo lleve: se arma uno y se mira lo que vuelve.
  const { decodificado } = armarBytesProgreso([{ titulo: "x" }]);
  assert.ok(
    decodificado.messageContextInfo?.botMetadata?.progressIndicatorMetadata,
    "el mensaje tiene que llevar progressIndicatorMetadata",
  );
});

test("progreso: descripción y pasos sobreviven al protobuf", () => {
  const pasos = [
    { titulo: "Buscando", cuerpo: "3 resultados", estado: PASO.COMPLETO },
    { titulo: "Resumiendo", cuerpo: "…", estado: PASO.EN_CURSO, razonamiento: true },
  ];
  const { bytes, decodificado } = armarBytesProgreso(pasos, "x@s.whatsapp.net");

  assert.ok(bytes.length > 0);
  const meta = decodificado.messageContextInfo.botMetadata.progressIndicatorMetadata;
  assert.equal(meta.progressDescription, "Pensando…");
  assert.equal(meta.stepsMetadata.length, 2);
  assert.equal(meta.stepsMetadata[0].statusTitle, "Buscando");
  assert.equal(Number(meta.stepsMetadata[0].status), 2);
  assert.equal(meta.stepsMetadata[1].isReasoning, true);
});

test("progreso: cada paso lleva texto legible (sin el indicador también se entiende)", () => {
  const contenido = armarProgreso([{ titulo: "Paso 1", cuerpo: "haciendo algo" }]);
  const texto = contenido.botForwardedMessage.message.richResponseMessage.submessages[0].messageText;
  assert.equal(texto, "Pensando…");
  assert.ok(contenido.messageContextInfo.botMetadata.progressIndicatorMetadata.stepsMetadata[0].statusBody);
});

test("progreso: sin pasos no revienta", () => {
  const { decodificado } = armarBytesProgreso([]);
  const meta = decodificado.messageContextInfo.botMetadata.progressIndicatorMetadata;
  assert.equal(meta.stepsMetadata.length, 0);
});
