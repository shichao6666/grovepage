importScripts('../js/reminder-settings.js', 'pause.js', 'reminders.js');

const filterPatterns = ['http://*/*', 'https://*/*', 'file:///*'];
const breakPage = 'forced-rest/forced-rest.html';

async function refreshOpenPages() {
  const tabs = await chrome.tabs.query({url: filterPatterns});
  await Promise.allSettled(tabs.map(async ({id}) => {
    const target = {tabId: id};
    await chrome.scripting.insertCSS({target, files: ['content/styles.css']});
    await chrome.scripting.executeScript({target, files: ['js/filter-settings.js', 'content/content.js']});
  }));
}

async function showNotification() {
  const settings = await chrome.storage.local.get(reminderDefaults);
  if (settings.forcedRestEnabled) {
    const url = chrome.runtime.getURL(breakPage);
    const existing = (await chrome.tabs.query({})).some(tab => tab.url?.split('?')[0] === url
      || tab.pendingUrl?.split('?')[0] === url);
    if (existing) return;
    const end = Date.now() + settings.restDuration * 1000;
    await chrome.windows.create({url: breakPage + '?until=' + end, type: 'popup', state: 'fullscreen', focused: true});
    return;
  }

  const width = 400;
  const height = 200;
  const options = {url: 'notification/notification.html', type: 'popup', width, height, focused: true};
  const current = await chrome.windows.getLastFocused().catch(() => null);
  let reminder;
  if (Number.isFinite(current?.left) && Number.isFinite(current?.top) && current.width && current.height) {
    try {
      reminder = await chrome.windows.create({
        ...options,
        left: Math.floor(current.left + (current.width - width) / 2),
        top: Math.floor(current.top + (current.height - height) / 2)
      });
    } catch {
      // Edge can reject custom coordinates on a scaled or partially off-screen display.
    }
  }
  reminder ??= await chrome.windows.create(options);
  if (reminder?.id && (reminder.width !== width || reminder.height !== height)) {
    await chrome.windows.update(reminder.id, {width, height}).catch(() => {});
  }
}

async function handleToggleEyeProtection() {
  const settings = await chrome.storage.local.get({eyeProtection: true, shortcutNotifications: true});
  const enabled = !settings.eyeProtection;
  await chrome.storage.local.set({eyeProtection: enabled});
  if (!settings.shortcutNotifications) return;
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (!tab) return;
  const message = chrome.i18n.getMessage(enabled ? 'shortcutEnabledNotice' : 'shortcutDisabledNotice');
  await chrome.tabs.sendMessage(tab.id, {type: 'showShortcutNotification', message}).catch(() => {});
}

let refreshingPages;
function refreshOpenPagesOnce(force = false) {
  if (refreshingPages && !force) return refreshingPages;
  refreshingPages = (async () => {
    if (!force) {
      const {eyeCareInjected} = await chrome.storage.session.get({eyeCareInjected: false});
      if (eyeCareInjected) return;
    }
    await refreshOpenPages();
    await chrome.storage.session.set({eyeCareInjected: true});
  })().catch(console.error);
  return refreshingPages;
}

refreshOpenPagesOnce();
chrome.runtime.onInstalled.addListener(() => refreshOpenPagesOnce(true));
chrome.runtime.onStartup.addListener(() => refreshOpenPagesOnce(true));
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-eye-protection') return;
  const {shortcutsEnabled} = await chrome.storage.local.get({shortcutsEnabled: false});
  if (shortcutsEnabled) await handleToggleEyeProtection();
});
