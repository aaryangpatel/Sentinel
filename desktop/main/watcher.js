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
const CHROME_FAMILY = {
  chrome: "Google Chrome",
  brave: "Brave Browser",
  edge: "Microsoft Edge",
  vivaldi: "Vivaldi"
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

const pageTitleCache = new Map();

function osa(script) {
  const result = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    timeout: 1800
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

function browserTab(kind) {
  let script = "";
  if (CHROME_FAMILY[kind]) {
    script = `tell application "${CHROME_FAMILY[kind]}"
      if (count of windows) > 0 then
        set t to title of active tab of front window
        set u to URL of active tab of front window
        return t & "|||SENTINEL|||" & u
      end if
    end tell`;
  } else if (kind === "safari" || kind === "orion") {
    const appName = kind === "safari" ? "Safari" : "Orion";
    script = `tell application "${appName}"
      if (count of windows) > 0 then
        set t to name of current tab of front window
        set u to URL of current tab of front window
        return t & "|||SENTINEL|||" & u
      end if
    end tell`;
  } else if (kind === "arc") {
    script = `tell application "Arc"
      if (count of windows) > 0 then
        set t to title of active tab of front window
        set u to URL of active tab of front window
        return t & "|||SENTINEL|||" & u
      end if
    end tell`;
  }
  if (!script) {
    return { title: "", url: "" };
  }
  const raw = osa(script);
  const parts = raw.split("|||SENTINEL|||");
  if (parts.length >= 2) {
    return { title: parts[0].trim(), url: parts.slice(1).join("|||SENTINEL|||").trim() };
  }
  if (raw.indexOf("http") === 0) {
    return { title: "", url: raw };
  }
  return { title: raw, url: "" };
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

function youtubeId(url) {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return parsed.pathname.replace(/^\//, "").split("/")[0] || "";
    }
    if (host.indexOf("youtube.com") !== -1 || host === "music.youtube.com") {
      if (parsed.searchParams.get("v")) {
        return parsed.searchParams.get("v");
      }
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] || "";
      }
    }
  } catch (err) {
    return "";
  }
  return "";
}

function pageKey(url, title) {
  const video = youtubeId(url);
  if (video) {
    return "yt:" + video;
  }
  if (url && url.indexOf("http") === 0) {
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname.replace(/\/$/, "");
    } catch (err) {
      return title || url;
    }
  }
  return title || "";
}

function pathHint(url) {
  if (!url || url.indexOf("http") !== 0) {
    return "";
  }
  try {
    const parsed = new URL(url);
    return (parsed.pathname + parsed.search).slice(0, 160);
  } catch (err) {
    return "";
  }
}

function uselessTitle(title, domain) {
  const t = String(title || "").trim().toLowerCase();
  if (!t) {
    return true;
  }
  return t === "youtube" || t === domain || t === "google chrome" || t === "untitled";
}

async function lookupPageTitle(url) {
  const video = youtubeId(url);
  const cacheKey = video ? "yt:" + video : url;
  if (pageTitleCache.has(cacheKey)) {
    return pageTitleCache.get(cacheKey);
  }
  if (!video) {
    return "";
  }
  try {
    const endpoint = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + video);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) {
      pageTitleCache.set(cacheKey, "");
      return "";
    }
    const data = await response.json();
    const title = data && data.title ? String(data.title) : "";
    pageTitleCache.set(cacheKey, title);
    return title;
  } catch (err) {
    return "";
  }
}

function snapshot() {
  const app = frontmostApp();
  if (!app) {
    return null;
  }
  const lower = app.toLowerCase();
  if (SELF_APPS.has(lower) || lower.indexOf("electron") !== -1) {
    return { app, title: "", url: "", domain: "", path: "", pageKey: "", ignored: true };
  }
  const kind = BROWSERS[lower];
  const tab = kind ? browserTab(kind) : { title: "", url: "" };
  const windowTitle = frontmostTitle();
  const url = tab.url || "";
  const domain = hostnameFromUrl(url) || domainFromTitle(tab.title || windowTitle);
  const title = tab.title || windowTitle || "";
  return {
    app,
    title,
    url,
    domain,
    path: pathHint(url),
    pageKey: pageKey(url, title),
    ignored: false
  };
}

async function currentActivity() {
  const activity = snapshot();
  if (!activity || activity.ignored) {
    return activity;
  }
  if (uselessTitle(activity.title, activity.domain) && activity.url) {
    const lookedUp = await lookupPageTitle(activity.url);
    if (lookedUp) {
      activity.title = lookedUp;
      if (!activity.pageKey) {
        activity.pageKey = pageKey(activity.url, lookedUp);
      }
    }
  }
  return activity;
}

const PAUSE_JS = "document.querySelectorAll('video,audio').forEach(function(el){el.pause()})";

const MEDIA_PAUSE = {
  spotify: 'tell application "Spotify" to pause',
  music: 'tell application "Music" to pause',
  tv: 'tell application "TV" to pause',
  "quicktime player": 'tell application "QuickTime Player" to pause document 1',
  vlc: 'tell application "VLC" to pause',
  iina: 'tell application "IINA" to pause'
};

function pauseBrowserMedia(kind) {
  if (CHROME_FAMILY[kind] || kind === "arc") {
    const appName = kind === "arc" ? "Arc" : CHROME_FAMILY[kind];
    osa(`tell application "${appName}"
      if (count of windows) > 0 then
        execute javascript "${PAUSE_JS}" in active tab of front window
      end if
    end tell`);
    return;
  }
  if (kind === "safari" || kind === "orion") {
    const appName = kind === "safari" ? "Safari" : "Orion";
    osa(`tell application "${appName}"
      if (count of windows) > 0 then
        do JavaScript "${PAUSE_JS}" in current tab of front window
      end if
    end tell`);
    return;
  }
  if (kind === "firefox") {
    osa('tell application "System Events" to keystroke space');
  }
}

function hideApp(appName) {
  const safe = String(appName || "").replace(/"/g, "");
  if (!safe) {
    return;
  }
  osa(`tell application "System Events"
    if exists process "${safe}" then
      set visible of process "${safe}" to false
    end if
  end tell`);
}

function interruptActivity(activity) {
  if (!activity || activity.ignored) {
    return;
  }
  const lower = String(activity.app || "").toLowerCase();
  if (SELF_APPS.has(lower) || lower.indexOf("electron") !== -1) {
    return;
  }
  const kind = BROWSERS[lower];
  if (kind) {
    pauseBrowserMedia(kind);
  }
  if (MEDIA_PAUSE[lower]) {
    osa(MEDIA_PAUSE[lower]);
  }
  hideApp(activity.app);
}

module.exports = { currentActivity, hostnameFromUrl, pageKey, interruptActivity };
