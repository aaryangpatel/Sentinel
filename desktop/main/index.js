"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
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
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, "..", "renderer", "overlay.html"));
}

function sendOverlay(channel, payload) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, payload);
  }
}

function showOverlay(height) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }
  const display = screen.getPrimaryDisplay().workArea;
  overlayWindow.setSize(420, height);
  overlayWindow.setPosition(display.x + display.width - 440, display.y + 16);
  overlayWindow.showInactive();
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
      sendOverlay("toast", payload);
      showOverlay(96);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("toast", payload);
      }
      setTimeout(() => {
        if (engine && !engine.gateOpen) {
          hideOverlay();
        }
      }, 6500);
    },
    onGate: (payload) => {
      sendOverlay("gate", payload);
      showOverlay(340);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("gate", payload);
      }
    },
    onBreak: (seconds) => {
      sendOverlay("break", seconds);
      showOverlay(180);
    },
    onHide: () => {
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

ipcMain.handle("auth:register", async (_event, email, password) => {
  const result = await firebase.register(email, password);
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
  return { ok: true, task };
});

ipcMain.handle("focus:stop", async () => {
  await engine.stopFocus();
  hideOverlay();
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
