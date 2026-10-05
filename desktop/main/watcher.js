"use strict";

const { spawnSync } = require("child_process");

const SELF_APPS = new Set(["sentinel", "electron"]);
const BROWSERS = {
  "google chrome": "chrome",
  chrome: "chrome",
  safari: "safari",
  arc: "arc",
  "brave browser": "brave",
  brave: "brave",
  "microsoft edge": "edge",
  firefox: "firefox",
  orion: "orion",
  dia: "dia",
  vivaldi: "vivaldi",
  chromium: "chrome"
};
const TITLE_DOMAINS = {
  "khan academy": "khanacademy.org",
  wikipedia: "wikipedia.org",
  github: "github.com",
  youtube: "youtube.com",
  reddit: "reddit.com",
  twitter: "twitter.com",
  instagram: "instagram.com",
  tiktok: "tiktok.com",
  netflix: "netflix.com",
  twitch: "twitch.tv",
  facebook: "facebook.com",
  stackoverflow: "stackoverflow.com",
  leetcode: "leetcode.com",
  "docs.google": "docs.google.com",
  gmail: "mail.google.com",
  discord: "discord.com"
};

function osa(script) {
  const result = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 1200
  });
  if (result.status !== 0) {
    return "";
  }
  return String(result.stdout || "").trim();
}

function frontmostApp() {
  return osa('tell application "System Events" to get name of first application process whose frontmost is true');
}

function frontmostTitle() {
  return osa(`tell application "System Events"
    tell (first application process whose frontmost is true)
      if (count of windows) > 0 then
        return name of window 1
      end if
    end tell
  end tell`);
}

function browserUrl(kind) {
  const chromeFamily = {
    chrome: "Google Chrome",
    brave: "Brave Browser",
    edge: "Microsoft Edge",
    vivaldi: "Vivaldi"
  };
  if (chromeFamily[kind]) {
    return osa(`tell application "${chromeFamily[kind]}"
      if (count of windows) > 0 then return URL of active tab of front window
    end tell`);
  }
  if (kind === "safari" || kind === "orion") {
    const appName = kind === "safari" ? "Safari" : "Orion";
    return osa(`tell application "${appName}"
      if (count of windows) > 0 then return URL of current tab of front window
    end tell`);
  }
  if (kind === "arc") {
    return osa(`tell application "Arc"
      if (count of windows) > 0 then return URL of active tab of front window
    end tell`);
  }
  return "";
}

function hostnameFromUrl(url) {
  if (!url || url.indexOf("http") !== 0) {
    return "";
  }
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function domainFromTitle(title) {
  const lower = String(title || "").toLowerCase();
  const names = Object.keys(TITLE_DOMAINS);
  for (let i = 0; i < names.length; i += 1) {
    if (lower.indexOf(names[i]) !== -1) {
      return TITLE_DOMAINS[names[i]];
    }
  }
  return "";
}

function currentActivity() {
  const app = frontmostApp();
  if (!app) {
    return null;
  }
  const lower = app.toLowerCase();
  if (SELF_APPS.has(lower) || lower.indexOf("electron") !== -1) {
    return { app, title: "", url: "", domain: "", ignored: true };
  }
  const title = frontmostTitle();
  const kind = BROWSERS[lower];
  const url = kind ? browserUrl(kind) : "";
  return {
    app,
    title,
    url,
    domain: hostnameFromUrl(url) || domainFromTitle(title),
    ignored: false
  };
}

module.exports = { currentActivity, hostnameFromUrl };
