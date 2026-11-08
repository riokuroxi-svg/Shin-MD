/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// El reinicio sin supervisor se prueba de verdad: se monta un proyecto con
// un index.js falso, se le pide reiniciar y se mira que nazca un proceso
// nuevo. Nada de simular la decisión y dar por hecho el resto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

function montar({ conVigia = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-relevo-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "cmds", "owner"), { recursive: true });
  if (conVigia) {
    for (const pieza of ["vigia.mjs", "supervisor.mjs"]) {
      fs.copyFileSync(path.join(RAIZ, "scripts", pieza), path.join(dir, "scripts", pieza));
    }
  }
  fs.copyFileSync(
    path.join(RAIZ, "cmds", "owner", "restart.js"),
    path.join(dir, "cmds", "owner", "restart.js"),
  );

  // Primer arranque: pide reiniciar a los 800 ms. Segundo: se queda vivo.
  // Así el banco no entra en un bucle de reinicios.
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `import fs from "node:fs";
     const marca = ${JSON.stringify(path.join(dir, "arranques.txt"))};
     const previos = fs.existsSync(marca) ? fs.readFileSync(marca, "utf8").trim().split("\\n").filter(Boolean) : [];
     fs.appendFileSync(marca, process.pid + "\\n");
     if (previos.length === 0) setTimeout(() => process.send && process.send("restart"), 800);
     setInterval(() => {}, 1000);
    `,
  );

  fs.writeFileSync(
    path.join(dir, "dispara.mjs"),
    `import restart from "./cmds/owner/restart.js";
     const msg = { chat: "123@s.whatsapp.net" };
     const sock = { reply: async (_jid, texto) => { console.log("RESPUESTA:" + texto); } };
     await restart.run({ msg, sock });
     console.log("el disparador se va");
    `,
  );

  fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}\n');
  return dir;
}

const arranques = (dir) => {
  const f = path.join(dir, "arranques.txt");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean);
};

/** Mata lo que haya quedado vivo de un banco de pruebas. */
function limpiar(dir) {
  spawnSync("pkill", ["-f", dir], { encoding: "utf8" });
}

test("sin supervisor, .restart deja el vigía arrancado y el bot vuelve solo", () => {
  const dir = montar();
  try {
    const r = spawnSync(process.execPath, [path.join(dir, "dispara.mjs")], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30000,
    });
    const salida = `${r.stdout || ""}${r.stderr || ""}`;
    assert.match(salida, /RESPUESTA:「✧」 Reiniciando/, `no respondió:\n${salida}`);
    assert.equal(r.status, 0, `el disparador murió:\n${salida}`);

    // El disparador terminó: si el bot no lo hubiera hecho antes, ya está
    // muerto. A partir de aquí el que tiene que estar vivo es el vigía.
    let esperados = 0;
    for (let i = 0; i < 60 && esperados < 2; i++) {
      spawnSync(process.execPath, ["-e", "setTimeout(()=>{},200)"], { timeout: 5000 });
      esperados = arranques(dir).length;
    }

    const vivos = arranques(dir);
    assert.ok(vivos.length >= 2, `el bot no volvió a arrancar solo (arranques: ${vivos.length})`);
    assert.notEqual(vivos[0], vivos[1], "tiene que ser un proceso nuevo, no el mismo");
  } finally {
    limpiar(dir);
  }
});

test("si falta el vigía, avisa y NO se mata: mejor seguir vivo", () => {
  const dir = montar({ conVigia: false });
  try {
    const r = spawnSync(process.execPath, [path.join(dir, "dispara.mjs")], {
      cwd: dir,
      encoding: "utf8",
      timeout: 20000,
    });
    const salida = `${r.stdout || ""}${r.stderr || ""}`;
    assert.match(salida, /No puedo reiniciarme/);
    assert.match(salida, /install\.sh --update/, "tiene que decir cómo arreglarlo");
    // Pasado el margen del reinicio (3 s) no debe haber ningún arranque nuevo.
    assert.equal(arranques(dir).length, 0, "no debió arrancar nada");
  } finally {
    limpiar(dir);
  }
});

test("decidirReinicio cubre los tres caminos", async () => {
  const { decidirReinicio } = await import(path.join(RAIZ, "cmds", "owner", "restart.js"));
  assert.equal(decidirReinicio({ haySupervisor: true, hayVigia: true }), "ipc");
  assert.equal(decidirReinicio({ haySupervisor: false, hayVigia: true }), "relevo");
  assert.equal(decidirReinicio({ haySupervisor: false, hayVigia: false }), "sin-salida");
});
