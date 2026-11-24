(() => {
  const {localDefaults, colorDefaults, colors, validTime, parseDomainList} = EyeCare;
  const {loadSettings, getShortcut, shortcutDefaults, ready} = AdvancedSettings;
  const {eyeProtection: _globalSwitch, ...portableFilterDefaults} = localDefaults;
  const defaults = {...portableFilterDefaults, ...reminderDefaults, ...shortcutDefaults};
  const version = 1;
  const format = 'eye-care-assistant';
  const validationErrors = new Set(['backupUnsupported', 'domainListRequired', 'differentScheduleTimes', 'nonzeroCountdown']);
  const number = (min, max) => value => Number.isInteger(value) && value >= min && value <= max;
  const oneOf = (...choices) => value => choices.includes(value);
  const isString = value => typeof value === 'string';
  const percent = number(0, 100);
  const optionalPercent = value => value === null || percent(value);
  const check = {
    opacity: percent, domainMode: oneOf('all', 'specific', 'excluded'), domainList: isString,
    dayStart: validTime, nightStart: validTime, dayOpacity: optionalPercent, nightOpacity: optionalPercent,
    reminderType: oneOf('interval', 'countdown'), reminderInterval: number(1, 120),
    countdownHours: number(0, 24), countdownMinutes: number(0, 59), notificationMessage: isString,
    restModeType: oneOf('fullscreen'), restDuration: oneOf(60, 120, 180, 300, 600, 900),
    selectedMusic: oneOf('music1', 'music2', 'music3'), musicVolume: percent,
    colorType: oneOf(...Object.keys(colors)), customColor: value => isString(value) && /^#[0-9a-f]{6}$/i.test(value)
  };
  const labels = {
    opacity: 'filterStrength', colorType: 'presetColors', useCustomColor: 'enableCustomColor', customColor: 'customColor',
    domainMode: 'domainMode', domainList: 'domainList', scheduleEnabled: 'enableSchedule', dayStart: 'dayStart',
    nightStart: 'nightStart', dayOpacity: 'dayStrength', nightOpacity: 'nightStrength', restReminder: 'enableRestReminder',
    reminderType: 'reminderType', reminderInterval: 'intervalMinutesLabel', countdownHours: 'countdownHoursLabel',
    countdownMinutes: 'countdownMinutesLabel', notificationMessage: 'reminderMessage', forcedRestEnabled: 'enableForcedRest',
    restModeType: 'restModeType', allowEmergencySkip: 'allowEmergencySkip', restDuration: 'restDuration',
    musicEnabled: 'enableMusic', selectedMusic: 'musicType', musicVolume: 'musicVolume',
    shortcutsEnabled: 'enableShortcuts', shortcutNotifications: 'showShortcutNotifications'
  };
  const choiceLabels = {
    domainMode: {all: 'allDomains', specific: 'specificDomains', excluded: 'excludedDomains'},
    reminderType: {interval: 'fixedInterval', countdown: 'countdown'},
    restModeType: {fullscreen: 'fullscreenReminder'},
    selectedMusic: {music1: 'musicBeautiful', music2: 'musicPeaceful', music3: 'musicCheerful'}
  };
  const fileField = byId('backupFile');
  let candidate;
  let previewRequest = 0;

  async function snapshot() {
    const [local, color] = await Promise.all([chrome.storage.local.get(defaults), chrome.storage.sync.get(colorDefaults)]);
    return {local, color};
  }

  function validSection(section, schema) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) throw Error('backupInvalid');
    return Object.fromEntries(Object.entries(schema).flatMap(([key, defaultValue]) => {
      if (!Object.hasOwn(section, key)) return [];
      const value = section[key];
      const valid = check[key] ? check[key](value) : typeof value === typeof defaultValue;
      if (!valid) throw Error('backupInvalid');
      return [[key, value]];
    }));
  }

  function validate(data, current) {
    if (!data || data.format !== format) throw Error('backupInvalid');
    if (data.version !== version) throw Error('backupUnsupported');
    const local = validSection(data.local, defaults);
    const color = validSection(data.color, colorDefaults);
    if (!Object.keys(local).length && !Object.keys(color).length) throw Error('backupInvalid');
    const combined = {...current.local, ...local};
    if ((Object.hasOwn(local, 'domainMode') || Object.hasOwn(local, 'domainList'))
      && combined.domainMode === 'specific' && !parseDomainList(combined.domainList).length) {
      throw Error('domainListRequired');
    }
    if (combined.scheduleEnabled && combined.dayStart === combined.nightStart) throw Error('differentScheduleTimes');
    if (combined.restReminder && combined.reminderType === 'countdown' && !combined.countdownHours && !combined.countdownMinutes) {
      throw Error('nonzeroCountdown');
    }
    if (data.shortcut !== undefined && (!isString(data.shortcut) || data.shortcut.length > 100)) throw Error('backupInvalid');
    return {local, color, shortcut: data.shortcut};
  }

  function display(key, value) {
    if (typeof value === 'boolean') return translate(value ? 'settingOn' : 'settingOff');
    if (value === null) return translate('useBaseStrength');
    if (value === '') return translate('emptySetting');
    if (key === 'colorType' && Object.hasOwn(colors, value)) return translate(value + 'ColorName');
    const choice = choiceLabels[key]?.[value];
    if (typeof choice === 'string') return translate(choice);
    return String(value);
  }

  function showPreview(data, current) {
    const list = byId('backupChanges');
    list.replaceChildren();
    for (const section of ['local', 'color']) {
      for (const [key, value] of Object.entries(data[section])) {
        const previous = current[section][key];
        if (previous === value) continue;
        const item = document.createElement('li');
        item.textContent = translate('backupChangeLine', [translate(labels[key]), display(key, previous), display(key, value)]);
        list.append(item);
      }
    }
    if (!list.childElementCount) {
      const item = document.createElement('li');
      item.textContent = translate('backupNoChanges');
      list.append(item);
    }
    byId('backupVersion').textContent = translate('backupFormatVersion', String(version));
    byId('backupShortcut').hidden = !data.shortcut;
    byId('backupShortcut').textContent = data.shortcut ? translate('backupShortcutHint', data.shortcut) : '';
    byId('backupPreview').hidden = false;
  }

  function status(key) {
    byId('backupStatus').textContent = key ? translate(key) : '';
  }

  function clearPreview() {
    candidate = null;
    byId('backupPreview').hidden = true;
  }

  fileField.addEventListener('change', async () => {
    const request = ++previewRequest;
    const file = fileField.files[0];
    clearPreview();
    status('');
    if (!file) return;
    try {
      await ready;
      const [text, current] = await Promise.all([file.text(), snapshot()]);
      const data = validate(JSON.parse(text), current);
      if (request !== previewRequest) return;
      candidate = data;
      showPreview(data, current);
    } catch (error) {
      if (request !== previewRequest) return;
      status(validationErrors.has(error.message) ? error.message : 'backupInvalid');
      fileField.value = '';
    }
  });
  byId('cancelBackup').addEventListener('click', () => {
    ++previewRequest;
    clearPreview();
    fileField.value = '';
    status('');
  });
  byId('exportBackup').addEventListener('click', async () => {
    try {
      await ready;
      const [settings, shortcut] = await Promise.all([snapshot(), getShortcut()]);
      const url = URL.createObjectURL(new Blob([
        JSON.stringify({format, version, ...settings, shortcut}, null, 2)
      ], {type: 'application/json'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'grovepage-settings-v' + version + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      status('operationFailed');
      console.error(error);
    }
  });
  byId('applyBackup').addEventListener('click', async event => {
    const data = candidate;
    if (!data) return;
    const apply = event.currentTarget;
    apply.disabled = fileField.disabled = byId('cancelBackup').disabled = true;
    try {
      validate({format, version, ...data}, await snapshot());
      const colorKeys = Object.keys(data.color);
      const before = await chrome.storage.sync.get(colorKeys);
      await chrome.storage.sync.set(data.color);
      try {
        await chrome.storage.local.set(data.local);
      } catch (error) {
        await chrome.storage.sync.set(before);
        await chrome.storage.sync.remove(colorKeys.filter(key => !Object.hasOwn(before, key)));
        throw error;
      }
      clearPreview();
      status('backupApplied');
      fileField.value = '';
      await loadSettings({preserveDraft: true});
    } catch (error) {
      if (validationErrors.has(error.message)) {
        status(error.message);
      } else {
        status('operationFailed');
        console.error(error);
      }
    } finally {
      apply.disabled = fileField.disabled = byId('cancelBackup').disabled = false;
    }
  });
})();
