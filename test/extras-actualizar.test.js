/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// Pruebas de extras/actualizar.js con repositorios de mentira: sin red, sin
// cuenta y sin tocar el repositorio de verdad.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  actualizar,
  revisarArbol,
  confirmacionVigente,
  marcaDe,
  VENTANA_MS,
} from "../extras/actualizar.js";

const ENTORNO = {
  ...process.env,
  GIT_AUTHOR_NAME: "prueba",
  GIT_AUTHOR_EMAIL: "prueba@ejemplo",
  GIT_COMMITTER_NAME: "prueba",
  GIT_COMMITTER_EMAIL: "prueba@ejemplo",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: ENTORNO, encoding: "utf8" }).trim();
}

function escribir(archivo, contenido) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, contenido, "utf8");
}

/** Crea un «GitHub» de mentira y un clon del bot que apunta a él. */
function montar() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "shin-actualizar-"));
  const remoto = path.join(raiz, "remoto.git");
  const bot = path.join(raiz, "bot");
  fs.mkdirSync(remoto);
  git(remoto, "init", "--bare", "--quiet");
  git(remoto, "symbolic-ref", "HEAD", "refs/heads/main");
  fs.mkdirSync(bot);
  git(bot, "init", "--quiet", "-b", "main");
  escribir(path.join(bot, "index.js"), "console.log('v1');\n");
  escribir(path.join(bot, "data", "shin.db.json"), '{"usuarios":["ana"]}\n');
  git(bot, "add", "-A");
  git(bot, "commit", "--quiet", "-m", "inicial");
  git(bot, "remote", "add", "origin", remoto);
  git(bot, "push", "--quiet", "origin", "main");
  return { raiz, remoto, bot };
}

/** Publica un commit nuevo en el remoto (como si se hubiera subido a GitHub). */
function publicarCambio(remoto, archivo, contenido) {
  const otro = fs.mkdtempSync(path.join(os.tmpdir(), "shin-otro-"));
  execFileSync("git", ["clone", "--quiet", remoto, otro], { env: ENTORNO });
  git(otro, "checkout", "--quiet", "-B", "main", "origin/main");
  escribir(path.join(otro, archivo), contenido);
  git(otro, "add", "-A");
  git(otro, "commit", "--quiet", "-m", `cambio en ${archivo}`);
  git(otro, "push", "--quiet", "origin", "main");
  fs.rmSync(otro, { recursive: true, force: true });
}

test("con el árbol limpio y nada nuevo, dice que ya estaba al día", async () => {
  const { bot } = montar();
  const r = await actualizar({ raiz: bot });
  assert.equal(r.estado, "alDia");
  assert.match(r.texto, /ya estaba al día/);
});

test("trae el commit nuevo y cambia el código de verdad", async () => {
  const { remoto, bot } = montar();
  publicarCambio(remoto, "index.js", "console.log('v2');\n");
  const r = await actualizar({ raiz: bot });
  assert.equal(r.estado, "actualizado");
  assert.match(fs.readFileSync(path.join(bot, "index.js"), "utf8"), /v2/);
});

test("con cambios sin subir guarda parche, avisa y NO toca nada", async () => {
  const { bot } = montar();
  escribir(path.join(bot, "index.js"), "console.log('mío');\n");
  const r = await actualizar({ raiz: bot, ahora: Date.UTC(2026, 10, 10, 9, 57, 22, 656) });
  assert.equal(r.estado, "espera");
  assert.match(r.texto, /Hay 1 archivo\(s\) con cambios sin subir/);
  assert.match(r.texto, /parche-2026-11-10T09-57-22-656Z\.patch/);
  assert.match(r.texto, /escribe otra vez \*\.fix\* en los próximos 5 minutos/);
  assert.equal(
    fs.readFileSync(path.join(bot, "index.js"), "utf8"),
    "console.log('mío');\n",
    "no debe tocar el archivo"
  );
  const parche = fs.readFileSync(
    path.join(bot, "tmp", "parche-2026-11-10T09-57-22-656Z.patch"),
    "utf8"
  );
  assert.match(parche, /mío/, "el parche tiene que llevar el cambio");
});

test("confirmado, se actualiza y el cambio propio se reemplaza por el de GitHub", async () => {
  const { remoto, bot } = montar();
  publicarCambio(remoto, "index.js", "console.log('v2');\n");
  escribir(path.join(bot, "index.js"), "console.log('mío');\n");
  const r = await actualizar({ raiz: bot, confirmado: true });
  assert.equal(r.estado, "actualizado");
  assert.match(fs.readFileSync(path.join(bot, "index.js"), "utf8"), /v2/);
});

test("la base de datos no cuenta como cambio y sobrevive a la actualización", async () => {
  const { remoto, bot } = montar();
  publicarCambio(remoto, "index.js", "console.log('v2');\n");
  escribir(path.join(bot, "data", "shin.db.json"), '{"usuarios":["ana","luis"]}\n');

  const arbol = await revisarArbol(bot);
  assert.deepEqual(arbol.propios, [], "la base de datos no es trabajo sin subir");
  assert.equal(arbol.datos.length, 1);

  const r = await actualizar({ raiz: bot });
  assert.equal(r.estado, "actualizado");
  assert.match(
    fs.readFileSync(path.join(bot, "data", "shin.db.json"), "utf8"),
    /luis/,
    "los usuarios no se pierden"
  );
  assert.match(fs.readFileSync(path.join(bot, "index.js"), "utf8"), /v2/);
  assert.deepEqual(r.datos, [{ archivo: "data/shin.db.json", conservado: true }]);
});

test("los archivos nuevos avisan de que no van en el parche", async () => {
  const { bot } = montar();
  escribir(path.join(bot, "notas.txt"), "algo\n");
  const r = await actualizar({ raiz: bot });
  assert.equal(r.estado, "espera");
  assert.match(r.texto, /\?\? notas\.txt/);
  assert.match(r.texto, /no se borran, pero tampoco van en el parche/);
});

test("si el remoto no responde, lo dice y no toca el código", async () => {
  const { bot } = montar();
  git(bot, "remote", "set-url", "origin", path.join(bot, "no-existe.git"));
  const r = await actualizar({ raiz: bot });
  assert.equal(r.estado, "error");
  assert.match(r.texto, /No pude actualizar/);
  assert.equal(fs.readFileSync(path.join(bot, "index.js"), "utf8"), "console.log('v1');\n");
});

test("la confirmación caduca a los 5 minutos", () => {
  const ahora = Date.UTC(2026, 10, 10, 12, 0, 0);
  assert.equal(confirmacionVigente(ahora - 60_000, { ahora }), true);
  assert.equal(confirmacionVigente(ahora - VENTANA_MS - 1, { ahora }), false);
  assert.equal(confirmacionVigente(0, { ahora }), false);
  assert.equal(marcaDe(Date.UTC(2026, 10, 10, 9, 57, 22, 656)), "2026-11-10T09-57-22-656Z");
});
