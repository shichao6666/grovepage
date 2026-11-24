async function startBreakPage() {
  await loadUiLanguage();
  const preferences = await chrome.storage.local.get(reminderDefaults);
  byId('breakMessage').textContent = reminderMessageText(preferences.notificationMessage, 'forcedRestMessage');
  const url = new URL(location.href);
  const storedEnd = Number(url.searchParams.get('until'));
  let end = Number.isFinite(storedEnd) && storedEnd > 0 ? storedEnd : Date.now() + preferences.restDuration * 1000;
  const timer = byId('restTimer');
  const dialog = byId('skipDialog');
  const skipButton = byId('skipButton');
  skipButton.hidden = !preferences.allowEmergencySkip;

  function renderTime() {
    const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    timer.textContent = [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
    if (!seconds) window.close();
  }

  renderTime();
  const tick = setInterval(renderTime, 250);
  byId('extendButton').addEventListener('click', () => {
    end += 300000;
    url.searchParams.set('until', String(end));
    history.replaceState(null, '', url);
    renderTime();
  });
  skipButton.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'skip') return;
    const state = await chrome.storage.local.get({allowEmergencySkip: true});
    if (state.allowEmergencySkip) window.close();
  });
  chrome.storage.local.onChanged.addListener(changes => {
    if (!Object.hasOwn(changes, 'allowEmergencySkip')) return;
    skipButton.hidden = changes.allowEmergencySkip.newValue === false;
    if (skipButton.hidden && dialog.open) dialog.close('cancel');
  });
  window.addEventListener('pagehide', () => clearInterval(tick), {once: true});

  if (!preferences.musicEnabled) return;
  const tracks = {music1: 'musicBeautiful', music2: 'musicPeaceful', music3: 'musicCheerful'};
  const track = Object.hasOwn(tracks, preferences.selectedMusic) ? preferences.selectedMusic : 'music1';
  const player = new Audio(chrome.runtime.getURL('sounds/' + track + '.wav'));
  player.loop = true;
  const volume = byId('musicVolumeControl');
  const musicButton = byId('toggleMusic');
  const status = byId('musicStatus');
  volume.value = preferences.musicVolume;
  player.volume = Number(volume.value) / 100;
  byId('musicName').textContent = translate(tracks[track]);
  byId('musicControl').hidden = false;

  async function play() {
    try {
      await player.play();
      status.hidden = true;
    } catch {
      status.textContent = translate('breakMusicPlayHint');
      status.hidden = false;
    }
  }

  function updateMusicButton() {
    musicButton.textContent = translate(player.paused ? 'playBreakMusic' : 'pauseBreakMusic');
  }

  musicButton.addEventListener('click', () => player.paused ? play() : player.pause());
  player.addEventListener('play', updateMusicButton);
  player.addEventListener('pause', updateMusicButton);
  volume.addEventListener('input', () => {
    player.volume = Number(volume.value) / 100;
    chrome.storage.local.set({musicVolume: Number(volume.value)}).catch(console.error);
  });
  window.addEventListener('pagehide', () => player.pause(), {once: true});
  updateMusicButton();
  await play();
}

startBreakPage().catch(console.error);
