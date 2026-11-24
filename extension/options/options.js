(() => {
  const form = byId('preferences');
  const save = byId('savePreferences');
  const shortcutDefaults = {shortcutsEnabled: false, shortcutNotifications: true};
  const {eyeProtection: _globalSwitch, opacity, ...filterDefaults} = EyeCare.localDefaults;
  const storageDefaults = {...reminderDefaults, ...shortcutDefaults, ...filterDefaults};
  const {countdownHours, countdownMinutes, ...advancedDefaults} = storageDefaults;
  advancedDefaults.countdownTotalMinutes = countdownHours * 60 + countdownMinutes;
  const links = [...byId('settingsNav').querySelectorAll('[data-section]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  const reminderLengths = [...form.querySelectorAll('[data-reminder-length]')];
  const numbers = new Set(['dayOpacity', 'nightOpacity', 'reminderInterval', 'countdownTotalMinutes',
    'restDuration', 'musicVolume']);
  let baseline;
  let previewAudio;
  let loading = 0;
  let activeSection = 'filter';
  let savingSection;
  let refreshAfterSave = false;
  const feedback = new Map();

  function renderReminderLength() {
    const mode = byId('reminderType').value;
    for (const field of reminderLengths) field.hidden = field.dataset.reminderLength !== mode;
  }

  function renderVolume() {
    byId('volumeValue').textContent = byId('musicVolume').value + '%';
    if (previewAudio) previewAudio.volume = Number(byId('musicVolume').value) / 100;
  }

  function showSection(section, focus = false) {
    const selected = links.find(link => link.dataset.section === section) ?? links[0];
    const group = activeSection = selected.dataset.section;
    for (const link of links) {
      if (link === selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== group;
    const heading = byId('settingsHeading');
    heading.setAttribute('data-i18n', selected.getAttribute('data-i18n'));
    heading.textContent = selected.textContent;
    byId('preferencesActions').hidden = group === 'backup';
    renderSaveState();
    if (location.hash === '#websiteRules') {
      byId('websiteRules').focus();
    } else if (focus) {
      heading.focus();
      window.scrollTo(0, 0);
    }
  }

  function sectionFromHash() {
    const hash = location.hash.slice(1);
    if (hash === 'websiteRules') return 'filter';
    return hash === 'restReminder' ? 'reminders' : hash;
  }

  function showDomainError(invalid) {
    byId('domainRuleError').hidden = !invalid;
    if (invalid) byId('domainList').setAttribute('aria-invalid', 'true');
    else byId('domainList').removeAttribute('aria-invalid');
  }

  function readForm() {
    return Object.fromEntries(Object.keys(advancedDefaults).flatMap(key => {
      const element = byId(key);
      if (!element) return [];
      const value = element.type === 'checkbox' ? element.checked
        : numbers.has(key) ? (element.value === '' ? NaN : Number(element.value)) : element.value;
      return [[key, value]];
    }));
  }

  function changesFromBaseline(values = readForm()) {
    return baseline ? Object.entries(values).filter(([key, value]) => !Object.is(baseline[key], value)) : [];
  }

  function warnAboutUnsaved(event) {
    event.preventDefault();
    event.returnValue = true;
  }

  function renderSaveState() {
    const dirtySections = new Set(changesFromBaseline().map(([key]) => byId(key).closest('[data-panel]').dataset.panel));
    const dirty = dirtySections.has(activeSection);
    save.disabled = !baseline || Boolean(savingSection) || !dirty;
    for (const link of links) link.toggleAttribute('data-dirty', dirtySections.has(link.dataset.section));
    if (dirtySections.size) window.addEventListener('beforeunload', warnAboutUnsaved);
    else window.removeEventListener('beforeunload', warnAboutUnsaved);

    const result = feedback.get(activeSection);
    let key = dirty ? 'preferencesUnsaved' : dirtySections.size ? 'preferencesOtherUnsaved' : '';
    let tone = key ? 'pending' : '';
    if (savingSection === activeSection) {
      key = 'preferencesSaving';
    } else if (result === 'preferencesSaved' && !dirty) {
      key = result;
      tone = 'saved';
    } else if (result && result !== 'preferencesSaved') {
      key = result;
      tone = 'error';
    }
    const status = byId('preferencesStatus');
    const text = key ? translate(key) : '';
    if (status.textContent !== text) status.textContent = text;
    status.dataset.tone = tone;
  }

  async function loadSettings({preserveDraft = false} = {}) {
    if (savingSection) {
      refreshAfterSave = true;
      return;
    }
    const request = ++loading;
    const state = await chrome.storage.local.get({...storageDefaults, opacity});
    if (request !== loading) return;
    if (savingSection) {
      refreshAfterSave = true;
      return;
    }
    const draft = preserveDraft ? changesFromBaseline()
      .map(([key]) => [byId(key), byId(key).type === 'checkbox' ? byId(key).checked : byId(key).value]) : [];
    state.countdownTotalMinutes = state.countdownHours * 60 + Number(state.countdownMinutes);
    for (const key of Object.keys(advancedDefaults)) {
      const element = byId(key);
      if (!element) continue;
      if (element.type === 'checkbox') element.checked = state[key];
      else element.value = state[key] ?? advancedDefaults[key] ?? state.opacity;
    }
    baseline = readForm();
    for (const [element, value] of draft) {
      if (element.type === 'checkbox') element.checked = value;
      else element.value = value;
    }
    if (byId('domainMode').value !== 'specific' || EyeCare.parseDomainList(byId('domainList').value).length) {
      showDomainError(false);
    }
    renderReminderLength();
    renderVolume();
    renderSaveState();
  }

  async function getShortcut() {
    const commands = await chrome.commands.getAll();
    return commands.find(command => command.name === 'toggle-eye-protection')?.shortcut || '';
  }

  async function refreshShortcut() {
    const shortcut = await getShortcut();
    byId('activeShortcut').textContent = translate('currentShortcut', shortcut || translate('shortcutUnassigned'));
  }

  function stopPreview() {
    previewAudio?.pause();
    previewAudio = null;
    byId('previewMusic').textContent = translate('previewMusic');
  }

  window.addEventListener('hashchange', () => showSection(sectionFromHash(), true));
  byId('reminderType').addEventListener('input', renderReminderLength);
  form.addEventListener('input', event => {
    const panel = event.target.closest('[data-panel]');
    if (panel) feedback.delete(panel.dataset.panel);
    if (event.target.matches('#domainMode, #domainList')) showDomainError(false);
    renderSaveState();
  });
  byId('musicVolume').addEventListener('input', renderVolume);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!baseline || savingSection || activeSection === 'backup') return;
    const section = activeSection;
    const panel = panels.find(group => group.dataset.panel === section);
    feedback.delete(section);
    const values = readForm();
    const invalidFields = [...panel.querySelectorAll(':invalid')];
    const invalid = invalidFields.find(field => !field.closest('[data-reminder-length][hidden]')
      && (values.restReminder || !field.closest('[data-reminder-length]'))
      && (values.scheduleEnabled || !field.closest('#scheduleFields')));
    if (invalid) {
      invalid.reportValidity();
      renderSaveState();
      return;
    }
    if (section === 'filter' && values.domainMode === 'specific' && !EyeCare.parseDomainList(values.domainList).length) {
      showDomainError(true);
      byId('domainList').focus();
      renderSaveState();
      return;
    }
    if (section === 'filter' && values.scheduleEnabled && values.dayStart === values.nightStart) {
      byId('nightStart').focus();
      feedback.set(section, 'differentScheduleTimes');
      renderSaveState();
      return;
    }
    if (section === 'reminders' && values.restReminder && values.reminderType === 'countdown' && !values.countdownTotalMinutes) {
      byId('countdownTotalMinutes').focus();
      feedback.set(section, 'nonzeroCountdown');
      renderSaveState();
      return;
    }
    const incompleteFields = invalidFields.map(field => [field, field.value]);
    for (const [field] of incompleteFields) values[field.id] = baseline[field.id];
    const changes = changesFromBaseline(values).filter(([key]) => panel.contains(byId(key)));
    if (!changes.length) {
      for (const [field] of incompleteFields) field.value = baseline[field.id];
      renderSaveState();
      return;
    }
    const changed = Object.fromEntries(changes);
    const {countdownTotalMinutes, ...stored} = changed;
    if (countdownTotalMinutes !== undefined) {
      stored.countdownHours = Math.floor(countdownTotalMinutes / 60);
      stored.countdownMinutes = countdownTotalMinutes % 60;
    }
    savingSection = section;
    renderSaveState();
    try {
      await chrome.storage.local.set(stored);
      Object.assign(baseline, changed);
      for (const [field, value] of incompleteFields) {
        if (field.value === value) field.value = baseline[field.id];
      }
      feedback.set(section, 'preferencesSaved');
    } catch (error) {
      feedback.set(section, 'operationFailed');
      console.error(error);
    } finally {
      savingSection = undefined;
      renderSaveState();
      if (refreshAfterSave) {
        refreshAfterSave = false;
        loadSettings({preserveDraft: true}).catch(console.error);
      }
    }
  });

  byId('previewMusic').addEventListener('click', async () => {
    if (previewAudio) return stopPreview();
    const music = byId('selectedMusic').value;
    const player = new Audio(chrome.runtime.getURL('sounds/' + music + '.wav'));
    previewAudio = player;
    renderVolume();
    byId('previewMusic').textContent = translate('stopPreview');
    player.addEventListener('ended', stopPreview, {once: true});
    try {
      await player.play();
      setTimeout(() => { if (previewAudio === player) stopPreview(); }, 10000);
    } catch {
      if (previewAudio === player) stopPreview();
    }
  });
  byId('selectedMusic').addEventListener('change', stopPreview);
  byId('shortcutSettings').addEventListener('click', () => {
    const browserScheme = navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome';
    return chrome.tabs.create({url: browserScheme + '://extensions/shortcuts'});
  });
  byId('languageSelect').addEventListener('change', async event => {
    const language = event.target.value;
    try {
      await i18n.switchLanguage(language);
      document.documentElement.lang = language.replace('_', '-');
      await refreshShortcut();
      renderSaveState();
    } catch (error) {
      console.error(error);
    }
  });
  window.addEventListener('focus', () => refreshShortcut().catch(console.error));
  chrome.storage.local.onChanged.addListener(changes => {
    if (baseline && Object.keys(changes).some(key => key === 'opacity' || Object.hasOwn(storageDefaults, key))) {
      loadSettings({preserveDraft: true}).catch(console.error);
    }
  });

  const ready = loadUiLanguage().then(async locale => {
    byId('languageSelect').value = locale;
    showSection(sectionFromHash());
    await Promise.all([loadSettings(), refreshShortcut()]);
  });
  ready.catch(console.error);
  globalThis.AdvancedSettings = {ready, loadSettings, getShortcut, shortcutDefaults};
})();
