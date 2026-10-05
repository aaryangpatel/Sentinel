"use strict";

const { currentActivity } = require("./watcher");
const classify = require("./classify");

const COOLDOWN_MS = 10 * 60 * 1000;
const POLL_MS = 2000;

class Engine {
  constructor(hooks, store) {
    this.hooks = hooks;
    this.store = store;
    this.timer = null;
    this.userId = null;
    this.userSettings = { provider: "groq", graceSeconds: 45 };
    this.task = null;
    this.focus = false;
    this.busy = false;
    this.gateOpen = false;
    this.offSince = null;
    this.lastFingerprint = "";
    this.lastClass = "";
    this.lastReason = "";
    this.lastActivity = null;
    this.segmentStart = 0;
    this.segmentMeta = null;
    this.cooldowns = {};
    this.toastShownFor = "";
  }

  setUser(userId, settings) {
    this.userId = userId;
    if (settings) {
      this.userSettings = settings;
    }
  }

  settings() {
    return this.userSettings || { provider: "groq", graceSeconds: 45 };
  }

  async startFocus(goal) {
    const task = await this.store.createTask(this.userId, goal);
    this.task = task;
    this.focus = true;
    this.gateOpen = false;
    this.offSince = null;
    this.lastFingerprint = "";
    this.lastClass = "";
    this.toastShownFor = "";
    await this.flushSegment();
    this.emit();
    return task;
  }

  async stopFocus() {
    await this.flushSegment();
    this.focus = false;
    this.gateOpen = false;
    this.offSince = null;
    this.segmentMeta = null;
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

  fingerprint(activity) {
    return `${activity.app}|${activity.domain}|${activity.title}`;
  }

  cooldownKey(activity) {
    return activity.app + "|" + activity.domain;
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

  status() {
    const settings = this.settings();
    let graceRemaining = null;
    if (this.focus && this.lastClass === "off-task" && this.offSince) {
      graceRemaining = Math.max(0, Math.round((settings.graceSeconds || 45) - (Date.now() - this.offSince) / 1000));
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

  async tick() {
    const activity = currentActivity();
    if (activity && !activity.ignored) {
      this.lastActivity = activity;
    }
    this.emit();
    if (!this.focus || this.busy || this.gateOpen || !this.task) {
      return;
    }
    if (!activity || activity.ignored) {
      return;
    }

    const fp = this.fingerprint(activity);
    const now = Date.now();
    const key = this.cooldownKey(activity);
    if (this.cooldowns[key] && this.cooldowns[key] > now && fp === this.lastFingerprint) {
      return;
    }
    if (this.cooldowns[key] && this.cooldowns[key] <= now) {
      delete this.cooldowns[key];
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
      const result = await classify.classifyActivity(settings, this.task.goal, activity);
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
        this.offSince = this.offSince || Date.now();
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
    const settings = this.settings();
    const key = this.cooldownKey(activity);
    if (this.cooldowns[key] && this.cooldowns[key] > Date.now()) {
      return;
    }
    if (!this.offSince) {
      return;
    }
    if ((Date.now() - this.offSince) / 1000 < (settings.graceSeconds || 45)) {
      return;
    }
    const question = await classify.generateQuestion(settings, this.task.goal, activity, this.lastReason);
    this.gateOpen = true;
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
    const settings = this.settings();
    const judged = await classify.judgeAnswer(settings, this.task.goal, this.lastActivity, answer);
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
      this.cooldowns[this.cooldownKey(this.lastActivity)] = Date.now() + COOLDOWN_MS;
      this.gateOpen = false;
      this.offSince = null;
      this.lastClass = "on-task";
      this.lastReason = judged.reason;
      this.hooks.onHide();
      this.emit();
      return judged;
    }
    this.hooks.onBreak(120);
    return judged;
  }

  finishBreak() {
    this.gateOpen = false;
    this.offSince = null;
    this.lastFingerprint = "";
    this.emit();
  }
}

module.exports = { Engine };
