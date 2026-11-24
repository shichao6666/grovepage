const locales = ['en', 'zh_CN', 'ja', 'ko', 'km', 'ru'];
const catalogs = new Map();
let locale = 'en';

async function initMessages() {
  const loads = locales.map(async language => {
    const url = chrome.runtime.getURL('_locales/' + language + '/messages.json');
    const response = await fetch(url);
    if (response.ok) catalogs.set(language, await response.json());
  });
  await Promise.allSettled(loads);
}

function getMessage(key, values = null) {
  const message = catalogs.get(locale)?.[key]?.message ?? catalogs.get('en')?.[key]?.message ?? '';
  if (values === null) return message;
  const substitutions = Array.isArray(values) ? values : [values];
  return message.replace(/\$(\d+)/g, (match, position) => substitutions[position - 1] ?? match);
}

function updatePageText() {
  for (const element of document.querySelectorAll('[data-i18n]')) {
    const message = getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    const message = getMessage(element.dataset.i18nPlaceholder);
    if (message) element.placeholder = message;
  }
}

async function getCurrentLocale() {
  const saved = (await chrome.storage.sync.get('locale')).locale;
  const systemLanguage = navigator.language.toLowerCase().split('-')[0];
  locale = locales.includes(saved) ? saved
    : locales.find(language => language.toLowerCase().split('_')[0] === systemLanguage) ?? 'en';
  return locale;
}

async function switchLanguage(language) {
  if (!locales.includes(language)) return;
  await chrome.storage.sync.set({locale: language});
  locale = language;
  updatePageText();
}

globalThis.i18n = {initMessages, getCurrentLocale, getMessage, updatePageText, switchLanguage};
