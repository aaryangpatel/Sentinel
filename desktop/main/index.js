"use strict";

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const firebase = require("./firebase");
const { Engine } = require("./engine");

let mainWindow;
let overlayWindow;
let currentUser = null;
let engine;
let quitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#121418",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isHttpUrl(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay().workArea;
  overlayWindow = new BrowserWindow({
    width: 420,
    height: 88,
    x: display.x + display.width - 440,
    y: display.y + 16,
    frame: false,
    transparent: true,
    // Fully clear — otherwise macOS fills the transparent area with black.
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setBackgroundColor("#00000000");
  overlayWindow.loadFile(path.join(__dirname, "..", "renderer", "overlay.html"));
}

function sendOverlay(channel, payload) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, payload);
  }
}

function showToastOverlay(height) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }
  const display = screen.getPrimaryDisplay().workArea;
  const width = 420;
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setSize(width, height);
  overlayWindow.setPosition(display.x + display.width - width - 20, display.y + 16);
  overlayWindow.showInactive();
}

function showGateOverlay(height) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }
  const display = screen.getPrimaryDisplay().workArea;
  const width = 440;
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setSize(width, height);
  overlayWindow.setPosition(
    display.x + Math.round((display.width - width) / 2),
    display.y + Math.round((display.height - height) / 3)
  );
  overlayWindow.showInactive();
}

function showReset() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }
  const display = screen.getPrimaryDisplay().workArea;
  const width = 380;
  const height = 400;
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setSize(width, height);
  overlayWindow.setPosition(
    display.x + Math.round((display.width - width) / 2),
    display.y + Math.round((display.height - height) / 2)
  );
  overlayWindow.show();
  overlayWindow.focus();
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

function attachUser(user) {
  currentUser = user;
  engine.setUser(user.id, user.settings);
}

app.whenReady().then(async () => {
  engine = new Engine({
    onStatus: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("status", payload);
      }
    },
    onToast: (payload) => {
      if (engine && engine.breakActive) {
        return;
      }
      sendOverlay("toast", payload);
      showToastOverlay(120);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("toast", payload);
      }
      setTimeout(() => {
        if (engine && !engine.gateOpen && !engine.breakActive) {
          hideOverlay();
        }
      }, 6500);
    },
    onGate: (payload) => {
      sendOverlay("gate", payload);
      showGateOverlay(300);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("gate", payload);
      }
    },
    onBreak: (payload) => {
      sendOverlay("break", payload);
      showReset();
    },
    onHide: () => {
      if (engine && engine.breakActive) {
        return;
      }
      hideOverlay();
      sendOverlay("hide-gate");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("hide-gate");
      }
    }
  }, firebase);
  createMainWindow();
  createOverlayWindow();
  const restored = await firebase.restoreUser();
  if (restored) {
    attachUser(restored);
  }
  engine.startLoop();
});

app.on("before-quit", (event) => {
  if (quitting) {
    return;
  }
  event.preventDefault();
  quitting = true;
  const finish = engine
    ? engine.flushSegment().then(() => engine.stopLoop())
    : Promise.resolve();
  finish.finally(() => app.exit(0));
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.handle("auth:register", async (_event, email, password, extras) => {
  const result = await firebase.register(email, password, extras || {});
  if (result.ok) {
    attachUser(result.user);
  }
  return result;
});

ipcMain.handle("auth:login", async (_event, email, password) => {
  const result = await firebase.login(email, password);
  if (result.ok) {
    attachUser(result.user);
  }
  return result;
});

ipcMain.handle("auth:me", () => currentUser);

ipcMain.handle("auth:logout", async () => {
  await engine.stopFocus();
  hideOverlay();
  await firebase.logout();
  currentUser = null;
  engine.setUser(null);
  return { ok: true };
});

ipcMain.handle("settings:save", async (_event, settings) => {
  if (!currentUser) {
    return { ok: false };
  }
  const user = await firebase.saveSettings(currentUser.id, settings);
  attachUser(user);
  return { ok: true, user };
});

ipcMain.handle("focus:start", async (_event, goal) => {
  if (!currentUser) {
    return { ok: false, error: "Not signed in." };
  }
  const task = await engine.startFocus(goal);
  await firebase.setPresence(currentUser.id, currentUser.email, {
    focus: true,
    goal: task.goal
  });
  return { ok: true, task };
});

ipcMain.handle("focus:stop", async () => {
  await engine.stopFocus();
  hideOverlay();
  if (currentUser) {
    await firebase.setPresence(currentUser.id, currentUser.email, { focus: false, goal: "" });
    await firebase.publishWeekly(currentUser.id, currentUser.email);
  }
  return { ok: true };
});

ipcMain.handle("focus:status", () => engine.status());
ipcMain.handle("gate:answer", (_event, answer) => engine.submitAnswer(answer));
ipcMain.handle("gate:break-done", () => {
  engine.finishBreak();
  hideOverlay();
  return { ok: true };
});
ipcMain.handle("analytics:get", async (_event, day, taskId) => {
  if (!currentUser) {
    return null;
  }
  return firebase.analytics(currentUser.id, day || firebase.localDayKey(), taskId || null);
});
ipcMain.handle("tasks:list", async () => {
  if (!currentUser) {
    return [];
  }
  return firebase.listTasks(currentUser.id);
});

ipcMain.handle("tasks:delete", async (_event, taskId) => {
  if (!currentUser) {
    return { ok: false, error: "Not signed in." };
  }
  try {
    return await firebase.deleteTask(currentUser.id, taskId);
  } catch (err) {
    return { ok: false, error: (err && err.message) || "Could not delete that task." };
  }
});
ipcMain.handle("circles:create", async (_event, name) => {
  if (!currentUser) {
    return { ok: false, error: "Not signed in." };
  }
  return firebase.createCircle(currentUser.id, currentUser.email, name);
});
ipcMain.handle("circles:join", async (_event, code) => {
  if (!currentUser) {
    return { ok: false, error: "Not signed in." };
  }
  return firebase.joinCircle(currentUser.id, currentUser.email, code);
});
ipcMain.handle("circles:delete", async (_event, circleId) => {
  if (!currentUser) {
    return { ok: false, error: "Not signed in." };
  }
  return firebase.deleteCircle(currentUser.id, circleId);
});
ipcMain.handle("circles:list", async () => {
  if (!currentUser) {
    return [];
  }
  await firebase.publishWeekly(currentUser.id, currentUser.email);
  return firebase.listCircles(currentUser.id);
});

/**
 * Public site origin for in-app “how to get a Groq key” links.
 * Edit desktop/web-origin.json after you know the Vercel URL.
 */
function webOrigin() {
  const file = path.join(__dirname, "..", "web-origin.json");
  if (!fs.existsSync(file)) {
    return "https://sentinel-nine-gold-88.vercel.app";
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const origin = data && data.origin ? String(data.origin).replace(/\/$/, "") : "";
  return origin || "https://sentinel-nine-gold-88.vercel.app";
}

function groqGuideUrl() {
  return "https://sentinel-nine-gold-88.vercel.app/groq";
}

function isHttpUrl(url) {
  return String(url || "").indexOf("https://") === 0 || String(url || "").indexOf("http://") === 0;
}

ipcMain.handle("site:guide", () => groqGuideUrl());
ipcMain.handle("open:url", (_event, url) => {
  if (!isHttpUrl(url)) {
    return { ok: false };
  }
  shell.openExternal(url);
  return { ok: true };
});
