"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sentinel", {
  register: (username, password) => ipcRenderer.invoke("auth:register", username, password),
  login: (username, password) => ipcRenderer.invoke("auth:login", username, password),
  me: () => ipcRenderer.invoke("auth:me"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  startFocus: (goal) => ipcRenderer.invoke("focus:start", goal),
  stopFocus: () => ipcRenderer.invoke("focus:stop"),
  status: () => ipcRenderer.invoke("focus:status"),
  submitAnswer: (answer) => ipcRenderer.invoke("gate:answer", answer),
  finishBreak: () => ipcRenderer.invoke("gate:break-done"),
  analytics: (day, taskId) => ipcRenderer.invoke("analytics:get", day, taskId),
  tasks: () => ipcRenderer.invoke("tasks:list"),
  onStatus: (fn) => {
    ipcRenderer.on("status", (_event, payload) => fn(payload));
  },
  onToast: (fn) => {
    ipcRenderer.on("toast", (_event, payload) => fn(payload));
  },
  onGate: (fn) => {
    ipcRenderer.on("gate", (_event, payload) => fn(payload));
  },
  onBreak: (fn) => {
    ipcRenderer.on("break", (_event, seconds) => fn(seconds));
  },
  onHideGate: (fn) => {
    ipcRenderer.on("hide-gate", () => fn());
  }
});
