(() => {
  const colors = {
    beige: '#E9D4AC', default: '#F3E9D8', green: '#C7EDCC', pink: '#F0D9D6',
    blue: '#C5D8ED', cyan: '#CCE6E2', lightGreen: '#DCE8BE', aliceBlue: '#D6DFE5',
    rosePink: '#EAC8D5', warmOrange: '#F3D2B2', mintGreen: '#D8ECDD', lavenderPurple: '#DED5EC'
  };
  const localDefaults = {
    eyeProtection: true, domainMode: 'all', domainList: '', opacity: 50,
    scheduleEnabled: false, dayStart: '07:00', nightStart: '21:00',
    dayOpacity: null, nightOpacity: null
  };
  const colorDefaults = {colorType: 'beige', useCustomColor: false, customColor: colors.beige};
  const baseOpacityPercent = 40;
  const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

  function strengthKey(settings, now = new Date()) {
    const {dayStart, nightStart} = settings;
    if (!settings.scheduleEnabled || !validTime(dayStart) || !validTime(nightStart) || dayStart === nightStart) {
      return 'opacity';
    }
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const daytime = dayStart < nightStart
      ? dayStart <= time && time < nightStart
      : dayStart <= time || time < nightStart;
    return daytime ? 'dayOpacity' : 'nightOpacity';
  }

  const normalizeHost = value => value.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');

  function domainFromRule(rule) {
    const text = rule.trim();
    if (!text) return '';
    const address = text.startsWith('//') ? 'https:' + text
      : text.includes('://') ? text : 'https://' + text;
    try {
      const url = new URL(address);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
      const host = normalizeHost(url.hostname);
      // URL checks IPv6 syntax. Domain labels also need checking to reject placeholders like *.example.com.
      if (host.startsWith('[') || (host.length <= 253
        && host.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)))) return host;
    } catch {
      // Ignore malformed entries while leaving the editable rule list intact.
    }
    return '';
  }

  function parseDomainList(list) {
    return list.split(/[\n,，]/).map(domainFromRule).filter(Boolean);
  }

  function allowedOnSite({domainMode, domainList}, hostname) {
    if (domainMode === 'all') return true;
    const host = normalizeHost(hostname);
    const domains = parseDomainList(domainList);
    const matches = domains.some(domain => host === domain || host.endsWith('.' + domain));
    return domainMode === 'specific' ? matches : !matches;
  }

  function filterColor({colorType, useCustomColor, customColor}) {
    return useCustomColor && /^#[0-9a-f]{6}$/i.test(customColor)
      ? customColor : Object.hasOwn(colors, colorType) ? colors[colorType] : colors.default;
  }

  function filterOpacity(strength) {
    return (baseOpacityPercent + (100 - baseOpacityPercent) * strength / 100) / 100;
  }

  globalThis.EyeCare = {
    localDefaults, colorDefaults, colors, validTime, strengthKey, parseDomainList, allowedOnSite,
    filterColor, filterOpacity, baseOpacityPercent
  };
})();
