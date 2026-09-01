import express from "express";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: global.botname || "Shin-MD",
    connected: !!(global.sock && global.sock.user),
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

app.get("/health", (req, res) => res.status(200).send("OK"));
app.get("/favicon.ico", (req, res) => res.status(204).end());

export function startServer() {
  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log("[  ] Servidor HTTP en 0.0.0.0:" + PORT);
    });
  } catch (e) {
    console.log("[ ! ] No se pudo iniciar servidor HTTP: " + (e.message || e));
  }
}