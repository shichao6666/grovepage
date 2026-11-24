const reminderAlarm = 'eyeCareRestReminder';
const reminderRuntime = {intervalActive: false, intervalTimerStartTime: null, intervalDuration: null,
  countdownActive: false, countdownStartTime: null, countdownDuration: null, countdownRemaining: 0};
let reminderQueue = Promise.resolve();

function queueReminder(action) {
  const pending = reminderQueue.then(action);
  reminderQueue = pending.catch(console.error);
  return pending;
}

async function stopReminder() {
  await chrome.alarms.clear(reminderAlarm);
  await chrome.storage.local.set(reminderRuntime);
}

async function startReminder(type, seconds) {
  await chrome.alarms.clear(reminderAlarm);
  const start = Date.now();
  const runtime = type === 'interval'
    ? {intervalActive: true, intervalTimerStartTime: start, intervalDuration: seconds}
    : {countdownActive: true, countdownStartTime: start, countdownDuration: seconds};
  await chrome.storage.local.set({...reminderRuntime, ...runtime});
  try {
    await chrome.alarms.create(reminderAlarm, {
      when: start + seconds * 1000,
      ...(type === 'interval' ? {periodInMinutes: seconds / 60} : {})
    });
  } catch (error) {
    await chrome.storage.local.set(reminderRuntime);
    throw error;
  }
}

async function reconcileReminder(resetSession = false) {
  const state = await chrome.storage.local.get({...reminderDefaults, ...reminderRuntime});
  if (!state.restReminder) return stopReminder();
  if (state.reminderType === 'countdown') {
    if (resetSession || state.intervalActive) await stopReminder();
    return;
  }
  const minutes = Number.isInteger(state.reminderInterval) && state.reminderInterval >= 1 && state.reminderInterval <= 120
    ? state.reminderInterval : reminderDefaults.reminderInterval;
  const seconds = minutes * 60;
  const alarm = await chrome.alarms.get(reminderAlarm);
  if (alarm && !resetSession && state.intervalActive && state.intervalDuration === seconds) return;
  await startReminder('interval', seconds);
}

chrome.runtime.onStartup.addListener(() => queueReminder(() => reconcileReminder(true)));
chrome.runtime.onInstalled.addListener(() => queueReminder(() => reconcileReminder(true)));
chrome.storage.local.onChanged.addListener(changes => {
  if (['restReminder', 'reminderType', 'reminderInterval'].some(key => Object.hasOwn(changes, key))) {
    queueReminder(() => reconcileReminder());
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== reminderAlarm) return;
  queueReminder(async () => {
    const state = await chrome.storage.local.get({...reminderDefaults, ...reminderRuntime});
    if (!state.restReminder) return;
    if (state.reminderType === 'interval' && state.intervalActive) {
      if (alarm.scheduledTime < state.intervalTimerStartTime + state.intervalDuration * 1000) return;
      // Derive the display from the next actual alarm, including after sleep.
      const next = await chrome.alarms.get(reminderAlarm);
      const nextTime = next?.scheduledTime ?? alarm.scheduledTime + state.intervalDuration * 1000;
      await chrome.storage.local.set({intervalTimerStartTime: nextTime - state.intervalDuration * 1000});
    } else if (state.reminderType === 'countdown' && state.countdownActive) {
      if (alarm.scheduledTime < state.countdownStartTime + state.countdownDuration * 1000) return;
      await stopReminder();
    } else {
      return;
    }
    await showNotification();
  });
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.tab?.url && !sender.tab.url.startsWith(chrome.runtime.getURL(''))) return;
  if (message.type !== 'eyeCareStartCountdown' && message.type !== 'eyeCareStopCountdown') return;
  queueReminder(async () => {
    const state = await chrome.storage.local.get(reminderDefaults);
    if (!state.restReminder || state.reminderType !== 'countdown') throw Error('countdown disabled');
    if (message.type === 'eyeCareStopCountdown') return stopReminder();
    const seconds = state.countdownHours * 3600 + state.countdownMinutes * 60;
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 89940) throw Error('invalid countdown');
    await startReminder('countdown', seconds);
  }).then(() => reply({ok: true}), () => reply({ok: false}));
  return true;
});
