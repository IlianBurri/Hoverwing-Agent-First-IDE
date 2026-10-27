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

// ---------- Motion (skipped when the system asks for reduced motion) ----------

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Staggers the scroll animations (style.css) within a group. */
function setupStagger() {
  for (const group of document.querySelectorAll('.reveal-group')) {
    [...group.querySelectorAll('.reveal')].forEach((element, index) => {
      element.style.setProperty('--i', String(index % 4));
    });
  }
}

/** "Bring your own coding agent / API key / local model". */
function setupRotator() {
  const word = document.getElementById('rotator');
  if (!word || calm) return;
  const words = ['coding agent', 'API key', 'local model'];
  let index = 0;
  window.setInterval(() => {
    word.classList.add('out');
    window.setTimeout(() => {
      index = (index + 1) % words.length;
      word.textContent = words[index];
      word.classList.remove('out');
    }, 350);
  }, 2600);
}

/** The navigation gets a shadow once the page is scrolled. */
function setupNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const update = () => {
    nav.classList.toggle('scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

/** A soft light under the pointer on cards. */
function setupSpotlight() {
  if (calm) return;
  for (const card of document.querySelectorAll('.spotlight')) {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--y', `${event.clientY - rect.top}px`);
    });
  }
}

setupStagger();
setupRotator();
setupNav();
setupSpotlight();
void main();
