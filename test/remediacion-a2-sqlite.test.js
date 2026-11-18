/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { importJsonFallbackToDatabase as migrate } from "../src/storage/sqlite-compat.js";

function crearDbReal(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-sqlite-real-"));
  const dbPath = path.join(dir, "auth.db");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE creds (id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
  db.exec("CREATE TABLE signal_keys (category TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (category, id))");
  t.after(() => {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, dbPath, db };
}

test("migración sobre SQLite real: commit, verificación, idempotencia y traslado de carpeta", (t) => {
  const { dir, dbPath, db } = crearDbReal(t);
  const jsonFile = path.join(dir, "auth.db.json");
  const payload = JSON.stringify({
    creds: { 1: { id: 1, data: "synthetic" } },
    signal_keys: { x: { category: "a", id: "b", data: "{}" } },
  });
  fs.writeFileSync(jsonFile, payload);

  assert.equal(migrate(db, jsonFile), 2);
  assert.equal(db.prepare("SELECT data FROM creds WHERE id = ?").get(1).data, "synthetic");
  assert.equal(migrate(db, jsonFile), 0);
  assert.equal(fs.readFileSync(jsonFile, "utf8"), payload);

  // Mover el directorio completo a otra ruta conserva la idempotencia
  db.close();
  const dirMovido = fs.mkdtempSync(path.join(os.tmpdir(), "shin-sqlite-movido-"));
  t.after(() => fs.rmSync(dirMovido, { recursive: true, force: true }));
  const dbMovido = path.join(dirMovido, "auth.db");
  const jsonMovido = path.join(dirMovido, "auth.db.json");
  fs.copyFileSync(dbPath, dbMovido);
  fs.copyFileSync(jsonFile, jsonMovido);

  const reabierta = new DatabaseSync(dbMovido);
  t.after(() => { try { reabierta.close(); } catch {} });
  assert.equal(migrate(reabierta, jsonMovido), 0);
});

test("error SQLite real tras primera fila revierte transacción y conserva el respaldo original", (t) => {
  const { dir, db } = crearDbReal(t);
  const jsonFile = path.join(dir, "auth.db.json");
  const invalido = JSON.stringify({
    creds: { 1: { id: 1, data: "synthetic" } },
    signal_keys: { x: { category: "a", id: "b", data: null } },
  });
  fs.writeFileSync(jsonFile, invalido);

  assert.throws(() => migrate(db, jsonFile), /cancelada/);
  assert.equal(db.prepare("SELECT data FROM creds WHERE id = ?").get(1), undefined);
  assert.equal(fs.readFileSync(jsonFile, "utf8"), invalido);

  fs.writeFileSync(
    jsonFile,
    JSON.stringify({
      creds: { 1: { id: 1, data: "synthetic" } },
      signal_keys: { x: { category: "a", id: "b", data: "ok" } },
    }),
  );
  assert.equal(migrate(db, jsonFile), 2);
});

test("cambio posterior del respaldo JSON ya importado exige revisión manual sin tocar SQLite", (t) => {
  const { dir, db } = crearDbReal(t);
  const jsonFile = path.join(dir, "auth.db.json");
  fs.writeFileSync(jsonFile, JSON.stringify({ creds: { 1: { id: 1, data: "original" } } }));
  assert.equal(migrate(db, jsonFile), 1);

  fs.writeFileSync(jsonFile, JSON.stringify({ creds: { 1: { id: 1, data: "alterado" } } }));
  assert.throws(() => migrate(db, jsonFile), /revisión/);
  assert.equal(db.prepare("SELECT data FROM creds WHERE id = ?").get(1).data, "original");
});
