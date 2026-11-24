globalThis.byId = id => document.getElementById(id);
globalThis.translate = (key, values) => i18n.getMessage(key, values) || key;
globalThis.loadUiLanguage = async () => {
  await i18n.initMessages();
  const locale = await i18n.getCurrentLocale();
  document.documentElement.lang = locale.replace('_', '-');
  i18n.updatePageText();
  return locale;
};
