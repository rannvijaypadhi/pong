// --- Render‑Optimized Pong WebSocket Server ---
// Clean, stable, room-based multiplayer server

const http = require("http");
const WebSocket = require("ws");

// Render assigns PORT dynamically:
const PORT = process.env.PORT || 10000;

// Create HTTP server (Render requires this for WebSockets)
const server = http.createServer();

// Attach WebSocket server to HTTP server
const wss = new WebSocket.Server({ server });

// Store rooms: roomCode -> { players: [ws, ws] }
const rooms = new Map();

// Safe send helper
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

wss.on("connection", ws => {
  ws.roomCode = null;
  ws.playerIndex = null;

  ws.on("message", raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // --- CREATE ROOM ---
    if (data.type === "create") {
      const code = data.code;

      if (rooms.has(code)) {
        return send(ws, { type: "error", message: "Room already exists" });
      }

      rooms.set(code, { players: [ws] });
      ws.roomCode = code;
      ws.playerIndex = 0;

      send(ws, { type: "joined", code, playerIndex: 0 });
      return;
    }

    // --- JOIN ROOM ---
    if (data.type === "join") {
      const code = data.code;
      const room = rooms.get(code);

      if (!room) {
        return send(ws, { type: "error", message: "Room not found" });
      }

      if (room.players.length >= 2) {
        return send(ws, { type: "error", message: "Room full" });
      }

      room.players.push(ws);
      ws.roomCode = code;
      ws.playerIndex = 1;

      send(ws, { type: "joined", code, playerIndex: 1 });

      // Notify both players
      room.players.forEach((p, idx) =>
        send(p, { type: "ready", playerIndex: idx })
      );

      return;
    }

    // --- RELAY GAME STATE ---
    if (data.type === "state" && ws.roomCode) {
      const room = rooms.get(ws.roomCode);
      if (!room) return;

      room.players.forEach(p => {
        if (p !== ws) send(p, data);
      });
    }
  });

  // --- HANDLE DISCONNECT ---
  ws.on("close", () => {
    const code = ws.roomCode;
    if (!code) return;

    const room = rooms.get(code);
    if (!room) return;

    room.players = room.players.filter(p => p !== ws);

    // Notify remaining player
    room.players.forEach(p =>
      send(p, { type: "error", message: "Opponent disconnected" })
    );

    // Delete empty room
    if (room.players.length === 0) {
      rooms.delete(code);
    }
  });
});

// IMPORTANT: Bind to 0.0.0.0 for Render
server.listen(PORT, "0.0.0.0", () => {
  console.log("WebSocket server running on port " + PORT);
});
