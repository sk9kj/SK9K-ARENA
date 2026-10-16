const $ = (id) => document.getElementById(id);
const authScreen = $('authScreen'), gameScreen = $('gameScreen');
let authMode = 'login', token = '', user = null, ws = null, state = null, selfId = null;
let canvas, ctx, raf = 0, lastFrame = 0, view = { x: 0, y: 0, scale: 1 };
let mouse = { x: 0, y: 0 }, boosting = false, keys = new Set(), lastInput = 0;
const COLORS = { grid: 'rgba(91,105,153,.12)', glow: 'rgba(140,95,255,.15)' };

function setStatus(online, text) {
  $('statusDot').parentElement.classList.toggle('online', online);
  $('statusText').textContent = text;
}
function message(text, success = false) {
  $('authMessage').textContent = text;
  $('authMessage').classList.toggle('success', success);
}
function showAuth() {
  authScreen.classList.remove('hidden'); gameScreen.classList.add('hidden');
  $('logoutBtn').classList.add('hidden');
  if (raf) cancelAnimationFrame(raf);
}
function showGame() {
  authScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
  $('logoutBtn').classList.remove('hidden');
  $('profileName').textContent = user.username;
  $('coins').textContent = user.coins || 0;
  $('gameUsername').textContent = user.username;
  $('avatar').textContent = user.username[0].toUpperCase();
  $('elo').textContent = `${user.elo || 1000} ELO`;
  setupCanvas();
  connectGame();
}
function setMode(mode) {
  authMode = mode;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('submitAuth').innerHTML = mode === 'login' ? 'ENTRER DANS L’ARÈNE <span>↗</span>' : 'CRÉER MON COMPTE <span>↗</span>';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  message('');
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = $('username').value.trim(), password = $('password').value;
  const button = $('submitAuth');
  button.disabled = true; message('Connexion en cours…');
  try {
    const response = await fetch(`/api/${authMode === 'login' ? 'login' : 'register'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    token = data.token; user = data.user;
    showGame();
  } catch (e) { message(e.message); }
  finally { button.disabled = false; }
});

$('logoutBtn').addEventListener('click', logout);
$('backBtn').addEventListener('click', () => {
  if (ws) ws.close();
  ws = null; state = null; showAuth();
});
async function logout() {
  if (ws) ws.close();
  try { await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  token = ''; user = null; state = null; ws = null; showAuth();
}
function connectGame() {
  if (ws) ws.close();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`);
  setStatus(false, 'Connexion…');
  ws.addEventListener('open', () => setStatus(true, 'Connecté'));
  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'welcome') selfId = msg.selfId;
    if (msg.type === 'state') {
      state = msg;
      const onlinePlayers = msg.players.filter(p => !p.bot).length;
      $('playerCount').textContent = onlinePlayers;
      $('aliveText').textContent = msg.players.filter(p => p.alive).length;
      const me = msg.players.find(p => String(p.id) === String(selfId));
      if (me) {
        $('healthText').textContent = `${Math.round(me.health)}%`;
        $('healthBar').style.width = `${me.health}%`;
        $('coords').textContent = `X ${String(Math.round(me.x)).padStart(4,'0')} / Y ${String(Math.round(me.y)).padStart(4,'0')}`;
        $('coins').textContent = user.coins = me.coins || 0;
        if (!me.alive) showCenter('ÉLIMINÉ', 'Réapparition en cours…');
        else hideCenter();
      }
    }
    if (msg.type === 'notice') showCenter(msg.message);
  });
  ws.addEventListener('close', () => {
    setStatus(false, 'Déconnecté');
    if (user && !gameScreen.classList.contains('hidden')) showCenter('Connexion perdue', 'Recharge la page pour te reconnecter.');
  });
  ws.addEventListener('error', () => setStatus(false, 'Erreur réseau'));
}
function showCenter(title, subtitle = '') {
  const el = $('centerMessage'); el.classList.remove('hidden');
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${subtitle ? `<div style="margin-top:6px;color:#aab5d5">${escapeHtml(subtitle)}</div>` : ''}`;
}
function hideCenter() { $('centerMessage').classList.add('hidden'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function setupCanvas() {
  canvas = $('gameCanvas'); ctx = canvas.getContext('2d');
  const wrap = $('canvasWrap');
  const resize = () => {
    const rect = wrap.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
  else window.addEventListener('resize', resize);
  resize();
  canvas.onmousemove = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX-r.left; mouse.y=e.clientY-r.top; };
  canvas.onmousedown = (e) => { if (e.button === 0) boosting = true; };
  window.onmouseup = () => boosting = false;
  canvas.oncontextmenu = e => e.preventDefault();
  window.onkeydown = e => { if (e.code === 'Space') { boosting = true; e.preventDefault(); } };
  window.onkeyup = e => { if (e.code === 'Space') boosting = false; };
  if (raf) cancelAnimationFrame(raf);
  lastFrame = performance.now(); raf = requestAnimationFrame(draw);
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
function draw(now) {
  raf = requestAnimationFrame(draw);
  if (!canvas || !ctx) return;
  const dt = Math.min(.05, (now-lastFrame)/1000); lastFrame = now;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  const world = state?.world || { w:2400, h:1600 };
  const me = state?.players?.find(p => String(p.id) === String(selfId));
  if (me) {
    const targetScale = Math.min(w/850, h/570, 1);
    view.scale += (targetScale-view.scale)*.06;
    view.x += (me.x-view.x)*.12; view.y += (me.y-view.y)*.12;
    const aimAngle = Math.atan2(mouse.y-h/2, mouse.x-w/2);
    if (ws?.readyState === WebSocket.OPEN && now-lastInput > 35) {
      ws.send(JSON.stringify({ type:'input', angle: aimAngle, boost: boosting }));
      lastInput = now;
    }
  } else {
    view.scale += (Math.min(w/850,h/570,1)-view.scale)*.04;
    view.x += (world.w/2-view.x)*.03; view.y += (world.h/2-view.y)*.03;
  }
  const s = Math.max(.25, view.scale);
  ctx.save(); ctx.translate(w/2-view.x*s, h/2-view.y*s); ctx.scale(s,s);
  // Subtle grid and world boundary.
  ctx.fillStyle = '#080d1b'; ctx.fillRect(0,0,world.w,world.h);
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1/s;
  for (let x=0; x<=world.w; x+=80) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,world.h);ctx.stroke(); }
  for (let y=0; y<=world.h; y+=80) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(world.w,y);ctx.stroke(); }
  ctx.strokeStyle='#6c55bd';ctx.lineWidth=5/s;ctx.shadowColor='#8b5cf6';ctx.shadowBlur=22/s;ctx.strokeRect(0,0,world.w,world.h);ctx.shadowBlur=0;
  if (state) {
    for (const o of state.orbs) {
      ctx.beginPath();ctx.fillStyle=`hsla(${o.hue},95%,68%,.2)`;ctx.arc(o.x,o.y,o.r*2.2,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.fillStyle=`hsl(${o.hue},95%,70%)`;ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(o.x-o.r*.25,o.y-o.r*.25,Math.max(1,o.r*.25),0,Math.PI*2);ctx.fill();
    }
    for (const p of state.players) drawPlayer(p, String(p.id)===String(selfId), s);
  }
  ctx.restore();
  if (!me) {
    ctx.fillStyle='#8995b5';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('Connexion à l’arène…',w/2,h/2);
  }
}
function drawPlayer(p, isMe, scale) {
  if (!p.alive) return;
  const points = p.trail || [];
  if (points.length > 1) {
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=p.radius*1.45;
    ctx.strokeStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=(p.boost?20:9)/scale;ctx.stroke();ctx.shadowBlur=0;
    ctx.lineWidth=p.radius*.8;ctx.strokeStyle='rgba(255,255,255,.18)';ctx.stroke();
  }
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  ctx.shadowColor=p.color;ctx.shadowBlur=18/scale;
  ctx.beginPath();ctx.fillStyle=p.color;ctx.arc(0,0,p.radius,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(4,-4,3.2,0,Math.PI*2);ctx.arc(4,4,3.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#12162a';ctx.beginPath();ctx.arc(5,-4,1.3,0,Math.PI*2);ctx.arc(5,4,1.3,0,Math.PI*2);ctx.fill();
  ctx.restore();
  const name = p.bot ? 'BOT • TRAINING' : p.username;
  ctx.font = `${isMe? 'bold ':''}${p.crown?10:11}px system-ui`;
  ctx.textAlign='center';ctx.textBaseline='bottom';
  if(p.crown){ctx.fillStyle='#f4cf68';ctx.fillText('♛',p.x,p.y-p.radius-24);ctx.fillStyle='#f4cf68';}
  else ctx.fillStyle=isMe?'#ffffff':'#c3cbed';
  ctx.fillText(name,p.x,p.y-p.radius-8);
  if(p.bot){ctx.font='9px system-ui';ctx.fillStyle='#ffbd67';ctx.fillText('BOT',p.x,p.y-p.radius+3);}
}
