// Tic-Tac-Toe con botones interactivos
// El tablero se pinta con botones: tocas una celda y el bot actualiza el juego.
// Cómo funciona: el botón manda "ttt a1" → el router lo reinyecta como comando.

import { sendInteractive, quickReply } from "#interactive";

const games = new Map(); // chatId -> estado de partida
const TIMEOUT_MS = 120000;

const EMOJI = { X: "❌", O: "⭕", "": "⬜" };
const COLS = ["1", "2", "3"];
const ROWS = ["a", "b", "c"];

function emptyBoard() {
  return [["", "", ""], ["", "", ""], ["", "", ""]];
}

function checkWin(b, p) {
  const lines = [
    [b[0][0], b[0][1], b[0][2]], [b[1][0], b[1][1], b[1][2]], [b[2][0], b[2][1], b[2][2]],
    [b[0][0], b[1][0], b[2][0]], [b[0][1], b[1][1], b[2][1]], [b[0][2], b[1][2], b[2][2]],
    [b[0][0], b[1][1], b[2][2]], [b[0][2], b[1][1], b[2][0]],
  ];
  return lines.some(l => l.every(c => c === p));
}

function isFull(b) { return b.flat().every(c => c !== ""); }

function boardButtons(b) {
  const buttons = [];
  for (const row of ROWS) {
    for (const col of COLS) {
      const r = ROWS.indexOf(row);
      const c = COLS.indexOf(col);
      const val = b[r][c];
      const label = val ? EMOJI[val] : (row.toUpperCase() + col);
      buttons.push(quickReply(label, "ttt " + row + col));
    }
  }
  return buttons;
}

export default {
  name: "ttt",
  aliases: ["tresenraya", "tateti"],
  category: "games",
  description: "Juega tres en raya con botones 🎮",
  usage: ".ttt",
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine, commands) {
    const chatId = ctx.chatId;
    const sender = ctx.senderId;

    // Cancelar
    if (ctx.arg && ctx.arg.toLowerCase() === "cancelar") {
      if (games.delete(chatId)) return "❌ Partida cancelada.";
      return "No hay partida activa.";
    }

    let game = games.get(chatId);

    // Iniciar
    if (!game) {
      if (ctx.arg) {
        // Intento de mover sin partida
        return "No hay partida activa. Escribe *" + (ctx.text.startsWith(".") ? "." : "") + "ttt* para jugar solo contra el bot.";
      }
      game = {
        board: emptyBoard(),
        turn: "X",
        players: { X: sender, O: "bot" },
        start: Date.now(),
        lastMsg: null,
      };
      games.set(chatId, game);
      // Auto-limpieza por inactividad (unref: no bloquea salida del proceso)
      const t = setTimeout(() => { if (games.get(chatId) === game) games.delete(chatId); }, TIMEOUT_MS);
      if (t.unref) t.unref();
    }

    // Es un movimiento (arg = a1, b2...)
    if (ctx.arg) {
      const m = /^([abc])([123])$/i.exec(ctx.arg.trim());
      if (!m) return "❌ Movimiento inválido. Usa una celda como `a1`, `b2`, `c3`.";

      const row = ROWS.indexOf(m[1].toLowerCase());
      const col = COLS.indexOf(m[2]);

      // Turno del jugador
      if (game.turn !== "X") return "Es turno del bot, espera...";

      if (game.board[row][col] !== "") return "❌ Ese lugar ya está ocupado.";

      game.board[row][col] = "X";

      if (checkWin(game.board, "X")) {
        games.delete(chatId);
        return "🎉 *¡GANASTE!* 🎉\n\n" + renderBoard(game.board) + "\n\n_反魂 Shin-MD_";
      }
      if (isFull(game.board)) {
        games.delete(chatId);
        return "🤝 *Empate!*\n\n" + renderBoard(game.board);
      }

      // Turno del bot (jugada simple: primera celda libre, o bloquea)
      game.turn = "O";
      botMove(game.board);
      game.turn = "X";

      if (checkWin(game.board, "O")) {
        games.delete(chatId);
        return "🤖 *El bot ganó!*\n\n" + renderBoard(game.board) + "\n\n_Intenta de nuevo con .ttt_";
      }
      if (isFull(game.board)) {
        games.delete(chatId);
        return "🤝 *Empate!*\n\n" + renderBoard(game.board);
      }
    }

    // Renderizar y enviar tablero interactivo
    const header = "🎮 *TRES EN RAYA*\n\n" +
      "Toca una celda para jugar. ¡Tú eres ❌ y el bot ⭕!\n" +
      "Turno: *" + (game.turn === "X" ? "TÚ (❌)" : "BOT (⭕)") + "*";

    try {
      await sendInteractive(sock, chatId, {
        body: header,
        footer: "反魂 Shin-MD · .ttt cancelar",
        buttons: boardButtons(game.board),
        quoted: ctx.full,
      });
      return null;
    } catch {
      return header + "\n\n" + renderBoard(game.board) +
        "\n\nEscribe `ttt a1` para jugar.";
    }
  },
};

function renderBoard(b) {
  let out = "```\n    1   2   3\n";
  for (let i = 0; i < 3; i++) {
    out += ROWS[i].toUpperCase() + "  " + b[i].map(v => EMOJI[v]).join("  ") + "\n";
  }
  return out + "```";
}

function botMove(b) {
  // 1) Ganar si puede
  // 2) Bloquear al jugador
  // 3) Centro
  // 4) Primera libre
  for (const p of ["O", "X"]) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (b[r][c] === "") {
          b[r][c] = p;
          if (checkWin(b, p)) return;
          b[r][c] = "";
        }
      }
    }
  }
  if (b[1][1] === "") { b[1][1] = "O"; return; }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (b[r][c] === "") { b[r][c] = "O"; return; }
    }
  }
}
