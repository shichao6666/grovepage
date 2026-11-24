async function displayReminder() {
  await loadUiLanguage();
  const {notificationMessage} = await chrome.storage.local.get({notificationMessage: ''});
  byId('notificationMessage').textContent = reminderMessageText(notificationMessage, 'defaultReminderMessage');
  byId('closeBtn').addEventListener('click', () => window.close());
  const timer = byId('closeCountdown');
  const end = performance.now() + 5000;
  function tick() {
    const seconds = Math.ceil((end - performance.now()) / 1000);
    if (seconds <= 0) {
      clearInterval(interval);
      window.close();
      return;
    }
    timer.textContent = translate('reminderAutoClose', String(seconds));
  }
  const interval = setInterval(tick, 250);
  tick();
}

displayReminder().catch(console.error);
