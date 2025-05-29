// NOTE: In the future, support virtual file system commands like `pwd`, `ls`, `cd` and 'whoami'
// directly in frontend before sending to backend shell. This will allow simulating
// filesystem navigation and output within the editor UI.

const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");
const { exec } = require("child_process");

const app = express();
app.use(cors());

const server = app.listen(3001, () => {
  console.log("✅ Server running on http://localhost:3001");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");

  ws.on("message", (message) => {
    const command = message.toString();

    if (command === "clear") {
      // No need to handle on backend — already managed in frontend
      return;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        ws.send(stderr || error.message);
      } else {
        ws.send(stdout || "✔️ done");
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ WebSocket client disconnected");
  });
});
