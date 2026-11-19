const hero = document.getElementById('hero-relay');
const image = hero?.querySelector('img');
const story = document.getElementById('continuity-story');
const relayButton = document.getElementById('relay-toggle');
const relayStatus = document.querySelector('#relay-state span');
const fallback = document.getElementById('story-unavailable');
let loading = false;
let proximity: IntersectionObserver | undefined;

function loadStory() {
  if (loading) return;
  loading = true;
  proximity?.disconnect();
  void import('./main').then(() => {
    if (fallback) fallback.hidden = true;
  }).catch(() => {
    loading = false;
    if (fallback) fallback.hidden = false;
  });
}

if (hero && relayButton && relayStatus) {
  relayButton.hidden = false;
  relayButton.addEventListener('click', () => {
    const interrupted = hero.classList.toggle('is-diverted');
    relayButton.setAttribute('aria-pressed', String(interrupted));
    relayStatus.textContent = interrupted ? 'Corte simulado · copia disponible' : 'HubSpot disponible';
    window.dispatchEvent(new Event('planb:relay-change'));
    loadStory();
  });
}

function loadAfterPaint() {
  requestAnimationFrame(() => requestAnimationFrame(loadStory));
}

window.addEventListener('hashchange', loadStory);
document.querySelectorAll('[data-open-story]').forEach((link) => link.addEventListener('click', loadStory));
if (window.location.hash) loadStory();
else if (story && 'IntersectionObserver' in window) {
  proximity = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting && entry.intersectionRatio >= .18) loadStory();
  }, { threshold: .18 });
  proximity.observe(story);
} else if (!image || image.complete) loadAfterPaint();
else {
  image.addEventListener('load', loadAfterPaint, { once: true });
  image.addEventListener('error', loadAfterPaint, { once: true });
}
