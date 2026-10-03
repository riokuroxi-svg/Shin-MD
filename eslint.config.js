/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  eslint.config.js — Reglas que atrapan bugs, no opiniones de estilo.
//  (El estilo lo decide Prettier; aquí sólo lo que puede romper el bot.)
//
//  Fase 1: las reglas de estilo son "warn" para no bloquear el CI de un
//  repo con 30k líneas ya escritas. Se suben a "error" cuando el conteo
//  llegue a cero: `npm run lint`.
// ═══════════════════════════════════════════════════════════════════
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "session/**",
      "logs/**",
      "media/**",
      "assets/**",
      "data/**",
      "**/*.min.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // ── Bugs reales: error desde el día uno ─────────────────────
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-cond-assign": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unsafe-negation": "error",
      "no-self-assign": "error",
      // Olor real, pero vive en cmds/nsfw/xvideos.js y reescribir esa
      // promesa sin poder probarla en vivo es más peligroso que dejarla
      // marcada. Warning visible > arreglo a ciegas.
      "no-async-promise-executor": "warn",
      "require-atomic-updates": "warn",

      // ── Reglas que aquí serían un FALSO POSITIVO ────────────────
      // El bot usa U+3000 (espacio ideográfico) dentro de los template
      // strings a propósito: es su lenguaje visual (bordes decorativos
      // en las tarjetas de descarga). Sin skip de strings/templates,
      // ESLint marca 51 "errores" que son diseño, no bugs — y un
      // `--fix` automático destrozaría los captions. Se permite sólo
      // fuera de código ejecutable.
      "no-irregular-whitespace": ["error", {
        skipStrings: true,
        skipTemplates: true,
        skipComments: false,
        skipRegExps: false,
      }],

      // ── Higiene: warn ahora, error cuando esté limpio ───────────
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      eqeqeq: ["warn", "smart"],
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
  {
    // Comandos: el archivo declara su propia forma (command/run), así que
    // `no-unused-vars` sobre las props de un objeto no aplica igual.
    files: ["cmds/**/*.js"],
    rules: { "no-unused-vars": "off" },
  },
];
