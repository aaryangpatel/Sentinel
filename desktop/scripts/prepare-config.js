const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const real = path.join(root, "firebase-config.json");
const fallback = path.join(root, "firebase-config.example.json");
const dest = path.join(root, "build", "firebase-pack.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(fs.existsSync(real) ? real : fallback, dest);
