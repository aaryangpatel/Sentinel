"use strict";

const { currentActivity } = require("./watcher");
const classify = require("./classify");

const POLL_MS = 2000;

class Engine {
  constructor(hooks, store) {
    this.hooks = hooks;
    this.store = store;
    this.timer = null;
    this.userId = null;
    this.userSettings = { provider: "groq", graceSeconds: 45, companionApps: ["Spotify", "Music", "Notes"], companionSites: [] };
    this.task = null;
    this.focus = false;
    this.busy = false;
    this.gateOpen = false;
    this.breakActive = false;
    this.offSince = null;
    this.lastFingerprint = "";
    this.lastClass = "";
    this.lastReason = "";
    this.lastActivity = null;
    this.segmentStart = 0;
    this.segmentMeta = null;
    this.toastShownFor = "";
    this.justifications = {};
    this.gatedFingerprint = "";
    this.priorOffTask = false;
  }

  setUser(userId, settings) {
    this.userId = userId;
    if (settings) {
      this.userSettings = settings;
    }
  }

  settings() {
    return this.userSettings || { provider: "groq", graceSeconds: 45, companionApps: ["Spotify", "Music", "Notes"], companionSites: [] };
  }

  memoryKey(activity) {
    return (activity.app + "|" + (activity.domain || activity.app)).toLowerCase();
  }

  fingerprint(activity) {
    return `${activity.app}|${activity.domain}|${activity.pageKey || activity.title || ""}`;
  }

  async startFocus(goal) {
    const nextGoal = String(goal || "").trim();
    // Fresh session: drop prior justifications so old goals cannot leak into this one.
    this.justifications = {};
    const task = await this.store.createTask(this.userId, nextGoal);
    this.task = task;
    this.focus = true;
    this.gateOpen = false;
    this.breakActive = false;
    this.offSince = null;
    this.lastFingerprint = "";
    this.lastClass = "";
    this.lastReason = "";
    this.lastActivity = null;
    this.toastShownFor = "";
    this.gatedFingerprint = "";
    this.priorOffTask = false;
    this.segmentMeta = null;
    await this.flushSegment();
    this.emit();
    return task;
  }

  async stopFocus() {
    await this.flushSegment();
    this.focus = false;
    this.gateOpen = false;
    this.breakActive = false;
    this.offSince = null;
    this.segmentMeta = null;
    this.justifications = {};
    this.lastFingerprint = "";
    this.lastClass = "";
    this.lastReason = "";
    this.lastActivity = null;
    this.toastShownFor = "";
    this.gatedFingerprint = "";
    this.hooks.onHide();
    this.emit();
  }

  startLoop() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
  }

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flushSegment() {
    if (!this.segmentMeta || !this.userId) {
      this.segmentStart = Date.now();
      return;
    }
    const durationMs = Date.now() - this.segmentStart;
    if (durationMs < 400) {
      this.segmentStart = Date.now();
      return;
    }
    const event = Object.assign({ durationMs, ts: this.segmentStart }, this.segmentMeta);
    this.segmentStart = Date.now();
    await this.store.appendEvent(event);
  }

  emit() {
    this.hooks.onStatus(this.status());
  }

  graceSeconds() {
    const base = Math.max(5, Number(this.settings().graceSeconds) || 45);
    return this.priorOffTask ? Math.min(base, 15) : base;
  }

  status() {
    let graceRemaining = null;
    if (this.focus && this.lastClass === "off-task" && this.offSince) {
      graceRemaining = Math.max(0, Math.round(this.graceSeconds() - (Date.now() - this.offSince) / 1000));
    }
    return {
      focus: this.focus,
      goal: this.task ? this.task.goal : "",
      taskId: this.task ? this.task.id : null,
      lastClass: this.lastClass,
      lastReason: this.lastReason,
      graceRemaining,
      activity: this.lastActivity,
      gateOpen: this.gateOpen
    };
  }

  async pauseForSelf(activity) {
    if (this.gateOpen || this.breakActive) {
      return;
    }
    const wasOther = this.lastActivity && !this.lastActivity.ignored;
    if (wasOther || this.lastClass || this.lastReason) {
      await this.flushSegment();
      this.segmentMeta = null;
      this.lastFingerprint = "";
      this.lastClass = "";
      this.lastReason = "";
      this.offSince = null;
      this.toastShownFor = "";
    }
    this.lastActivity = activity;
  }

  async tick() {
    const activity = await currentActivity();
    if (!activity) {
      this.emit();
      return;
    }
    if (activity.ignored) {
      await this.pauseForSelf(activity);
      this.emit();
      return;
    }
    this.lastActivity = activity;
    this.emit();
    if (!this.focus || this.busy || !this.task) {
      return;
    }

    const fp = this.fingerprint(activity);
    if (this.breakActive) {
      return;
    }
    if (this.gateOpen) {
      if (this.gatedFingerprint && fp !== this.gatedFingerprint) {
        this.gateOpen = false;
        this.gatedFingerprint = "";
        this.offSince = null;
        this.hooks.onHide();
      } else {
        return;
      }
    }

    if (fp === this.lastFingerprint && this.lastClass === "off-task") {
      await this.maybeGate(activity);
      return;
    }
    if (fp === this.lastFingerprint) {
      return;
    }

    this.busy = true;
    try {
      const settings = this.settings();
      const memory = this.justifications[this.memoryKey(activity)];
      const result = await classify.classifyActivity(settings, this.task.goal, activity, memory);
      await this.flushSegment();
      this.segmentMeta = {
        userId: this.userId,
        taskId: this.task.id,
        app: activity.app,
        domain: activity.domain || "",
        title: activity.title || "",
        classification: result.classification,
        reason: result.reason
      };
      this.lastFingerprint = fp;
      this.lastClass = result.classification;
      this.lastReason = result.reason;
      if (result.classification === "off-task") {
        this.offSince = Date.now();
        if (this.toastShownFor !== fp) {
          this.toastShownFor = fp;
          this.hooks.onToast({
            app: activity.app,
            domain: activity.domain,
            title: activity.title,
            reason: result.reason
          });
        }
      } else {
        this.offSince = null;
        this.toastShownFor = "";
        if (result.classification === "on-task") {
          this.priorOffTask = false;
        }
      }
      this.emit();
      if (result.classification === "off-task") {
        await this.maybeGate(activity);
      }
    } finally {
      this.busy = false;
    }
  }

  async maybeGate(activity) {
    if (!this.offSince) {
      return;
    }
    if ((Date.now() - this.offSince) / 1000 < this.graceSeconds()) {
      return;
    }
    const tab = activity.title || activity.domain || activity.app || "this window";
    const goal = this.task.goal || "your goal";
    const question = `Does “${tab}” match your goal “${goal}”?`;
    this.gateOpen = true;
    this.breakActive = false;
    this.gatedFingerprint = this.fingerprint(activity);
    this.hooks.onGate({
      goal: this.task.goal,
      reason: this.lastReason,
      question,
      app: activity.app,
      domain: activity.domain,
      title: activity.title
    });
  }

  async submitAnswer(answer) {
    if (!this.task || !this.lastActivity) {
      return;
    }
    const judged = await classify.judgeAnswer(this.settings(), this.task.goal, this.lastActivity, answer);
    if (!judged.ok) {
      return judged;
    }
    await this.store.appendEvent({
      userId: this.userId,
      taskId: this.task.id,
      ts: Date.now(),
      durationMs: 0,
      app: this.lastActivity.app,
      domain: this.lastActivity.domain || "",
      title: this.lastActivity.title || "",
      classification: judged.verdict,
      reason: judged.reason
    });
    if (judged.verdict === "justified") {
      this.justifications[this.memoryKey(this.lastActivity)] = {
        answer: String(answer || "").trim(),
        title: this.lastActivity.title || "",
        pageKey: this.lastActivity.pageKey || "",
        domain: this.lastActivity.domain || ""
      };
      this.gateOpen = false;
      this.breakActive = false;
      this.gatedFingerprint = "";
      this.offSince = null;
      this.priorOffTask = false;
      this.lastClass = "on-task";
      this.lastReason = judged.reason;
      this.hooks.onHide();
      this.emit();
      return judged;
    }
    this.priorOffTask = true;
    this.breakActive = true;
    this.hooks.onBreak({
      seconds: 18,
      goal: this.task.goal,
      reason: judged.reason || "That answer did not clearly tie this window to your goal."
    });
    return judged;
  }

  finishBreak() {
    this.breakActive = false;
    this.gateOpen = false;
    this.gatedFingerprint = "";
    this.offSince = null;
    this.lastFingerprint = "";
    this.priorOffTask = true;
    this.emit();
  }
}

module.exports = { Engine };
