(() => {
  // Installation may inject the same script as document_start.
  if (globalThis.eyeCareInitialized) return;
  globalThis.eyeCareInitialized = true;

  const {localDefaults, colorDefaults, strengthKey, filterColor, filterOpacity, allowedOnSite} = EyeCare;
  let local;
  let color;
  let pauseUntil = 0;
  let pauseReady = false;
  let revision = 0;
  let pauseRevision = 0;
  let observedRoot;
  let clockTimer;

  function apply() {
    if (!chrome.runtime?.id) {
      rootObserver.disconnect();
      documentObserver.disconnect();
      clearTimeout(clockTimer);
      return;
    }
    const root = document.documentElement;
    if (!root || !local || !color || !pauseReady) return;
    if (root !== observedRoot) {
      rootObserver.disconnect();
      rootObserver.observe(root, {attributes: true, attributeFilter: ['class', 'style']});
      observedRoot = root;
    }
    const enabled = local.eyeProtection && allowedOnSite(local, location.hostname) && pauseUntil <= Date.now();
    if (enabled) {
      const strength = local[strengthKey(local)] ?? local.opacity;
      const styles = {'--eyecare-color': filterColor(color), '--eyecare-opacity': String(filterOpacity(strength))};
      for (const [property, value] of Object.entries(styles)) {
        if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
      }
    }
    root.classList.toggle('eyecare-active', enabled);
  }

  function updateClock() {
    clearTimeout(clockTimer);
    apply();
    if (!chrome.runtime?.id) return;
    const now = Date.now();
    const pauseDelay = pauseUntil > now ? pauseUntil - now : Infinity;
    const scheduleDelay = local?.scheduleEnabled ? 60000 - now % 60000 : Infinity;
    const delay = Math.min(pauseDelay, scheduleDelay);
    if (Number.isFinite(delay)) clockTimer = setTimeout(updateClock, delay);
  }

  async function refreshPause() {
    if (!chrome.runtime?.id) return;
    const request = ++pauseRevision;
    const state = await chrome.runtime.sendMessage({type: 'eyeCareGetPause'}).catch(() => null);
    if (request !== pauseRevision) return;
    if (state) pauseUntil = state.until || 0;
    pauseReady = true;
    updateClock();
  }

  async function refresh() {
    if (!chrome.runtime?.id) return;
    const request = ++revision;
    const [localSettings, colorSettings] = await Promise.all([
      chrome.storage.local.get(localDefaults), chrome.storage.sync.get(colorDefaults)
    ]);
    if (request !== revision) return;
    local = localSettings;
    color = colorSettings;
    updateClock();
  }

  const rootObserver = new MutationObserver(apply);
  const documentObserver = new MutationObserver(apply);
  documentObserver.observe(document, {childList: true});
  chrome.storage.onChanged.addListener((changes, area) => {
    const keys = area === 'local' ? localDefaults : area === 'sync' ? colorDefaults : {};
    if (Object.keys(changes).some(key => Object.hasOwn(keys, key))) refresh();
  });
  function restorePage() {
    updateClock();
    refreshPause();
    refresh();
  }
  window.addEventListener('pageshow', restorePage);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) restorePage();
  });
  refreshPause().then(refresh);

  let noticeTimer;
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'eyeCarePauseChanged') {
      refreshPause().then(reply);
      return true;
    }
    if (message.type === 'eyeCareStatus') {
      const root = document.documentElement;
      const style = root && getComputedStyle(root, '::after');
      reply({ready: Boolean(local && color && pauseReady), applied: Boolean(root?.classList.contains('eyecare-active')
        && style.content !== 'none' && style.content !== 'normal' && style.display !== 'none'
        && style.visibility === 'visible' && Number(style.opacity) > 0
        && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent')});
      return;
    }
    if (message.type !== 'showShortcutNotification') return;
    let notice = document.getElementById('eyecare-notification');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'eyecare-notification';
      notice.style.cssText = 'position:fixed;top:20px;right:20px;background:#2196f3;color:white;padding:10px 20px;border-radius:8px;z-index:2147483647;font:14px sans-serif;pointer-events:none';
      document.documentElement.appendChild(notice);
    }
    notice.textContent = message.message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.remove(), 2000);
  });
})();
