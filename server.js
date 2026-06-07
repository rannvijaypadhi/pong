const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const rooms = new Map(); // roomCode -> { players: [ws, ws] }

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

wss.on("connection", ws => {
  ws.roomCode = null;
  ws.playerIndex = null;

  ws.on("message", msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === "create") {
      const code = data.code;
      if (rooms.has(code)) {
        return send(ws, { type: "error", message: "Room already exists" });
      }
      rooms.set(code, { players: [ws] });
      ws.roomCode = code;
      ws.playerIndex = 0;
      send(ws, { type: "joined", code, playerIndex: 0 });
    }

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
      // notify both players game can start
      room.players.forEach((p, idx) =>
        send(p, { type: "ready", playerIndex: idx })
      );
    }

    // relay game messages inside room
    if (data.type === "state" && ws.roomCode) {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      room.players.forEach(p => {
        if (p !== ws) send(p, data);
      });
    }
  });

  ws.on("close", () => {
    const code = ws.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    room.players = room.players.filter(p => p !== ws);
    room.players.forEach(p =>
      send(p, { type: "error", message: "Opponent disconnected" })
    );

    if (room.players.length === 0) {
      rooms.delete(code);
    }
  });
});

console.log("Server running on ws://localhost:8080");
