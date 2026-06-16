/* ============================================================
   GSC Hero — scroll-driven cinematic story
   Scrubs a 150-frame JPEG sequence onto a <canvas> while
   meaning-screens (data-band) fade in/out over the footage.
   ============================================================ */
(function () {
  'use strict';

  var FRAME_COUNT = 152;
  // Кадры hero раздаются с бесплатного CDN (jsDelivr ← GitHub), WebP @1600px.
  // Исходник: github.com/stepanromanov333-gif/gsc-hero-cdn
  var FRAME_BASE  = 'https://cdn.jsdelivr.net/gh/stepanromanov333-gif/gsc-hero-cdn@main/hero-';
  var FRAME_EXT   = '.webp';

  var hero = document.getElementById('gscHero');
  if (!hero) return;
  var canvas  = document.getElementById('gscHeroCanvas');
  var ctx     = canvas.getContext('2d');
  var sticky  = hero.querySelector('.gsc-hero__sticky');
  var hint    = hero.querySelector('.gsc-hero__hint');
  var loader  = hero.querySelector('.gsc-hero__loader');
  var screens = [].slice.call(hero.querySelectorAll('.gsc-hero__screen'));

  // parse "in0,in1,out0,out1" bands once
  screens.forEach(function (s) {
    s._band = (s.getAttribute('data-band') || '0,0,1,1').split(',').map(parseFloat);
  });

  var images  = new Array(FRAME_COUNT);
  var loaded  = 0;
  var current = -1;
  // Mobile: lighten the load — fewer device pixels and only every 2nd frame.
  // render() falls back to the nearest decoded frame, so a sparse set still
  // scrubs smoothly while ~halving memory and network on phones.
  var MOBILE  = window.matchMedia('(max-width: 980px)').matches;
  var STEP    = MOBILE ? 2 : 1;
  var dpr     = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);

  function pad(n) { return n < 10 ? '00' + n : (n < 100 ? '0' + n : '' + n); }
  function frameURL(i) { return FRAME_BASE + pad(i + 1) + FRAME_EXT; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // trapezoid opacity for a screen across scroll progress
  function band(p, b) {
    if (p <= b[0] || p >= b[3]) return 0;
    if (p < b[1]) return (p - b[0]) / (b[1] - b[0]);
    if (p < b[2]) return 1;
    return 1 - (p - b[2]) / (b[3] - b[2]);
  }

  function preload() {
    var queue = [];
    for (var i = 0; i < FRAME_COUNT; i++) {
      if (STEP === 1 || i % STEP === 0 || i === FRAME_COUNT - 1) queue.push(i);
    }
    var total = queue.length;
    queue.forEach(function (idx) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        loaded++;
        if (loader) loader.style.width = (loaded / total * 100) + '%';
        if (idx === 0) { resize(); render(); }
        if (loaded === total && loader) loader.style.opacity = '0';
      };
      img.onerror = function () { loaded++; };
      img.src = frameURL(idx);
      images[idx] = img;
    });
  }

  function resize() {
    var w = sticky.clientWidth, h = sticky.clientHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    current = -1;
    currentP = targetP = progress();
    render(currentP);
  }

  function drawCover(img) {
    var cw = canvas.width, ch = canvas.height;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var scale = Math.max(cw / iw, ch / ih);
    var w = iw * scale, h = ih * scale;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  function progress() {
    var rect = hero.getBoundingClientRect();
    var total = hero.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    return clamp(-rect.top / total, 0, 1);
  }

  function render(p) {
    if (p == null || isNaN(p)) p = progress();

    // --- frame ---
    var idx = Math.round(p * (FRAME_COUNT - 1));
    var img = images[idx];
    if (!img || !img.complete) {           // skipped (mobile STEP) or not yet decoded
      for (var d = 1; d < FRAME_COUNT; d++) {
        if (images[idx - d] && images[idx - d].complete) { img = images[idx - d]; break; }
        if (images[idx + d] && images[idx + d].complete) { img = images[idx + d]; break; }
      }
    }
    if (img && img.complete && idx !== current) { drawCover(img); current = idx; }

    // --- story screens (smoothstep easing -> softer, classier fades) ---
    for (var i = 0; i < screens.length; i++) {
      var s = screens[i];
      var raw = band(p, s._band);
      var o = raw * raw * (3 - 2 * raw);   // smoothstep
      s.style.opacity = o;
      s.style.transform = 'translateY(' + ((1 - o) * 26) + 'px)';
      s.style.pointerEvents = raw > 0.6 ? 'auto' : 'none';
    }

    if (hint) hint.style.opacity = clamp(1 - p / 0.06, 0, 1);
  }

  // ---- inertial smoothing: the frame EASES toward the scroll position
  // instead of snapping to it — a fluid, scrubbed-film feel. The rAF loop
  // runs only while catching up, then idles (no battery drain). ----
  var targetP = 0, currentP = 0, rafActive = false;
  var SMOOTH  = 0.14;   // lower = silkier/slower, higher = snappier

  function tick() {
    targetP = progress();
    currentP += (targetP - currentP) * SMOOTH;
    if (Math.abs(targetP - currentP) < 0.0006) currentP = targetP;
    render(currentP);
    if (currentP !== targetP) requestAnimationFrame(tick);
    else rafActive = false;
  }
  function onScroll() {
    if (!rafActive) { rafActive = true; requestAnimationFrame(tick); }
  }

  // ---- section snap: hero -> gallery on a light scroll ----
  // snap target = first visible Tilda block after the hero (gallery),
  // resolved lazily so it works on every language page regardless of
  // when the script runs.
  function getGallery() {
    var rec = hero.closest ? hero.closest('.t-rec') : null;
    var n = rec ? rec.nextElementSibling : null;
    while (n) {
      if (n.classList && n.classList.contains('t-rec') &&
          getComputedStyle(n).display !== 'none') return n;
      n = n.nextElementSibling;
    }
    return document.getElementById('rec768348439');   // RU fallback
  }
  var snapping = false;
  var MENU_H = 103;

  function heroEndY() { return hero.offsetTop + hero.offsetHeight - window.innerHeight; }
  function galleryTargetY() {
    var gallery = getGallery();
    if (!gallery) return null;
    var top = gallery.getBoundingClientRect().top + window.scrollY;
    var avail = window.innerHeight - MENU_H;
    var pad = Math.max(0, (avail - gallery.offsetHeight) / 2);
    return Math.round(top - (MENU_H + pad));
  }

  // smooth animated scroll using plain scrollTo (no synthetic scroll events,
  // which would jerk Tilda's own scroll listeners)
  function animateScroll(to, dur, done) {
    var start = window.scrollY, change = to - start, t0 = null;
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = dur <= 0 ? 1 : Math.min(1, (ts - t0) / dur);
      window.scrollTo(0, Math.round(start + change * ease(p)));
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }

  function snapTo(y) {
    snapping = true;
    animateScroll(y, 700, function () { setTimeout(function () { snapping = false; }, 80); });
  }

  function onWheel(e) {
    if (!getGallery()) return;
    if (snapping) { e.preventDefault(); return; }
    var y = window.scrollY, hEnd = heroEndY(), gTarget = galleryTargetY();
    if (gTarget === null || gTarget <= hEnd) return;
    // DOWN: pinned fly-through just ended -> throw the page onto the gallery
    if (e.deltaY > 0 && y >= hEnd - 4 && y < gTarget - 4) {
      e.preventDefault();
      snapTo(gTarget);
    }
    // UP: resting on the gallery -> pull back to the hero's closing frame
    else if (e.deltaY < 0 && y <= gTarget + 4 && y > hEnd + 4) {
      e.preventDefault();
      snapTo(hEnd);
    }
  }
  window.addEventListener('wheel', onWheel, { passive: false });

  // Touch snap is intentionally DISABLED on phones. preventDefault() + an
  // animated scroll fought the device's native momentum scrolling and caused
  // a jerky "freeze & slide" (most noticeable when scrolling back UP). Native
  // touch scrolling through the hero is smooth on its own, so we leave it
  // alone — only the wheel-snap above (desktop, where there's no momentum)
  // stays active.

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize);

  // quick-skip button: jump straight to the services block (first block after hero).
  // Native smooth scrollTo (works even when rAF is throttled / tab unfocused).
  var skip = document.querySelector('.gsc-hero__skip');
  if (skip) skip.addEventListener('click', function (e) {
    e.preventDefault();
    var t = getGallery();
    if (t) window.scrollTo({ top: Math.round(t.getBoundingClientRect().top + window.scrollY - MENU_H - 8), behavior: 'smooth' });
  });

  resize();
  preload();
})();
