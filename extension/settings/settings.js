async function initializeAbout() {
  const {version: loadedVersion} = chrome.runtime.getManifest();
  let version = loadedVersion;
  try {
    // An unpacked extension can serve updated files before Edge reloads its runtime manifest.
    const response = await fetch(chrome.runtime.getURL('manifest.json'), {cache: 'no-store'});
    if (response.ok) {
      const manifest = await response.json();
      if (typeof manifest.version === 'string' && manifest.version) version = manifest.version;
    }
  } catch {
    // Use the registered manifest if the packaged file cannot be read.
  }
  byId('versionNumber').textContent = 'v' + version;
  await loadUiLanguage();
  if (version !== loadedVersion) {
    byId('loadedVersionNotice').textContent = translate('loadedVersionNotice', loadedVersion);
    byId('versionUpdate').hidden = false;
  }
}

byId('reloadExtension').addEventListener('click', () => chrome.runtime.reload());
initializeAbout().catch(console.error);
