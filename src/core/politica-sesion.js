/** Shin-MD — Copyright (C) 2026 riokuroxi-svg — SPDX-License-Identifier: AGPL-3.0-only */
// Clasifica sin interpretar una desconexión como autorización para tocar archivos.
export function clasificarDesconexion(code, reasons, restartStreak = 0) {
  if ([reasons.loggedOut, reasons.forbidden, reasons.multideviceMismatch, reasons.badSession]
    .some(value => value !== undefined && value === code)) return 'revision';
  if (reasons.connectionReplaced !== undefined && code === reasons.connectionReplaced) return 'reemplazada';
  if (code === reasons.restartRequired || code === 0) return restartStreak >= 6 ? 'revision' : 'restart';
  return 'reconectar';
}
