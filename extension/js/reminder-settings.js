globalThis.reminderDefaults = {
  restReminder: false, reminderType: 'interval', reminderInterval: 45, countdownHours: 0,
  countdownMinutes: 45, notificationMessage: '', forcedRestEnabled: false, restModeType: 'fullscreen',
  allowEmergencySkip: true, restDuration: 300, musicEnabled: false, selectedMusic: 'music1', musicVolume: 50
};

globalThis.reminderMessageText = (message, fallback) =>
  (typeof message === 'string' && message.trim()) || translate(fallback);
