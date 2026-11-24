const $ = (id) => document.getElementById(id);
const english = ['BAY VILLAGE', 'COASTAL HIGHWAY', 'GOLDEN FIELDS', 'AUTUMN VALLEY', 'FOREST LAKE', 'MOUNTAIN PASS'];
const notes = ['往前开，去看看海。', '海风正好，慢一点也很好。', '沿着金色的田野，一直向前。', '听，风穿过树林的声音。', '拐进湖边，停下来坐一会儿。', '翻过山口，海湾就在远方。'];

export function createUI(regions, road, actions, mapPaths) {
  const app = $('app');
  let currentRegion = -1;
  let toastTimer;
  let announceTimer;
  const samples = mapPaths.flatMap((path) => path.points);
  const bounds = samples.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const buttons = {
    'start-button': 'start', 'camera-button': 'camera', 'cruise-button': 'cruise',
    'mood-button': 'mood', 'sound-button': 'sound', 'photo-button': 'photo',
    'pause-button': 'pause', 'open-map': 'map', 'map-button': 'map',
    'close-map': 'close', 'resume-button': 'resume', 'reset-button': 'reset',
    'hide-button': 'hide', 'exit-photo': 'photo', 'race-button': 'race',
    'garage-button': 'garage',
  };
  for (const [id, action] of Object.entries(buttons)) $(id).addEventListener('click', () => actions[action]());
  $('rev-track').innerHTML = '<i></i>'.repeat(22);
  $('destination-list').innerHTML = regions.map((region, i) => `<button class="destination" data-destination="${i}" style="--region-color:${region.color || '#e6ff78'}"><span class="destination-index">0${i + 1}</span><span class="destination-swatch"></span><span class="destination-copy"><strong>${region.name}</strong><small>${region.subtitle || english[i]}</small></span><span class="destination-arrow">↗</span></button>`).join('');
  $('destination-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-destination]');
    if (button) actions.travel(Number(button.dataset.destination));
  });

  function drawMap(canvas, state, large = false) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const margin = large ? 65 : 29;
    const scale = Math.min((width - margin * 2) / (bounds.maxX - bounds.minX), (height - margin * 2) / (bounds.maxZ - bounds.minZ));
    const project = (x, z) => [width / 2 + (x - (bounds.minX + bounds.maxX) / 2) * scale, height / 2 + (z - (bounds.minZ + bounds.maxZ) / 2) * scale];
    if (large) {
      ctx.strokeStyle = '#b2d5b30b'; ctx.lineWidth = 1;
      for (let x = 40; x < width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 25); ctx.lineTo(x, height - 25); ctx.stroke(); }
      for (let y = 40; y < height; y += 60) { ctx.beginPath(); ctx.moveTo(25, y); ctx.lineTo(width - 25, y); ctx.stroke(); }
    }
    const trace = (path) => {
      ctx.beginPath(); path.points.forEach((p, i) => { const xy = project(p.x, p.z); if (i) ctx.lineTo(...xy); else ctx.moveTo(...xy); });
      if (path.closed) ctx.closePath();
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const path of mapPaths) {
      trace(path); ctx.strokeStyle = '#061a2580'; ctx.lineWidth = path.kind === 'main' ? (large ? 18 : 12) : (large ? 9 : 5); ctx.stroke();
    }
    for (const path of mapPaths) {
      trace(path);
      ctx.strokeStyle = path.kind === 'trail' ? '#c6b88c' : path.kind === 'main' ? '#b3cbb2' : '#a9c4ae';
      ctx.lineWidth = path.kind === 'main' ? (large ? 5 : 4) : (large ? 3.6 : 2.2);
      ctx.setLineDash(path.kind === 'trail' ? (large ? [7, 4] : [3, 2]) : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const start = regions[i].t;
      const end = i === 5 ? regions[0].t + 1 : regions[i + 1].t;
      ctx.beginPath();
      for (let j = 0; j <= 35; j++) { const p = road.sample((start + (end - start) * j / 35) % 1).position; const xy = project(p.x, p.z); if (j) ctx.lineTo(...xy); else ctx.moveTo(...xy); }
      ctx.strokeStyle = regions[i].color || '#e6ff78'; ctx.globalAlpha = large ? 0.85 : 0.35; ctx.lineWidth = large ? 4 : 3; ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (large) regions.forEach((region, i) => {
      const p = road.sample(region.t).position; const [x, y] = project(p.x, p.z);
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fillStyle = '#1d3939'; ctx.fill(); ctx.strokeStyle = region.color || '#e6ff78'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#f4f6dc'; ctx.font = '500 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${i + 1}`, x, y);
    });
    const [x, y] = project(state.x, state.z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-state.heading);
    ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(-7, -8); ctx.lineTo(0, -4); ctx.lineTo(7, -8); ctx.closePath();
    ctx.fillStyle = '#e6ff78'; ctx.shadowColor = '#e6ff78'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
  }

  return {
    ready() { $('loading').classList.add('done'); setTimeout(() => { $('loading').hidden = true; }, 650); },
    start() { app.classList.remove('is-intro'); app.classList.add('is-playing'); $('world').focus({ preventScroll: true }); },
    update(state, { region, view, viewMode = 0, race }) {
      app.classList.toggle('is-cockpit', viewMode === 2);
      const speed = Math.abs(Math.round(state.speed * 3.6));
      $('speed').textContent = String(speed).padStart(3, '0');
      $('gear').textContent = String(state.gear);
      $('trip-distance').textContent = `${(state.distance / 1000).toFixed(1)} km`;
      $('view-label').textContent = view;
      const revs = Math.max(1, Math.round(state.rpm / 11000 * 22));
      Array.from($('rev-track').children).forEach((bar, i) => bar.classList.toggle('active', i < revs));
      $('cruise-state').classList.toggle('active', state.cruise);
      $('cruise-button').setAttribute('aria-pressed', String(state.cruise));
      const index = Math.max(0, regions.indexOf(region));
      if (index !== currentRegion) {
        if (currentRegion !== -1 && app.classList.contains('is-playing')) this.announce(region.name);
        currentRegion = index;
        $('region-name').textContent = region.name;
        $('intro-region').textContent = region.name;
        $('region-subtitle').textContent = english[index];
        $('region-hint').textContent = notes[index];
        document.querySelectorAll('.destination').forEach((node, i) => node.classList.toggle('current', i === index));
      }
      drawMap($('minimap'), state);
      if (!$('map-panel').hidden) drawMap($('large-map'), state, true);
      $('race-hud').hidden = !race;
      if (race) {
        $('race-position').textContent = `${race.position} / 4`;
        $('race-progress').textContent = `${Math.min(100, Math.floor(race.progress * 100))}% · ${race.elapsed.toFixed(1)}s`;
      }
    },
    screen(name, state) {
      $('map-panel').hidden = name !== 'map';
      $('pause-panel').hidden = name !== 'pause';
      if (name === 'map') { drawMap($('large-map'), state, true); $('close-map').focus(); }
      if (name === 'pause') $('resume-button').focus();
    },
    mood(value) { $('mood-label').textContent = value === 'sunset' ? '日落时分' : '午后晴空'; },
    car(name) { $('car-name').textContent = name; },
    sound(muted) { $('sound-icon').textContent = muted ? '♫' : '♪'; $('sound-button').style.opacity = muted ? '.45' : '1'; $('sound-button').setAttribute('aria-label', muted ? '开启声音' : '关闭声音'); },
    photo(value) { app.classList.toggle('is-photo', value); $('photo-hud').hidden = !value; },
    hide(value) { app.classList.toggle('hud-hidden', value); $('hidden-hint').hidden = !value; },
    transition(callback) { $('transition').classList.add('active'); setTimeout(() => { callback(); requestAnimationFrame(() => $('transition').classList.remove('active')); }, 330); },
    toast(message, duration = 2600) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible'); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), duration); },
    announce(name) { clearTimeout(announceTimer); $('region-announcement').querySelector('strong').textContent = name; $('region-announcement').classList.add('visible'); announceTimer = setTimeout(() => $('region-announcement').classList.remove('visible'), 3200); },
    finishRace(position, time) { $('pause-description').textContent = `第 ${position} 名 · ${time.toFixed(1)} 秒。接下来，继续沿着海岸兜风。`; this.screen('pause'); },
  };
}
