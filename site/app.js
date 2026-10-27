// Fills the download buttons with the files of the newest GitHub release and
// highlights the visitor's system. Without JavaScript (or if the GitHub API is
// unavailable) every button still leads to the releases page.
const REPO = 'IlianBurri/Kestrel-Agen-Harness-IDE';

const patterns = {
  windows: /Setup-.*\.exe$/i,
  mac: /\.dmg$/i,
  linux: /\.AppImage$/i,
};

function detectOs() {
  const platform = (navigator.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase();
  const agent = navigator.userAgent.toLowerCase();
  if (platform.includes('win') || agent.includes('windows')) return 'windows';
  if (platform.includes('mac') || agent.includes('mac os')) return 'mac';
  if (platform.includes('linux') || agent.includes('linux')) return 'linux';
  return null;
}

async function loadRelease() {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function sizeLabel(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

async function main() {
  const os = detectOs();
  const card = os && document.querySelector(`.card[data-os="${os}"]`);
  if (card) card.classList.add('detected');

  let release;
  try {
    release = await loadRelease();
  } catch {
    return; // Buttons keep pointing at the releases page.
  }
  const version = release.tag_name;
  document.getElementById('release-line').textContent =
    `Version ${version} · free and open source (MIT) · Windows · macOS · Linux`;

  for (const [key, pattern] of Object.entries(patterns)) {
    const button = document.querySelector(`[data-asset="${key}"]`);
    const asset = release.assets.find((entry) => pattern.test(entry.name));
    if (!button) continue;
    if (asset) {
      button.href = asset.browser_download_url;
      button.textContent = `Download ${version} (${sizeLabel(asset.size)})`;
    } else {
      button.href = release.html_url;
      button.textContent = 'See releases';
      button.classList.remove('primary');
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = `Not part of ${version} yet – check the releases page.`;
      button.after(note);
    }
  }

  const primary = document.getElementById('primary-download');
  const own = os && release.assets.find((entry) => patterns[os].test(entry.name));
  if (own) {
    primary.href = own.browser_download_url;
    primary.textContent = `Download for ${{ windows: 'Windows', mac: 'macOS', linux: 'Linux' }[os]}`;
  }
}

void main();
