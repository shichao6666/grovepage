"""Package GrovePage locally for GitHub, Edge Add-ons and the Chrome Web Store."""

from hashlib import sha256
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from generate_assets import write_icon


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
RUNTIME = {
    "assets": ("support-alipay.jpg", "support-wechat.png"),
    "background": ("background.js", "pause.js", "reminders.js"),
    "content": ("content.js", "styles.css"),
    "forced-rest": ("forced-rest.html", "forced-rest.js", "forced-rest.css"),
    "icons": ("icon16.png", "icon32.png", "icon48.png", "icon128.png"),
    "js": ("filter-settings.js", "i18n.js", "reminder-settings.js", "settings.css", "ui.css", "ui.js"),
    "notification": ("notification.html", "notification.js", "notification.css"),
    "options": ("options.html", "options.js", "backup.js"),
    "popup": ("popup.html", "popup.js", "popup.css"),
    "settings": ("settings.html", "settings.js", "support.html", "support.js"),
    "sounds": ("music1.wav", "music2.wav", "music3.wav"),
}
LOCALES = ("en", "ja", "km", "ko", "ru", "zh_CN")
SOURCE = (".gitignore", "PRIVACY.md", "README.en.md", "readme.md", "tools/build_release.py", "tools/generate_assets.py")


def archive(destination, files):
    with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as output:
        for name, data in sorted(files.items()):
            entry = ZipInfo(name)
            entry.external_attr = 0o100644 << 16
            output.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)


def build():
    manifest = json.loads((EXTENSION / "manifest.json").read_bytes())
    version = manifest["version"]
    if not 1 <= len(version.split(".")) <= 4 or not all(part.isascii() and part.isdecimal() for part in version.split(".")):
        raise ValueError("Invalid manifest version")

    paths = ["manifest.json", *(f"{folder}/{name}" for folder, names in RUNTIME.items() for name in names)]
    paths.extend(f"_locales/{locale}/messages.json" for locale in LOCALES)
    runtime = {name: (EXTENSION / name).read_bytes() for name in paths}
    source = {name: (ROOT / name).read_bytes() for name in SOURCE}
    for name in ("LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE", "NOTICE.md", "NOTICE.txt"):
        if (ROOT / name).is_file():
            source[name] = (ROOT / name).read_bytes()
    source.update({f"extension/{name}": data for name, data in runtime.items()})

    destination = ROOT / "dist" / f"v{version}"
    listing = destination / "store-listing"
    listing.mkdir(parents=True, exist_ok=True)
    stem = f"grovepage-v{version}"
    edge = destination / f"{stem}-edge.zip"
    chrome = destination / f"{stem}-chrome.zip"
    github = destination / f"{stem}-github-source.zip"

    with TemporaryDirectory() as temporary:
        chrome_icon = Path(temporary) / "store128.png"
        write_icon(128, chrome_icon, mark_scale=0.795)
        chrome_manifest = {**manifest, "icons": {**manifest["icons"], "128": "icons/store128.png"}}
        chrome_runtime = {**runtime, "icons/store128.png": chrome_icon.read_bytes()}
        chrome_runtime["manifest.json"] = (json.dumps(chrome_manifest, indent=2) + "\n").encode("utf-8")
        archive(chrome, chrome_runtime)
        (listing / "chrome-icon-128.png").write_bytes(chrome_icon.read_bytes())

    archive(edge, runtime)
    archive(github, source)
    write_icon(300, listing / "edge-logo-300.png")
    checksums = "".join(f"{sha256(file.read_bytes()).hexdigest()}  {file.name}\n" for file in (github, edge, chrome))
    (destination / "SHA256SUMS.txt").write_text(checksums, encoding="utf-8", newline="\n")
    print(destination)


if __name__ == "__main__":
    build()
