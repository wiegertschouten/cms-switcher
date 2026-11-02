const COMMAND_NAME = "toggle-cms";
const PENDING_NAVIGATIONS = new Map();

async function detectCMS(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const bodyClasses = document.body ? [...document.body.classList] : [];
      const html = document.documentElement ? document.documentElement.outerHTML : "";
      const generator = document.querySelector('meta[name="generator"]')?.content || "";

      const classHit = bodyClasses.some((className) =>
        /(^|-)wp(-|$)|wordpress/i.test(className)
      );
      const generatorHit = /wordpress/i.test(generator);
      const htmlHit =
        /\/wp-content\//i.test(html) ||
        /\/wp-includes\//i.test(html) ||
        /wp-embed/i.test(html);

      return {
        isWordPress: classHit || generatorHit || htmlHit,
      };
    },
  });

  return result || { isWordPress: false };
}

function getTargetPath(currentPath, isWordPress) {
  if (isWordPress) {
    return currentPath.startsWith("/wp-admin") || currentPath.startsWith("/wp-login.php")
      ? "/"
      : "/wp-admin";
  }

  return currentPath.startsWith("/cp") ? "/" : "/cp";
}

function isBackendPath(currentPath, savedPath) {
  if (!savedPath || savedPath === "/") {
    return false;
  }
  return (
    currentPath === savedPath ||
    currentPath === savedPath + "/" ||
    currentPath.startsWith(savedPath + "/") ||
    currentPath.startsWith(savedPath + "?")
  );
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const url = new URL(tab?.url || "");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    const origin = url.origin;
    const { cmsPaths } = await chrome.storage.sync.get({ cmsPaths: {} });
    const savedPath = cmsPaths[origin];

    showPathPrompt(tab.id, origin, savedPath || null);
  } catch {
    // No-op: keep the extension silent and lightweight.
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== COMMAND_NAME) {
    return;
  }

  try {
    const tab = await getActiveTab();
    const url = new URL(tab?.url || "");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    const origin = url.origin;
    const { cmsPaths } = await chrome.storage.sync.get({ cmsPaths: {} });
    const savedPath = cmsPaths[origin];

    if (savedPath) {
      const targetPath = isBackendPath(url.pathname, savedPath) ? "/" : savedPath;
      PENDING_NAVIGATIONS.set(tab.id, { origin, attemptedPath: targetPath });
      await chrome.tabs.update(tab.id, { url: origin + targetPath });
      return;
    }

    let isWordPress;
    try {
      ({ isWordPress } = await detectCMS(tab.id));
    } catch {
      isWordPress =
        url.pathname.startsWith("/wp-admin") || url.pathname.startsWith("/wp-login.php");
    }

    if (isWordPress) {
      const targetPath = getTargetPath(url.pathname, isWordPress);
      PENDING_NAVIGATIONS.set(tab.id, { origin, attemptedPath: targetPath });
      await chrome.tabs.update(tab.id, { url: origin + targetPath });
      return;
    }

    showPathPrompt(tab.id, origin, null);
  } catch {
    // No-op: keep the extension silent and lightweight.
  }
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const pending = PENDING_NAVIGATIONS.get(details.tabId);
    if (!pending) {
      return;
    }
    if (details.statusCode === 404) {
      pending.saw404 = true;
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] }
);

chrome.webRequest.onErrorOccurred.addListener((details) => {
  PENDING_NAVIGATIONS.delete(details.tabId);
}, {
  urls: ["<all_urls>"],
  types: ["main_frame"],
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  const pending = PENDING_NAVIGATIONS.get(tabId);
  if (!pending) {
    return;
  }

  let landingPath = null;
  try {
    const landing = new URL(tab.url || "");
    if (
      (landing.protocol === "http:" || landing.protocol === "https:") &&
      landing.origin === pending.origin
    ) {
      landingPath = landing.pathname;
    }
  } catch {
    // No-op: try to fall back to status-based detection below.
  }

  const failed =
    pending.saw404 || landingPath === "/404" || landingPath === "/404/";

  PENDING_NAVIGATIONS.delete(tabId);

  if (failed) {
    showPathPrompt(tabId, pending.origin, pending.attemptedPath);
  }
});

function showPathPrompt(tabId, origin, attemptedPath) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      func: (promptOrigin, promptAttemptedPath) => {
        const HOST_ID = "cms-switcher-host";
        document.getElementById(HOST_ID)?.remove();

        chrome.storage.sync.get({ cmsPaths: {} }, (res) => {
          const cmsPaths = res.cmsPaths || {};
          const savedPath = cmsPaths[promptOrigin] || "";
          const prefill = promptAttemptedPath || "";

          const host = document.createElement("div");
          host.id = HOST_ID;
          host.style.cssText =
            "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647";
          document.documentElement.appendChild(host);

          const shadow = host.attachShadow({ mode: "closed" });

          const form = document.createElement("form");
          form.style.cssText =
            "display:flex;gap:8px;align-items:center;background:#1f2430;color:#e8e8e8;padding:10px 12px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.4);font:13px/1.4 system-ui,-apple-system,sans-serif";

          const label = document.createElement("span");
          label.textContent = "CMS path";
          label.style.cssText = "white-space:nowrap;user-select:none";

          const input = document.createElement("input");
          input.type = "text";
          input.value = prefill;
          input.placeholder = "/admin";
          input.spellcheck = false;
          input.autocomplete = "off";
          input.style.cssText =
            "width:220px;padding:6px 8px;border-radius:6px;border:1px solid #4a5568;background:#12161f;color:inherit;outline:none;font:inherit";

          const button = document.createElement("button");
          button.type = "submit";
          button.textContent = "Save & go";
          button.style.cssText =
            "padding:6px 10px;border-radius:6px;border:0;background:#4f8ef7;color:#fff;font:inherit;cursor:pointer";

          form.append(label, input, button);
          shadow.append(form);

          if (savedPath) {
            const clear = document.createElement("button");
            clear.type = "button";
            clear.textContent = "Clear saved path";
            clear.style.cssText =
              "padding:6px 10px;border-radius:6px;border:0;background:transparent;color:#9aa3b5;font:inherit;cursor:pointer;text-decoration:underline";
            form.append(clear);

            clear.addEventListener("click", () => {
              delete cmsPaths[promptOrigin];
              chrome.storage.sync.set({ cmsPaths }, () => {
                dismiss();
              });
            });
          }

          function dismiss() {
            document.removeEventListener("keydown", onEsc);
            host.remove();
          }

          function onEsc(event) {
            if (event.key === "Escape") {
              dismiss();
            }
          }

          document.addEventListener("keydown", onEsc);
          input.addEventListener("keydown", onEsc);

          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const raw = input.value.trim();
            if (!raw) {
              return;
            }

            let path = raw;
            try {
              if (/^https?:\/\//i.test(path)) {
                path = new URL(path).pathname;
              }
            } catch {
              // fall back to the raw value
            }
            if (!path.startsWith("/")) {
              path = "/" + path;
            }
            if (path.length > 1) {
              path = path.replace(/\/+$/, "");
            }

            chrome.storage.sync.get({ cmsPaths: {} }, (res) => {
              const cmsPaths = res.cmsPaths || {};
              cmsPaths[promptOrigin] = path;
              chrome.storage.sync.set({ cmsPaths }, () => {
                window.location.href = promptOrigin + path;
              });
            });
          });

          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        });
      },
      args: [origin, attemptedPath],
    })
    .catch(() => {
      // No-op: keep the extension silent and lightweight.
    });
}
