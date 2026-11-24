const allTabsPause = 'eyeCarePause:all';
const tabPauseKey = tabId => 'eyeCarePause:' + tabId;

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === 'eyeCareGetPause' && Number.isInteger(sender.tab?.id)) {
    const key = tabPauseKey(sender.tab.id);
    chrome.storage.session.get([allTabsPause, key]).then(values => {
      reply({until: Math.max(values[allTabsPause] || 0, values[key] || 0)});
    }, () => reply({until: 0}));
    return true;
  }
});

chrome.storage.session.onChanged.addListener(async changes => {
  const affected = Object.keys(changes).filter(key => key.startsWith('eyeCarePause:'));
  if (!affected.length) return;
  const ids = affected.includes(allTabsPause)
    ? (await chrome.tabs.query({})).map(tab => tab.id)
    : affected.map(key => Number(key.split(':')[1]));
  await Promise.allSettled(ids.map(id => chrome.tabs.sendMessage(id, {type: 'eyeCarePauseChanged'})));
});

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(tabPauseKey(tabId)));
