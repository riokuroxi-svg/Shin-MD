/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  datos-equipo.mjs — Lo que se puede saber de la máquina donde corre
//
//  Todo sale de rutas que Android (y Linux) dejan leer sin permisos:
//  /sys/class/power_supply, /proc/meminfo, /system/build.prop. Nada de
//  cámara, micrófono, contactos ni ubicación. Nada de red.
//
//  Lo usan el panel (una foto) y la consola (que lo repinta cada
//  segundo), así que vive aquí y no duplicado en cada uno.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import os from "node:os";

/** Raíz donde buscar. Vacío = la del sistema; las pruebas la cambian. */
export const RAIZ = process.env.SHIN_PANEL_RAIZ || "";

export const leer = (ruta) => {
  try {
    return fs.readFileSync(ruta, "utf8").trim();
  } catch {
    return null;
  }
};

/** Marca, modelo y versión de Android. null si no es Android. */
export function datosAndroid() {
  const prop = leer(`${RAIZ}/system/build.prop`);
  if (!prop) return null;
  const campo = (clave) => {
    const m = prop.match(new RegExp(`^${clave}=(.*)$`, "m"));
    return m ? m[1].trim() : null;
  };
  return {
    version: campo("ro.build.version.release"),
    modelo: campo("ro.product.model"),
    marca: campo("ro.product.brand"),
  };
}

/** Batería: tanto por ciento, estado y temperatura en grados. */
export function bateria() {
  for (const base of [`${RAIZ}/sys/class/power_supply/battery`, `${RAIZ}/sys/class/power_supply/bms`]) {
    const capacidad = leer(`${base}/capacity`);
    if (capacidad && /^\d+$/.test(capacidad)) {
      const temperatura = leer(`${base}/temp`);
      return {
        pct: Number(capacidad),
        estado: leer(`${base}/status`) || "",
        // Viene en décimas de grado.
        temp: temperatura && /^-?\d+$/.test(temperatura) ? Number(temperatura) / 10 : null,
      };
    }
  }
  return null;
}

/** Disco del usuario: total, libre y porcentaje usado. */
export function disco() {
  try {
    const s = fs.statfsSync(os.homedir());
    const total = s.blocks * s.bsize;
    const libre = s.bavail * s.bsize;
    return { total, libre, pct: total ? Math.round(((total - libre) / total) * 100) : 0 };
  } catch {
    return null;
  }
}

/** Memoria del sistema entero, no la del proceso. */
export function memoriaSistema() {
  const info = leer(`${RAIZ}/proc/meminfo`);
  if (!info) return null;
  const total = Number((info.match(/^MemTotal:\s+(\d+) kB/m) || [])[1]);
  const disponible = Number((info.match(/^MemAvailable:\s+(\d+) kB/m) || [])[1]);
  if (!total || !disponible) return null;
  return { totalMB: Math.round(total / 1024), usadoMB: Math.round((total - disponible) / 1024) };
}

/** La IPv4 de la red local; en Android suele ser la del wifi. */
export function ipLocal() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const i of interfaces || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

/** Segundos a algo legible: 45s · 3m 12s · 2h 40m · 1d 4h. */
export function hace(brutos) {
  const segundos = Math.floor(Number(brutos) || 0); // os.uptime() trae decimales
  if (segundos < 60) return `${segundos}s`;
  const m = Math.floor(segundos / 60);
  if (m < 60) return `${m}m ${segundos % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const gb = (bytes) => `${(bytes / 1073741824).toFixed(1)} GB`;

export default { RAIZ, leer, datosAndroid, bateria, disco, memoriaSistema, ipLocal, hace, gb };
