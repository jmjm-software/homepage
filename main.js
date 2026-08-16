/* main.js — DOM glue: terminal typing, scroll reveals, depth rail */

/* 3D scene — loaded dynamically so the page still works if WebGL is unavailable */
import('./scene.js').catch(() => {
  window.__stackProgress = 0;
  const c = document.getElementById('scene');
  if (c) c.style.display = 'none';
});

/* ── hero terminal typing ── */
const TERM_LINES = [
  { cls: '', html: '<span class="t-prompt">josh@dev</span><span class="t-out">:~$</span> <span class="t-cmd">whoami --stack</span>' },
  { cls: 't-out', html: 'layer 01 · presentation ....... react · angular · web components' },
  { cls: 't-out', html: 'layer 02 · application ........ node · python · symfony' },
  { cls: 't-out', html: 'layer 03 · data ............... postgres · queues · caches' },
  { cls: 't-out', html: 'layer 04 · protocol ........... evm · solidity · foundry' },
  { cls: '', html: '<span class="t-prompt">josh@dev</span><span class="t-out">:~$</span> <span class="t-cmd">status</span>' },
  { cls: 't-ok', html: '▸ 7+ years shipping · building & breaking' },
];

const termBody = document.getElementById('term-body');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function typeTerminal() {
  if (REDUCED) {
    termBody.innerHTML = TERM_LINES.map(l => `<div class="${l.cls}">${l.html}</div>`).join('') +
      '<div><span class="t-prompt">josh@dev</span><span class="t-out">:~$</span> <span class="term-cursor"></span></div>';
    return;
  }
  let li = 0;
  function nextLine() {
    if (li >= TERM_LINES.length) {
      termBody.insertAdjacentHTML('beforeend',
        '<div><span class="t-prompt">josh@dev</span><span class="t-out">:~$</span> <span class="term-cursor"></span></div>');
      return;
    }
    const line = TERM_LINES[li++];
    const div = document.createElement('div');
    div.className = line.cls;
    termBody.appendChild(div);

    // type plain-text lines char by char; render rich lines instantly
    const plain = line.html.replace(/<[^>]+>/g, '');
    if (plain === line.html && line.cls !== '') {
      let ci = 0;
      const speed = 9;
      (function tick() {
        ci += 2;
        div.textContent = plain.slice(0, ci);
        if (ci < plain.length) setTimeout(tick, speed);
        else setTimeout(nextLine, 130);
      })();
    } else {
      div.innerHTML = line.html;
      setTimeout(nextLine, 320);
    }
  }
  setTimeout(nextLine, 500);
}
typeTerminal();

/* ── scroll reveals ── */
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) {
      en.target.classList.add('in');
      io.unobserve(en.target);
    }
  }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* stagger siblings slightly */
document.querySelectorAll('.stat-stack .stat, .repo-grid .repo, .vuln-list .vuln, .contact-links .contact-link').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 6) * 70}ms`;
});

/* ── top bar state ── */
const topbar = document.getElementById('topbar');
window.addEventListener('scroll', () => {
  topbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── mobile drawer nav ── */
const navToggle = document.getElementById('nav-toggle');
const mobileNav = document.getElementById('mobile-nav');
let navOpen = false;

function setNav(open) {
  navOpen = open;
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'close menu' : 'open menu');
  mobileNav.classList.toggle('open', open);
  mobileNav.inert = !open;
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) mobileNav.querySelector('a').focus();
}
navToggle.addEventListener('click', () => setNav(!navOpen));
mobileNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNav(false)));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && navOpen) setNav(false); });
window.addEventListener('resize', () => { if (navOpen && window.innerWidth > 1000) setNav(false); });

/* ── depth rail ── */
const railFill = document.getElementById('rail-fill');
const railDot = document.getElementById('rail-dot');

function updateRail() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  const pct = p * 100;
  railFill.style.height = pct + '%';
  railDot.style.top = pct + '%';
}
(function railLoop() { updateRail(); requestAnimationFrame(railLoop); })();

/* ── hero parallax fade ── */
// Fade is tied to how far the hero section has actually scrolled out of view —
// not to raw scrollY — so on short mobile viewports the text stays readable
// instead of vanishing within the first screen of scrolling.
const hero = document.querySelector('.hero');
const heroInner = document.querySelector('.hero-inner');
const scrollHint = document.querySelector('.scroll-hint');
window.addEventListener('scroll', () => {
  const rect = hero.getBoundingClientRect();
  const h = Math.max(rect.height, window.innerHeight);
  const p = Math.min(1, Math.max(0, -rect.top / h)); // 0 = hero fills screen · 1 = fully scrolled past
  if (REDUCED) {
    heroInner.style.opacity = 1;
    heroInner.style.transform = 'none';
    scrollHint.style.opacity = 1;
    return;
  }
  const f = Math.max(0, 1 - (p - 0.33) / 0.67); // fully opaque until ⅓ of the hero has scrolled out
  heroInner.style.opacity = f;
  heroInner.style.transform = `translateY(${p * 90}px)`;
  scrollHint.style.opacity = Math.max(0, 1 - p * 1.6);
}, { passive: true });
