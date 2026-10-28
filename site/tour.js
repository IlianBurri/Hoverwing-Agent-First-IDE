// Scroll tour through the app: while a step of "How an agent's change reaches
// your code" is in the middle of the screen, its part of the screenshot is
// framed and zoomed. Each step names its picture (data-img) and region
// (data-r = left top width height, in percent of the screenshot). Without
// JavaScript, on narrow screens or with reduced motion, every step shows its
// own crop instead (CSS only).
const MAX_ZOOM = 2.4;
const FILL = 0.7; // share of the view the region should fill when zoomed

const tour = document.querySelector('.tour');
const still = matchMedia('(max-width: 60rem), (prefers-reduced-motion: reduce)');

function zoomFor(left, top, width, height) {
  const scale = Math.max(1, Math.min(MAX_ZOOM, FILL / Math.max(width / 100, height / 100)));
  const clamp = (value) => Math.min(0, Math.max((1 - scale) * 100, value));
  const centerX = (left + width / 2) / 100;
  const centerY = (top + height / 2) / 100;
  return {
    scale,
    x: clamp((0.5 - centerX * scale) * 100),
    y: clamp((0.5 - centerY * scale) * 100),
  };
}

function show(step) {
  const layer = tour.querySelector('.tour-layer');
  const mark = tour.querySelector('.tour-mark');
  tour.querySelectorAll('.trail li').forEach((li) => li.classList.toggle('is-active', li === step));
  if (!step) {
    tour.dataset.step = '0';
    delete tour.dataset.img;
    layer.style.setProperty('--s', '1');
    layer.style.setProperty('--x', '0%');
    layer.style.setProperty('--y', '0%');
    return;
  }
  const [left, top, width, height] = step.dataset.r.split(' ').map(Number);
  const { scale, x, y } = zoomFor(left, top, width, height);
  tour.dataset.step = String([...step.parentElement.children].indexOf(step) + 1);
  tour.dataset.img = step.dataset.img;
  layer.style.setProperty('--s', String(scale));
  layer.style.setProperty('--x', `${x}%`);
  layer.style.setProperty('--y', `${y}%`);
  mark.style.setProperty('--ml', `${left}%`);
  mark.style.setProperty('--mt', `${top}%`);
  mark.style.setProperty('--mw', `${width}%`);
  mark.style.setProperty('--mh', `${height}%`);
}

function start() {
  const steps = [...tour.querySelectorAll('.trail li')];
  const visible = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      // The last step that reached the middle band wins; before the first, the overview.
      const active = steps.filter((li) => visible.has(li)).pop();
      if (active) show(active);
      else if (steps[0].getBoundingClientRect().top > innerHeight / 2) show(null);
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  steps.forEach((li) => observer.observe(li));
  tour.classList.add('is-live');
  return () => {
    observer.disconnect();
    tour.classList.remove('is-live');
    show(null);
  };
}

if (tour) {
  let stop = still.matches ? null : start();
  still.addEventListener('change', () => {
    stop?.();
    stop = still.matches ? null : start();
  });
}
