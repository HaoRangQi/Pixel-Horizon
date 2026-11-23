const $ = (id) => document.getElementById(id);
const english = ['BAY VILLAGE', 'COASTAL HIGHWAY', 'GOLDEN FIELDS', 'AUTUMN VALLEY', 'FOREST LAKE', 'MOUNTAIN PASS'];
const notes = ['往前开，去看看海。', '海风正好，慢一点也很好。', '沿着金色的田野，一直向前。', '听，风穿过树林的声音。', '拐进湖边，停下来坐一会儿。', '翻过山口，海湾就在远方。'];

export function createUI(regions, road, actions) {
  const app = $('app');
  let currentRegion = -1;
  let toastTimer;
  let announceTimer;
  let navView = null;
  const samples = Array.from({ length: 400 }, (_, i) => road.sample(i / 400).position);
  const bounds = samples.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const buttons = {
    'start-button': 'start', 'camera-button': 'camera', 'cruise-button': 'cruise',
    'mood-button': 'mood', 'sound-button': 'sound', 'photo-button': 'photo',
    'pause-button': 'pause', 'open-map': 'map', 'map-button': 'map',
    'close-map': 'close', 'resume-button': 'resume', 'reset-button': 'reset',
    'hide-button': 'hide', 'exit-photo': 'photo', 'race-button': 'race',
    'garage-button': 'garage', 'clear-goal': 'clearGoal', 'autopilot-button': 'autopilot',
  };
  for (const [id, action] of Object.entries(buttons)) $(id).addEventListener('click', () => actions[action]());
  $('rev-track').innerHTML = '<i></i>'.repeat(22);
  $('destination-list').innerHTML = regions.map((region, i) => `<div class="destination-row"><button class="destination" data-destination="${i}" style="--region-color:${region.color || '#e6ff78'}"><span class="destination-index">0${i + 1}</span><span class="destination-swatch"></span><span class="destination-copy"><strong>${region.name}</strong><small>${region.subtitle || english[i]}</small></span><span class="destination-arrow">↗</span></button><button class="destination-goal" data-goal="${i}" title="把 ${region.name} 设为导航终点" aria-label="导航到 ${region.name}">◎</button></div>`).join('');
  $('destination-list').addEventListener('click', (event) => {
    const goal = event.target.closest('[data-goal]');
    if (goal) { actions.goal(Number(goal.dataset.goal)); return; }
    const button = event.target.closest('[data-destination]');
    if (button) actions.travel(Number(button.dataset.destination));
  });

  function drawNavigation(ctx, project, large, nav) {
    const points = nav.points || [];
    const start = Math.max(0, Math.min(points.length - 1, nav.startIndex || 0));
    if (points.length > 1 && nav.remaining > 1) {
      const trace = () => {
        ctx.beginPath();
        for (let i = start; i < points.length; i++) {
          const [x, y] = project(points[i].x, points[i].z);
          if (i === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      };
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      trace(); ctx.strokeStyle = '#e6ff7833'; ctx.lineWidth = large ? 16 : 10; ctx.stroke();
      trace(); ctx.strokeStyle = '#e6ff78'; ctx.lineWidth = large ? 5 : 3.5;
      ctx.shadowColor = '#e6ff78'; ctx.shadowBlur = large ? 18 : 10; ctx.stroke();
      ctx.restore();
    }
    const destination = nav.destination;
    if (!destination) return;
    const [x, y] = project(destination.x, destination.z);
    const r = large ? 10 : 7;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r + (large ? 8 : 5), 0, Math.PI * 2);
    ctx.strokeStyle = '#e6ff7855'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#142b2b'; ctx.fill(); ctx.strokeStyle = '#e6ff78'; ctx.lineWidth = large ? 3 : 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, large ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fillStyle = '#e6ff78'; ctx.fill();
    const flagTop = y - r - (large ? 15 : 10);
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x, flagTop);
    ctx.strokeStyle = '#e6ff78'; ctx.lineWidth = large ? 2 : 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, flagTop); ctx.lineTo(x + (large ? 13 : 9), flagTop + (large ? 5 : 3.5)); ctx.lineTo(x, flagTop + (large ? 10 : 7)); ctx.closePath();
    ctx.fillStyle = '#e6ff78'; ctx.fill();
    ctx.restore();
  }

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
    const path = () => {
      ctx.beginPath(); samples.forEach((p, i) => { const xy = project(p.x, p.z); if (i) ctx.lineTo(...xy); else ctx.moveTo(...xy); }); ctx.closePath();
    };
    path(); ctx.strokeStyle = '#061a2580'; ctx.lineWidth = large ? 18 : 12; ctx.lineJoin = 'round'; ctx.stroke();
    path(); ctx.strokeStyle = large ? '#90ae9e80' : '#edf3d9a0'; ctx.lineWidth = large ? 5 : 4; ctx.stroke();
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
    if (navView && navView.active) drawNavigation(ctx, project, large, navView);
    const [x, y] = project(state.x, state.z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-state.heading);
    ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(-7, -8); ctx.lineTo(0, -4); ctx.lineTo(7, -8); ctx.closePath();
    ctx.fillStyle = '#e6ff78'; ctx.shadowColor = '#e6ff78'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
  }

  return {
    ready() { $('loading').classList.add('done'); setTimeout(() => { $('loading').hidden = true; }, 650); },
    start() { app.classList.remove('is-intro'); app.classList.add('is-playing'); $('world').focus({ preventScroll: true }); },
    update(state, { region, view, viewMode = 0, race, navigation, autopilot }) {
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
      $('autopilot-state').classList.toggle('active', !!autopilot?.engaged);
      $('autopilot-button').setAttribute('aria-pressed', String(!!autopilot?.engaged));
      if (autopilot?.engaged) $('autopilot-label').textContent = autopilot.source === 'llm' ? '自动驾驶 · LLM' : autopilot.source === 'fallback' ? '自动驾驶 · 回退本地' : '自动驾驶 · 本地规划';
      navView = navigation && navigation.active ? navigation : null;
      if (navView) {
        $('nav-state').hidden = false;
        $('nav-state').textContent = navView.passed
          ? `已抵达 · ${navView.destination.label}`
          : `导航 · ${navView.destination.label} · ${(navView.remaining / 1000).toFixed(1)} km`;
      } else $('nav-state').hidden = true;
      $('clear-goal').hidden = !navView;
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
