// 3D-визуализация прогнозов Лиги наций. Данные — matches.json (генерируется из Excel-таблицы).
// Стадион в стиле «Эмирейтс», ВЕЧЕР: прожекторы, закатное небо, ярко-зелёное поле с разметкой,
// парк и мостовая вокруг, анимированные карточки (3 в ряд по полю).
import * as THREE from 'three';

const LEAGUE_COLOR = { A: '#ffd97a', B: '#7ab8ff', C: '#7ddc9f', D: '#b8b8b8' };
const LEAGUE_NAME = { A: 'Лига A', B: 'Лига B', C: 'Лига C', D: 'Лига D' };
const IS_TOUCH = ('ontouchstart' in window) && navigator.maxTouchPoints > 0;
const CARD_W = IS_TOUCH ? 6.4 : 4.8, CARD_H = IS_TOUCH ? 3.9 : 3.0;
const CAM_R = IS_TOUCH ? 52 : 46;

function confColor(c) { return c >= 70 ? '#39d98a' : (c >= 50 ? '#e8c84a' : '#e05a4a'); }

// ---------- Данные ----------
const matches = await (await fetch('./matches.json')).json();

// ---------- Блок точности ----------
(function accuracy() {
  const played = matches.filter(m => m.result);
  const ok = played.filter(m => m.correct);
  const accval = document.getElementById('accval');
  const accdetail = document.getElementById('accdetail');
  if (!played.length) {
    accval.textContent = '—';
    accdetail.textContent = `(ещё нет сыгранных матчей · проверено 0 из ${matches.length})`;
  } else {
    accval.textContent = Math.round(ok.length / played.length * 100) + '%';
    accdetail.textContent = `(${ok.length} из ${played.length} верно · всего ${matches.length} прогнозов)`;
  }
})();

// ---------- Сцена ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const SKY = 0x1b2a4a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0x27395c, 180, 560);

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
const camState = {
  theta: 0.6, phi: IS_TOUCH ? 0.8 : 0.85,
  radius: CAM_R,
  target: new THREE.Vector3(0, 2, 0),
  want: null,
};
function applyCamera() {
  if (camState.want) {
    const w = camState.want, k = 0.06;
    camState.target.lerp(w.target, k);
    camState.radius += (w.radius - camState.radius) * k;
    if (camState.target.distanceTo(w.target) < 0.15 && Math.abs(camState.radius - w.radius) < 0.3) {
      camState.want = null;
    }
  }
  const { theta, phi, radius, target } = camState;
  camera.position.set(
    target.x + radius * Math.sin(phi) * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(target);
}
function autoFrame() {
  const vis = cards.filter(c => c.visible);
  if (!vis.length) { camState.want = { target: new THREE.Vector3(0, 2, 0), radius: CAM_R }; return; }
  const box = new THREE.Box3();
  vis.forEach(c => box.expandByPoint(c.position));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const spread = Math.max(size.x, size.z);
  const radius = Math.min(95, Math.max(24, spread * 0.95 + 14));
  camState.want = { target: new THREE.Vector3(center.x, 1, center.z), radius };
}

// ---------- Управление ----------
let userMoved = false;
const mouse = new THREE.Vector2(-10, -10);
let dragging = false, px = 0, py = 0;
canvas.addEventListener('mousedown', e => { dragging = true; px = e.clientX; py = e.clientY; });
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (!dragging) return;
  camState.theta -= (e.clientX - px) * 0.005;
  camState.phi = Math.min(1.25, Math.max(0.3, camState.phi - (e.clientY - py) * 0.004));
  px = e.clientX; py = e.clientY;
  userMoved = true; camState.want = null;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  camState.radius = Math.min(220, Math.max(20, camState.radius + e.deltaY * 0.03));
  userMoved = true; camState.want = null;
}, { passive: false });

const touches = new Map();
let pinchPrev = 0, movedDuringDrag = false, lastTap = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  movedDuringDrag = false;
  for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
  if (e.touches.length === 2) {
    pinchPrev = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);
  }
  const now = Date.now();
  if (e.touches.length === 1 && now - lastTap < 320) {
    doubleTap(e.touches[0].clientX, e.touches[0].clientY);
    lastTap = 0;
  } else if (e.touches.length === 1) {
    lastTap = now;
  }
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const prev = touches.get(t.identifier) || { x: t.clientX, y: t.clientY };
    const dx = t.clientX - prev.x, dy = t.clientY - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedDuringDrag = true;
    camState.theta -= dx * 0.006;
    camState.phi = Math.min(1.25, Math.max(0.3, camState.phi - dy * 0.005));
    touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    userMoved = true; camState.want = null;
  } else if (e.touches.length === 2) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);
    if (pinchPrev > 0) {
      camState.radius = Math.min(220, Math.max(20, camState.radius * pinchPrev / Math.max(1, d)));
      userMoved = true; camState.want = null;
    }
    pinchPrev = d;
    movedDuringDrag = true;
  }
}, { passive: false });
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  for (const t of e.changedTouches) touches.delete(t.identifier);
  pinchPrev = 0;
  if (!movedDuringDrag && e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(cards.filter(c => c.visible))[0];
    if (hit) showPanel(hit.object.userData.match);
  }
}, { passive: false });

function doubleTap(x, y) {
  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = (y / window.innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(cards.filter(c => c.visible))[0];
  if (hit) {
    camState.want = { target: hit.object.position.clone(), radius: 14 };
  } else if (camState.radius < 40) {
    autoFrame();
  } else {
    camState.want = { target: new THREE.Vector3(0, 2, 0), radius: CAM_R };
  }
  userMoved = true;
}

// ---------- Свет: вечер, освещают прожекторы ----------
scene.add(new THREE.AmbientLight(0x44557a, 0.6));
const dusk = new THREE.DirectionalLight(0x5a6d94, 0.28); // остаточный свет заката
dusk.position.set(-80, 50, -60);
scene.add(dusk);

// ---------- Небо: закатный градиент + первые звёзды ----------
(function sky() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0a1428');
  grad.addColorStop(0.5, '#1b2c4e');
  grad.addColorStop(0.78, '#3a4a72');
  grad.addColorStop(1, '#8a5a3e'); // тёплая полоса заката у горизонта
  g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(560, 24, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  const starGeo = new THREE.BufferGeometry();
  const pos = [];
  for (let i = 0; i < 380; i++) {
    const a = Math.random() * Math.PI * 2;
    const el = Math.random() * Math.PI * 0.45 + 0.10;
    const r = 540;
    pos.push(r * Math.cos(el) * Math.sin(a), r * Math.sin(el), r * Math.cos(el) * Math.cos(a));
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcfd8ee, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.55,
  }));
  scene.add(stars);
})();

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(234,242,255,.5)');
  grad.addColorStop(1, 'rgba(234,242,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- Прожекторные мачты (основной свет вечера) ----------
function buildFloodlight(angle) {
  const r = 84, x = r * Math.sin(angle), z = r * Math.cos(angle);
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.75, 34, 8),
    new THREE.MeshLambertMaterial({ color: 0x4a5563 })
  );
  pole.position.y = 17;
  group.add(pole);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.1, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xf4f8ff })
  );
  head.position.y = 34;
  head.lookAt(x, 0, z); // разворачиваем плафон к полю
  head.position.set(0, 34, 0);
  group.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xeaf2ff, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  glow.scale.setScalar(17);
  glow.position.y = 34;
  group.add(glow);
  const p = new THREE.PointLight(0xdfeaff, 95, 230, 1.5);
  p.position.y = 31;
  group.add(p);
  group.position.set(x, 0, z);
  scene.add(group);
}
[0.5, Math.PI / 2 + 0.5, Math.PI + 0.5, 1.5 * Math.PI + 0.5].forEach(buildFloodlight);

// ---------- Мостовая вокруг стадиона ----------
function makeGroundTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#565b61'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = ['#51565c', '#5b6066', '#4d5257', '#60656b'][(Math.random() * 4) | 0];
    g.globalAlpha = 0.5 + Math.random() * 0.5;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  // швы плит
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(40,44,48,.5)'; g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 24);
  return t;
}
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(520, 48),
  new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.15;
scene.add(ground);

// ---------- Поле 105×68: ярко-зелёный газон с полной разметкой ----------
function makePitchTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 664;
  const g = c.getContext('2d');
  // полосы кошения
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#2e9440' : '#33a347'; g.fillRect(i * 64, 0, 64, 664); }
  // лёгкий шум травы
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,60,20,.08)' : 'rgba(220,255,220,.05)';
    g.fillRect(Math.random() * 1024, Math.random() * 664, 2, 3);
  }
  // разметка
  g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4;
  g.fillStyle = 'rgba(255,255,255,.95)';
  const X = 28, Y = 28, W = 968, H = 608, CX = 512, CY = 332;
  g.strokeRect(X, Y, W, H);                       // периметр
  g.beginPath(); g.moveTo(CX, Y); g.lineTo(CX, Y + H); g.stroke();  // центральная линия
  g.beginPath(); g.arc(CX, CY, 92, 0, Math.PI * 2); g.stroke();     // центральный круг
  g.beginPath(); g.arc(CX, CY, 5, 0, Math.PI * 2); g.fill();        // центральная точка
  // штрафные и вратарские
  g.strokeRect(X, 182, 150, 300); g.strokeRect(X + W - 150, 182, 150, 300);
  g.strokeRect(X, 257, 56, 150); g.strokeRect(X + W - 56, 257, 56, 150);
  // точки пенальти
  g.beginPath(); g.arc(X + 110, CY, 4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(X + W - 110, CY, 4, 0, Math.PI * 2); g.fill();
  // дуги штрафной
  g.beginPath(); g.arc(X + 110, CY, 92, -0.64, 0.64); g.stroke();
  g.beginPath(); g.arc(X + W - 110, CY, 92, Math.PI - 0.64, Math.PI + 0.64); g.stroke();
  // угловые дуги
  g.beginPath(); g.arc(X, Y, 14, 0, Math.PI / 2); g.stroke();
  g.beginPath(); g.arc(X + W, Y, 14, Math.PI / 2, Math.PI); g.stroke();
  g.beginPath(); g.arc(X + W, Y + H, 14, Math.PI, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.arc(X, Y + H, 14, Math.PI * 1.5, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// BasicMaterial: газон всегда яркий, «под светом прожекторов»
const pitch = new THREE.Mesh(
  new THREE.PlaneGeometry(105, 68),
  new THREE.MeshBasicMaterial({ map: makePitchTexture() })
);
pitch.rotation.x = -Math.PI / 2;
pitch.position.y = 0;
scene.add(pitch);

// ---------- Текстуры толпы, табло и вывески ----------
function makeCrowdTexture() {
  // Красные сиденья «Эмирейтс» с редкими светлыми вкраплениями болельщиков
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7a1f24'; g.fillRect(0, 0, 512, 64);
  const colors = ['#8f2f2f', '#a03a3a', '#6e1d22', '#e8e8e8', '#d8d8d8', '#5a181c'];
  for (let i = 0; i < 900; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.globalAlpha = 0.55 + Math.random() * 0.45;
    const r = 1 + Math.random() * 1.8;
    g.beginPath();
    g.arc(Math.random() * 512, 4 + Math.random() * 56, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
const crowdTex = makeCrowdTexture();

function makeLedTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#101820'; g.fillRect(0, 0, 1024, 48);
  g.fillStyle = '#ffffff'; g.font = 'bold 30px Segoe UI';
  g.textBaseline = 'middle';
  const msg = 'ПРОГНОЗЫ ЛИГИ НАЦИЙ · 12–15 НОЯБРЯ 2026 · ';
  g.fillText(msg + msg + msg, 8, 26);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  return t;
}

function makeFacadeSign() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 64);
  g.fillStyle = '#ffffff'; g.font = 'bold 44px Segoe UI';
  g.textBaseline = 'middle';
  const msg = 'ПРОГНОЗЫ ЛИГИ НАЦИЙ 3D   ·   ';
  g.fillText(msg + msg, 8, 34);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- Стадион «Эмирейтс»: овальная чаша, стеклянный фасад, белый каркас ----------
(function stadium() {
  const bowl = new THREE.Group();
  bowl.scale.z = 0.9; // овал

  // Рекламное кольцо у газона
  const led = new THREE.Mesh(
    new THREE.CylinderGeometry(63.5, 63.5, 1.1, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: makeLedTexture(), side: THREE.DoubleSide })
  );
  led.position.y = 0.55;
  bowl.add(led);

  // Красные кольца трибун: 8 крутых ступеней от r=64 до r=90
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const r = 64 + i * 3.75;
    crowdTex.repeat.set(Math.round(r / 2.2), 1);
    const step = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 1.45, 64, 1, true),
      new THREE.MeshLambertMaterial({ map: crowdTex, side: THREE.DoubleSide })
    );
    step.position.y = 0.7 + i * 1.45;
    bowl.add(step);
  }

  // Внутренняя стена за верхним рядом
  const innerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(90.8, 90.8, 2.8, 64, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x9aa4b2, side: THREE.DoubleSide })
  );
  innerWall.position.y = 12.2;
  bowl.add(innerWall);

  // Крыша: полупрозрачное белое кольцо над трибунами, открытый центр над полем
  const roof = new THREE.Mesh(
    new THREE.RingGeometry(56, 96.5, 64),
    new THREE.MeshLambertMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
  );
  roof.rotation.x = -Math.PI / 2;
  roof.position.y = 13.6;
  bowl.add(roof);

  // Белый каркас крыши: внешнее и внутреннее кольца + спицы
  const trussMat = new THREE.MeshLambertMaterial({ color: 0xe8edf3 });
  const outerTruss = new THREE.Mesh(new THREE.TorusGeometry(95.5, 0.7, 8, 64), trussMat);
  outerTruss.rotation.x = Math.PI / 2;
  outerTruss.position.y = 13.6;
  bowl.add(outerTruss);
  const innerTruss = new THREE.Mesh(new THREE.TorusGeometry(56.5, 0.55, 8, 64), trussMat);
  innerTruss.rotation.x = Math.PI / 2;
  innerTruss.position.y = 13.6;
  bowl.add(innerTruss);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 39, 6), trussMat);
    spoke.rotation.z = Math.PI / 2;          // ось вдоль X
    spoke.rotation.y = Math.PI / 2 - a;      // радиально от центра
    const mid = (56.5 + 95.5) / 2;
    spoke.position.set(mid * Math.sin(a), 13.45, mid * Math.cos(a));
    bowl.add(spoke);
  }

  // Внешняя стена: стеклянный цилиндр
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(97, 97, 13, 64, 1, true),
    new THREE.MeshPhongMaterial({ color: 0x7e94a8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, shininess: 90 })
  );
  glass.position.y = 6.5;
  bowl.add(glass);

  // Вертикальные мullионы фасада
  const mullMat = new THREE.MeshLambertMaterial({ color: 0xaab4be });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 13, 0.4), mullMat);
    m.position.set(97.3 * Math.sin(a), 6.5, 97.3 * Math.cos(a));
    bowl.add(m);
  }

  // Бордовый верхний пояс
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(97.8, 97.8, 3.2, 64, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x4a1a20, side: THREE.DoubleSide })
  );
  band.position.y = 12.1;
  bowl.add(band);

  // Вывеска на поясе
  const sign = new THREE.Mesh(
    new THREE.CylinderGeometry(98.2, 98.2, 2.0, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: makeFacadeSign(), transparent: true, side: THREE.FrontSide })
  );
  sign.position.y = 12.1;
  bowl.add(sign);

  // Белый верхний обод
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(97.8, 0.8, 8, 64), trussMat);
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 13.9;
  bowl.add(topRing);

  // Цоколь: только стенка по внешнему краю и узкая полка — НЕ накрываем поле
  const plinthSide = new THREE.Mesh(
    new THREE.CylinderGeometry(99.6, 100.6, 1.2, 64, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x7e8894, side: THREE.DoubleSide })
  );
  plinthSide.position.y = 0.45;
  bowl.add(plinthSide);
  const plinthTop = new THREE.Mesh(
    new THREE.RingGeometry(97.5, 100.4, 64),
    new THREE.MeshLambertMaterial({ color: 0x99a3ad, side: THREE.DoubleSide })
  );
  plinthTop.rotation.x = -Math.PI / 2;
  plinthTop.position.y = 1.05;
  bowl.add(plinthTop);

  // Плита под стадионом
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(101, 103, 0.5, 64),
    new THREE.MeshLambertMaterial({ color: 0x6e7883 })
  );
  plate.position.y = -0.26;
  bowl.add(plate);

  scene.add(bowl);
})();

// ---------- Парк: деревья и аллея фонарей ----------
(function park() {
  const TREES = 170;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6);
  const crownGeo = new THREE.ConeGeometry(2.4, 6, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2e2318 });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x1d4023 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, TREES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < TREES; i++) {
    const a = Math.random() * Math.PI * 2;
    // часть деревьев — ближе к входу, часть — дальние аллеи
    const r = (i % 3 === 0) ? 108 + Math.random() * 45 : 108 + Math.random() * 210;
    const sc = 0.8 + Math.random() * 1.6;
    v.set(r * Math.sin(a), 1.3 * sc - 0.1, r * Math.cos(a));
    s.set(sc, sc, sc);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    m.compose(v, q, s);
    trunks.setMatrixAt(i, m);
    v.y = (2.6 + 3) * sc * 0.82;
    m.compose(v, q, s);
    crowns.setMatrixAt(i, m);
  }
  scene.add(trunks); scene.add(crowns);

  // Аллея фонарей вокруг стадиона — вечером светятся
  const lampGlow = makeGlowTexture();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 106;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 4.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a424c })
    );
    pole.position.set(r * Math.sin(a), 2.2, r * Math.cos(a));
    scene.add(pole);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: lampGlow, color: 0xffd9a0, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    glow.scale.setScalar(3.4);
    glow.position.set(r * Math.sin(a), 4.6, r * Math.cos(a));
    scene.add(glow);
  }
})();

// ---------- Карточки: крупные, 3 в ряд, богатые анимации ----------
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function makeCardTexture(m) {
  const W = 1024, H = 632;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const accent = LEAGUE_COLOR[m.league];
  const ccol = confColor(m.confidence);
  g.fillStyle = '#0e2018'; roundRect(g, 8, 8, W - 16, H - 16, 40); g.fill();
  // рамка карточки: зелёная — прогноз верен, красная — мимо, обычная — матч ещё не сыгран
  const frameCol = m.result ? (m.correct ? '#39d98a' : '#e05a4a') : '#2e5a48';
  g.strokeStyle = frameCol; g.lineWidth = m.result ? 16 : 4;
  roundRect(g, 8, 8, W - 16, H - 16, 40); g.stroke();
  g.fillStyle = accent; g.fillRect(8, 8, W - 16, 14);
  g.textAlign = 'center';
  const [home, away] = m.match.split(' — ');
  const totTxt = m.total ? `${m.total.pick} · ${m.total.conf}%` : 'нет данных';
  if (IS_TOUCH) {
    g.fillStyle = '#9ec7b2'; g.font = '40px Segoe UI';
    g.fillText(`${m.date} · ${m.time}`, W / 2, 76);
    g.fillStyle = '#ffffff'; g.font = 'bold 62px Segoe UI';
    g.fillText(home, W / 2, 168);
    g.fillText(away, W / 2, 250);
    g.fillStyle = m.result ? (m.correct ? '#39d98a' : '#e05a4a') : '#ffd97a'; g.font = 'bold 150px Segoe UI';
    g.fillText(m.result || m.score, W / 2, 442);
    g.fillStyle = ccol; roundRect(g, 142, 486, 740, 30, 15); g.fill();
    g.fillStyle = '#0e2018'; g.font = 'bold 24px Segoe UI';
    g.fillText(`УВЕРЕННОСТЬ ${m.confidence}%`, W / 2, 508);
    g.fillStyle = '#8fd3ff'; g.font = 'bold 40px Segoe UI';
    g.fillText(`ТОТАЛ ${totTxt}`, W / 2, 574);
    if (m.result) {
      g.fillStyle = m.correct ? '#39d98a' : '#e05a4a'; g.font = 'bold 30px Segoe UI';
      g.fillText(m.correct ? '✓ ПРОГНОЗ ВЕРЕН' : '✗ ПРОГНОЗ МИМО', W / 2, 616);
    }
  } else {
    g.fillStyle = '#9ec7b2'; g.font = '40px Segoe UI';
    g.fillText(`${m.date} · ${m.time} МСК`, W / 2, 84);
    g.fillStyle = '#ffffff'; g.font = 'bold 60px Segoe UI';
    g.fillText(home, W / 2, 172);
    g.fillStyle = '#6f9c86'; g.font = 'bold 42px Segoe UI'; g.fillText('—', W / 2, 228);
    g.fillStyle = '#ffffff'; g.font = 'bold 60px Segoe UI';
    g.fillText(away, W / 2, 290);
    g.fillStyle = m.result ? (m.correct ? '#39d98a' : '#e05a4a') : '#ffd97a'; g.font = 'bold 128px Segoe UI';
    g.fillText(m.result || m.score, W / 2, 448);
    if (m.result) {
      g.fillStyle = m.correct ? '#39d98a' : '#e05a4a'; g.font = '26px Segoe UI';
      g.fillText(m.correct ? '✓ прогноз верен' : '✗ прогноз мимо', W / 2, 490);
    }
    g.fillStyle = '#dcf2e6'; g.font = m.result ? '30px Segoe UI' : '38px Segoe UI';
    g.fillText(`${m.forecast} · ${m.confidence}%`, W / 2, 528);
    g.fillStyle = '#1a3328'; roundRect(g, 212, 548, 600, 20, 10); g.fill();
    g.fillStyle = ccol; roundRect(g, 212, 548, 600 * m.confidence / 100, 20, 10); g.fill();
    g.fillStyle = '#7fa892'; g.font = '24px Segoe UI';
    g.fillText(`тотал: ${totTxt} · прогноз от ${m.madeAt}`, W / 2, 606);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

const cards = [];
// 3 колонки × 12 рядов на всём поле, крупные карточки
const GRID_X = [-30, 0, 30];
const GRID_Z = [-33, -27, -21, -15, -9, -3, 3, 9, 15, 21, 27, 33];
const gridCells = [];
GRID_Z.forEach(z => GRID_X.forEach(x => gridCells.push([x, z])));

matches.forEach((m, i) => {
  const [gx, gz] = gridCells[i % gridCells.length];
  const jx = gx + (Math.random() - 0.5) * 1.4;
  const jz = gz + (Math.random() - 0.5) * 1.1;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: makeCardTexture(m), transparent: true, opacity: 0 })
  );
  mesh.position.set(jx, 0.3, jz); // стартуют у земли, поднимаются при появлении
  mesh.scale.setScalar(0.01);
  mesh.userData = {
    match: m,
    baseY: CARD_H / 2 + 0.6,
    phase: Math.random() * Math.PI * 2,
    appearAt: 0.15 + i * 0.045, // каскадное появление
    appeared: false,
    baseScale: 1,
  };
  scene.add(mesh);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(m.result ? (m.correct ? '#39d98a' : '#e05a4a') : LEAGUE_COLOR[m.league]),
      transparent: true, opacity: 0
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(jx, 0.02, jz);
  scene.add(glow);
  mesh.userData.glow = glow;
  cards.push(mesh);
});

// ---------- Фильтры ----------
const filters = { league: 'ALL', day: 'ALL' };
function applyFilters(withAutoFrame = true) {
  cards.forEach(card => {
    const m = card.userData.match;
    const vis = (filters.league === 'ALL' || m.league === filters.league) &&
                (filters.day === 'ALL' || m.date === filters.day);
    card.visible = vis;
    if (card.userData.glow) card.userData.glow.visible = vis;
  });
  document.querySelectorAll('.fbtn').forEach(b =>
    b.classList.toggle('active', filters[b.dataset.type] === b.dataset.f));
  if (withAutoFrame) autoFrame();
}
document.querySelectorAll('.fbtn').forEach(b => b.addEventListener('click', () => {
  filters[b.dataset.type] = b.dataset.f;
  applyFilters();
}));

// ---------- Составы ----------
function formationRows(lu) {
  return [
    { players: [lu.gk], y: 88 },
    { players: lu.def, y: 68 },
    { players: lu.mid, y: 45 },
    { players: lu.fwd, y: 22 },
  ];
}
function lineupHTML(team, lu, away) {
  if (!lu) return `<h3>${team}</h3><div class="nodata">нет данных — стартовый состав появится за час до матча</div>`;
  const rows = formationRows(lu);
  const dots = rows.map(r => {
    const n = r.players.length;
    return r.players.map((p, i) => {
      const x = n === 1 ? 50 : 12 + (76 / (n - 1)) * i;
      return `<div class="pl${away ? ' away' : ''}" style="left:${x}%;top:${r.y}%"><i></i><span>${p}</span></div>`;
    }).join('');
  }).join('');
  return `<h3>${team}</h3><div class="scheme">${lu.scheme || ''}</div>
    <div class="pitch-mini">${dots}</div>
    <div class="src">${lu.note || ''}</div>`;
}

// ---------- Панель ----------
const panel = document.getElementById('panel');
const overlay = document.getElementById('overlay');
function closePanel() { panel.classList.remove('open'); overlay.classList.remove('open'); }
overlay.addEventListener('click', closePanel);

function showPanel(m) {
  const [home, away] = m.match.split(' — ');
  const was = m.was;
  const wasBox = was ? `
    <div class="wasbox"><div class="wtitle">История прогноза: было → стало</div>
    <div class="wasrow"><span class="wlab">Прогноз</span><span class="wval"><span class="old">${was.forecast} · ${was.confidence}%</span> → <span class="new">${m.forecast} · ${m.confidence}%</span></span></div>
    <div class="wasrow"><span class="wlab">Счёт</span><span class="wval"><span class="old">${was.score}</span> → <span class="new">${m.score}</span></span></div></div>
  ` : '';
  const lu = m.lineups || {};
  const totBox = m.total ? `
    <div class="sect">Тотал 2.5</div>
    <div class="forecast">Ставка: <b>${m.total.pick}</b> · уверенность ${m.total.conf}%</div>
    <div class="bar"><i style="width:${m.total.conf}%;background:${confColor(m.total.conf)}"></i></div>
    <div class="reason">${m.total.why}</div>` : '';
  panel.innerHTML = `
    <div class="pclosebar"><span id="pclose">✕ Закрыть</span></div>
    <div class="meta">${home} — ${away} · ${m.date}, ${m.time} МСК · ${LEAGUE_NAME[m.league]}</div>
    <div class="madeat">Прогноз сделан: ${m.madeAt}</div>
    <div class="score">${m.result || m.score}</div>
    ${m.result ? `<div class="forecast" style="color:${m.correct ? '#39d98a' : '#e05a4a'}">Итог: ${m.result} · ${m.correct ? 'прогноз верен ✓' : 'прогноз мимо ✗'}</div>` : ''}
    <div class="forecast">${m.forecast} · уверенность ${m.confidence}%</div>
    <div class="bar"><i style="width:${m.confidence}%;background:${confColor(m.confidence)}"></i></div>
    ${totBox}
    <div class="sect">Расстановка</div>
    <div class="lineups">
      <div class="lu">${lineupHTML(home, lu.home, false)}</div>
      <div class="lu">${lineupHTML(away, lu.away, true)}</div>
    </div>
    <div class="sect">Почему так</div>
    <div class="reason">${m.reason}</div>
    ${wasBox}`;
  panel.classList.add('open');
  overlay.classList.add('open');
  document.getElementById('pclose').onclick = closePanel;
}

// ---------- Клик мышью ----------
const ray = new THREE.Raycaster();
let hovered = null;
canvas.addEventListener('click', e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(cards.filter(c => c.visible))[0];
  if (hit) showPanel(hit.object.userData.match);
});

// ---------- Resize ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------- Цикл: каскад появления, подъём с земли, покачивание, пульс свечения ----------
const clock = new THREE.Clock();
let idleT = 0;
function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  cards.forEach(c => {
    const u = c.userData;
    // каскадное появление
    if (!u.appeared) {
      if (t >= u.appearAt) {
        u.appeared = true;
        u.bornAt = t;
      }
      return;
    }
    const age = Math.min(1, (t - u.bornAt) / 0.6);
    const rise = 1 - Math.pow(1 - Math.min(1, age * 1.5), 3); // подъём с земли с пружинкой
    const pop = 1 + Math.sin(age * Math.PI) * 0.10;            // лёгкий "выстрел" масштаба
    const breathe = 1 + Math.sin(t * 1.4 + u.phase) * 0.025;   // дыхание
    const hoverTarget = (!IS_TOUCH && hovered === c) ? 1.14 : 1;
    u.baseScale += (hoverTarget - u.baseScale) * 0.15;
    const s = Math.max(0.01, age * pop * breathe * u.baseScale);
    c.scale.setScalar(s);
    c.material.opacity = age;
    // парение + остаток подъёма
    c.position.y = u.baseY * rise + Math.sin(t * 1.3 + u.phase) * 0.14;
    // покачивание: повороты вокруг вертикали и лёгкий крен
    c.rotation.y = camState.theta + Math.sin(t * 0.8 + u.phase) * 0.07;
    c.rotation.z = Math.sin(t * 1.1 + u.phase) * 0.03;
    if (u.glow) {
      // пульс свечения у земли
      u.glow.material.opacity = (0.10 + 0.06 * Math.sin(t * 2.1 + u.phase)) * age;
      u.glow.scale.setScalar(Math.max(0.01, s));
    }
  });
  if (!IS_TOUCH) {
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(cards.filter(c => c.visible && c.userData.appeared))[0];
    hovered = hit ? hit.object : null;
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
  }
  // плавное "плывущее" дыхание камеры в простое
  idleT += 0.016;
  if (!userMoved && !camState.want) camState.target.y = 2 + Math.sin(idleT * 0.5) * 0.8;
  applyCamera();
  renderer.render(scene, camera);
}
applyFilters(!IS_TOUCH);
tick();
