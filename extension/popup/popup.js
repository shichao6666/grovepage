(() => {
  const content = byId('popupContent');
  new ResizeObserver(() => {
    const height = Math.ceil(content.getBoundingClientRect().height);
    document.body.style.setProperty('--popup-content-height', height + 'px');
  }).observe(content);

  const {localDefaults, colorDefaults, colors, strengthKey, allowedOnSite, filterColor, baseOpacityPercent} = EyeCare;
  const toggle = byId('eyeProtectionToggle');
  const slider = byId('opacitySlider');
  const quickColors = ['default', 'green', 'beige', 'lightGreen', 'cyan', 'aliceBlue'];
  const countdownButton = byId('countdownAction');
  const durationInput = byId('quickTotalMinutes');
  const allKey = 'eyeCarePause:all';
  const pausePreferenceKey = 'eyeCarePausePreference';
  const reminderToggle = byId('reminderToggle');
  const runtimeDefaults = {intervalActive: false, intervalTimerStartTime: null, intervalDuration: null,
    countdownActive: false, countdownStartTime: null, countdownDuration: null};
  let tab;
  let settings;
  let siteAllowed = false;
  let storedCustomColor;
  let countdownActive;
  let durationWrite;
  let sliderWrite;
  let draggingSlider = false;
  let request = 0;

  function checkedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`).value;
  }

  function setExpanded(button, expanded) {
    button.setAttribute('aria-expanded', String(expanded));
    byId(button.getAttribute('aria-controls')).hidden = !expanded;
  }

  function writeText(id, value) {
    const element = byId(id);
    if (element.textContent !== value) element.textContent = value;
  }

  async function supportedPage(url) {
    if (!url) return false;
    if (url.protocol === 'file:') return chrome.extension.isAllowedFileSchemeAccess();
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.hostname === 'chromewebstore.google.com') return false;
    if (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) return false;
    return url.hostname !== 'microsoftedge.microsoft.com' || !url.pathname.startsWith('/addons');
  }

  function renderReminder(state) {
    const countdownAvailable = state.restReminder && state.reminderType === 'countdown';
    reminderToggle.checked = state.restReminder;
    reminderToggle.disabled = byId('reminderModes').disabled = false;
    for (const input of byId('reminderModes').querySelectorAll('input')) {
      input.checked = input.value === state.reminderType;
    }
    countdownActive = state.countdownActive;
    countdownButton.hidden = !countdownAvailable;
    byId('reminderSettings').hidden = countdownAvailable;
    const canEditDuration = countdownAvailable && !countdownActive;
    byId('countdownLength').hidden = !canEditDuration;
    if (canEditDuration && !durationWrite && (durationInput.disabled
      || (durationInput.validity.valid && document.activeElement !== durationInput))) {
      const totalMinutes = state.countdownHours * 60 + Number(state.countdownMinutes);
      if (durationInput.valueAsNumber !== totalMinutes) durationInput.value = totalMinutes;
    }
    durationInput.disabled = !canEditDuration;
    byId('timerRemaining').hidden = !countdownAvailable || !countdownActive;
    let message = '';
    if (countdownAvailable) {
      if (countdownActive) {
        writeText('timerRemaining', formatRemaining(state.countdownStartTime, state.countdownDuration));
      }
      const label = countdownActive ? 'stopCountdown' : 'startCountdown';
      writeText('countdownAction', translate(countdownActive ? 'timerStop' : 'timerStart'));
      countdownButton.setAttribute('aria-label', translate(label));
    } else if (state.restReminder && state.intervalActive) {
      message = translate('intervalLeft', formatRemaining(state.intervalTimerStartTime, state.intervalDuration));
    } else if (state.restReminder && state.reminderType === 'interval') {
      message = translate('intervalConfigured', String(state.reminderInterval));
    } else if (!state.restReminder) {
      message = translate('reminderDisabled');
    }
    writeText('reminderStatus', message);
  }

  function formatRemaining(start, duration) {
    const seconds = Math.max(0, Math.ceil((start + duration * 1000 - Date.now()) / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(part => String(part).padStart(2, '0')).join(':');
  }

  function renderColor(color) {
    byId('currentColor').hidden = false;
    const input = byId('customColor');
    if (storedCustomColor !== color.customColor) {
      input.value = /^#[0-9a-f]{6}$/i.test(color.customColor) ? color.customColor : colorDefaults.customColor;
      storedCustomColor = color.customColor;
    }
    byId('customSwatch').style.backgroundColor = input.value;
    byId('useCustomColor').checked = color.useCustomColor;
    byId('colorSwatch').style.backgroundColor = filterColor(color);
    writeText('colorName', translate(color.useCustomColor ? 'customColorName'
      : (Object.hasOwn(colors, color.colorType) ? color.colorType : 'default') + 'ColorName'));
    for (const swatch of document.querySelectorAll('.swatch-button')) {
      swatch.setAttribute('aria-pressed', String(!color.useCustomColor && swatch.dataset.color === color.colorType));
    }
  }

  function pauseSelection() {
    return {scope: checkedValue('pauseScope'), seconds: Number(checkedValue('pauseDuration'))};
  }

  function renderPauseActions() {
    const {scope, seconds} = pauseSelection();
    const time = seconds === 30 ? translate('pause30') : translate('timerMinutesValue', String(seconds / 60));
    writeText('pauseQuick', translate(scope === 'all' ? 'pauseQuickAll' : 'pauseQuickTab', time));
    byId('pauseQuick').disabled = byId('pauseStart').disabled =
      !settings?.eyeProtection || (scope === 'tab' && !siteAllowed);
  }

  function renderPause(report, tabUntil = 0, allUntil = 0) {
    const now = Date.now();
    const tabPaused = tabUntil > now;
    const allPaused = allUntil > now;
    const paused = tabPaused || allPaused;
    const overlapping = tabPaused && allPaused;
    byId('pauseQuick').hidden = paused;
    byId('pauseActive').hidden = !paused;
    byId('resumeTab').hidden = !tabPaused;
    byId('resumeAll').hidden = !allPaused;
    renderPauseActions();
    if (paused) {
      const label = overlapping ? 'filterPausedBoth' : allPaused ? 'filterPausedAll' : 'filterPausedTab';
      const seconds = String(Math.ceil((Math.max(tabUntil, allUntil) - now) / 1000));
      writeText('pauseStatus', report?.applied ? translate('filterPending') : translate(label, seconds));
      writeText('resumeTab', translate(overlapping ? 'resumeTabShort' : 'resumeNow'));
      writeText('resumeAll', translate(overlapping ? 'resumeAllShort' : 'resumeNow'));
    }
    return paused;
  }

  async function render() {
    const current = ++request;
    const [[active], local, color] = await Promise.all([
      chrome.tabs.query({active: true, currentWindow: true}),
      chrome.storage.local.get({...localDefaults, ...reminderDefaults, ...runtimeDefaults}),
      chrome.storage.sync.get(colorDefaults)
    ]);
    const url = active?.url ? new URL(active.url) : null;
    const tabKey = active ? 'eyeCarePause:' + active.id : '';
    const [pauses, supported] = await Promise.all([
      chrome.storage.session.get(tabKey ? [allKey, tabKey] : [allKey]), supportedPage(url)
    ]);
    const report = supported ? await chrome.tabs.sendMessage(active.id, {type: 'eyeCareStatus'}, {frameId: 0})
      .catch(() => null) : null;
    if (current !== request) return;

    tab = active;
    settings = local;
    toggle.checked = local.eyeProtection;
    toggle.disabled = slider.disabled = false;
    const key = strengthKey(local);
    writeText('strengthLabel', translate({dayOpacity: 'dayStrength', nightOpacity: 'nightStrength'}[key] || 'filterStrength'));
    if (!draggingSlider && !sliderWrite) {
      slider.value = local[key] ?? local.opacity;
      writeText('strengthValue', slider.value + '%');
    }
    renderColor(color);
    renderReminder(local);

    siteAllowed = supported && allowedOnSite(local, url.hostname);
    const paused = renderPause(report, pauses[tabKey], pauses[allKey]);
    let status;
    if (!supported) status = 'filterRestricted';
    else if (report?.applied && (!local.eyeProtection || !siteAllowed || paused)) status = 'filterPending';
    else if (!local.eyeProtection) status = 'filterOff';
    else if (!siteAllowed) status = 'filterExcluded';
    else if (paused) status = 'filterPaused';
    else if (report?.applied) status = 'filterApplied';
    else if (active.status === 'loading' || report?.ready === false) status = 'checkingFilter';
    else status = 'filterMissing';
    writeText('filterStatus', translate(status));
    byId('pageStatus').dataset.tone = status === 'filterApplied' ? 'good'
      : ['filterMissing', 'filterPaused'].includes(status) ? 'warning' : 'neutral';
    byId('reloadPage').hidden = status !== 'filterMissing';
    byId('siteRulesLink').hidden = status !== 'filterExcluded';
  }

  async function update() {
    try {
      await render();
    } catch (error) {
      writeText('filterStatus', translate('operationFailed'));
      console.error(error);
    }
  }

  async function act(action) {
    const errorLabel = byId('filterError');
    errorLabel.hidden = true;
    try {
      await action();
      await update();
    } catch (error) {
      errorLabel.textContent = translate('operationFailed');
      errorLabel.hidden = false;
      console.error(error);
    }
  }

  async function startPause() {
    const {scope, seconds} = pauseSelection();
    const key = scope === 'all' ? allKey : 'eyeCarePause:' + tab.id;
    await chrome.storage.session.set({[key]: Date.now() + seconds * 1000});
    setExpanded(byId('pauseOptions'), false);
  }

  function saveStrength(value) {
    const key = strengthKey(settings);
    const write = (sliderWrite ?? Promise.resolve()).catch(() => {})
      .then(() => chrome.storage.local.set({[key]: value}));
    sliderWrite = write;
    return write.finally(() => {
      if (sliderWrite === write) sliderWrite = undefined;
    });
  }

  function saveDuration() {
    const minutes = durationInput.valueAsNumber;
    const write = (durationWrite ?? Promise.resolve()).catch(() => {}).then(() => chrome.storage.local.set({
      countdownHours: Math.floor(minutes / 60),
      countdownMinutes: minutes % 60
    }));
    durationWrite = write;
    return write.finally(() => {
      if (durationWrite === write) durationWrite = undefined;
    });
  }

  async function init() {
    await loadUiLanguage();
    writeText('strengthHint', translate('filterBaseStrength', String(baseOpacityPercent)));
    const customColor = byId('customColor');
    const saved = await chrome.storage.session.get(pausePreferenceKey);
    const preference = saved[pausePreferenceKey];
    if (preference) {
      for (const input of byId('pauseControl').querySelectorAll('input')) {
        const expected = input.name === 'pauseScope' ? preference.scope : preference.seconds;
        if (input.value === String(expected)) input.checked = true;
      }
    }
    renderPauseActions();
    for (const key of [...quickColors, ...Object.keys(colors).filter(color => !quickColors.includes(color))]) {
      const swatch = document.createElement('button');
      swatch.className = 'swatch-button';
      swatch.type = 'button';
      swatch.dataset.color = key;
      swatch.setAttribute('aria-pressed', 'false');
      swatch.title = translate(key + 'ColorName');
      swatch.setAttribute('aria-label', swatch.title);
      swatch.style.setProperty('--swatch', colors[key]);
      swatch.append(document.createElement('span'));
      swatch.addEventListener('click', () => act(() => chrome.storage.sync.set({colorType: key, useCustomColor: false})));
      byId(quickColors.includes(key) ? 'quickPalette' : 'extraPalette').append(swatch);
    }
    for (const button of [byId('colorOptions'), byId('pauseOptions')]) {
      button.addEventListener('click', () => setExpanded(button, button.getAttribute('aria-expanded') !== 'true'));
    }
    toggle.addEventListener('change', () => act(() => chrome.storage.local.set({eyeProtection: toggle.checked})));
    slider.addEventListener('pointerdown', () => { draggingSlider = true; });
    const endSliderDrag = () => { draggingSlider = false; };
    window.addEventListener('pointerup', endSliderDrag);
    window.addEventListener('pointercancel', endSliderDrag);
    slider.addEventListener('input', () => {
      writeText('strengthValue', slider.value + '%');
      saveStrength(Number(slider.value)).catch(console.error);
    });
    byId('useCustomColor').addEventListener('change', event => act(() => chrome.storage.sync.set({useCustomColor: event.target.checked})));
    customColor.addEventListener('input', () => { byId('customSwatch').style.backgroundColor = customColor.value; });
    customColor.addEventListener('change', event => act(() => chrome.storage.sync.set({
      customColor: event.target.value, useCustomColor: true
    })));
    byId('pauseControl').addEventListener('change', () => {
      renderPauseActions();
      act(() => chrome.storage.session.set({[pausePreferenceKey]: pauseSelection()}));
    });
    byId('pauseQuick').addEventListener('click', () => act(startPause));
    byId('pauseStart').addEventListener('click', () => act(startPause));
    byId('resumeTab').addEventListener('click', () => act(() => chrome.storage.session.remove('eyeCarePause:' + tab.id)));
    byId('resumeAll').addEventListener('click', () => act(() => chrome.storage.session.remove(allKey)));
    byId('reloadPage').addEventListener('click', () => act(() => chrome.tabs.reload(tab.id)));
    reminderToggle.addEventListener('change', () => act(() => chrome.storage.local.set({restReminder: reminderToggle.checked})));
    byId('reminderModes').addEventListener('change', () => act(() => chrome.storage.local.set({reminderType: checkedValue('reminderMode')})));
    durationInput.addEventListener('input', () => {
      if (!durationInput.disabled && durationInput.validity.valid) act(saveDuration);
    });
    countdownButton.addEventListener('click', async () => {
      const stopping = countdownActive;
      if (!stopping && !durationInput.reportValidity()) return;
      countdownButton.disabled = true;
      await act(async () => {
        if (!stopping) await saveDuration();
        const result = await chrome.runtime.sendMessage({type: stopping ? 'eyeCareStopCountdown' : 'eyeCareStartCountdown'});
        if (!result?.ok) throw Error('Countdown command failed');
      });
      countdownButton.disabled = false;
    });
    chrome.storage.onChanged.addListener(update);
    await update();
    setInterval(update, 1000);
  }

  init().catch(console.error);
})();
