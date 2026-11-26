import { AV_COLORS, PAD } from './config';
import { roomAt } from './map';
import { S } from './state';

/** Track which rooms the local player has seen (the room they're in + anything within 3 m, i.e. through a doorway). */
export function markExplored(): void {
  const me = S.me, map = S.map;
  if (!me || !map) return;
  for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
    const r = roomAt(map, me.x + ox, me.z + oz);
    if (r) S.explored.add(r.id);
  }
}

/**
 * Draw the plan of the mansion. Rooms are revealed as you explore them; monsters only show as
 * red blips while they're hunting within 10 m of any player (a proximity "heartbeat" sensor).
 */
export function drawMap(ctx: CanvasRenderingContext2D, px: number, big: boolean): void {
  const map = S.map, me = S.me;
  if (!map || !me) return;
  const k = px / map.size;
  ctx.clearRect(0, 0, px, px);
  ctx.fillStyle = 'rgba(4,8,10,0.82)';
  ctx.fillRect(0, 0, px, px);

  // faint room grid so the player can tell how big the place is
  ctx.strokeStyle = 'rgba(120,150,140,0.18)';
  ctx.lineWidth = 1;
  for (const r of map.rooms) ctx.strokeRect(r.x1 * k + 0.5, r.z1 * k + 0.5, (r.x2 - r.x1) * k - 1, (r.z2 - r.z1) * k - 1);

  // explored rooms: floor + walls/props clipped to the room
  for (const r of map.rooms) {
    if (!S.explored.has(r.id)) {
      if (big) {
        ctx.fillStyle = 'rgba(120,140,130,0.35)';
        ctx.font = `${Math.round(px * 0.05)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('?', ((r.x1 + r.x2) / 2) * k, ((r.z1 + r.z2) / 2) * k + px * 0.018);
      }
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect((r.x1 - 0.7) * k, (r.z1 - 0.7) * k, (r.x2 - r.x1 + 1.4) * k, (r.z2 - r.z1 + 1.4) * k);
    ctx.clip();
    ctx.fillStyle = 'rgba(46,64,56,0.55)';
    ctx.fillRect(r.x1 * k, r.z1 * k, (r.x2 - r.x1) * k, (r.z2 - r.z1) * k);
    ctx.fillStyle = '#9db0a8';
    for (const s of map.walls) ctx.fillRect(s.x1 * k, s.z1 * k, (s.x2 - s.x1) * k, (s.z2 - s.z1) * k);
    ctx.fillStyle = '#5f7770';
    for (const p of map.props) ctx.fillRect((p.x - p.w / 2) * k, (p.z - p.d / 2) * k, p.w * k, p.d * k);
    ctx.restore();
    if (big) {
      ctx.fillStyle = 'rgba(210,230,220,0.85)';
      ctx.font = `${Math.round(px * 0.028)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(r.name.toUpperCase(), ((r.x1 + r.x2) / 2) * k, (r.z1 + 1.6) * k);
    }
  }

  // extraction pad
  ctx.fillStyle = 'rgba(40,220,130,0.55)';
  ctx.fillRect(PAD.x1 * k, PAD.z1 * k, (PAD.x2 - PAD.x1) * k, (PAD.z2 - PAD.z1) * k);

  // hunting monsters near any player
  const mons = S.isHost
    ? S.monsters.map(m => ({ x: m.x, z: m.z, chasing: m.state === 'chase' }))
    : S.mview.map(m => ({ x: m.x, z: m.z, chasing: m.chasing }));
  const near = (x: number, z: number): boolean => {
    if (Math.hypot(x - me.x, z - me.z) < 10) return true;
    if (S.isHost) { for (const p of S.players.values()) if (p.alive && Math.hypot(x - p.x, z - p.z) < 10) return true; }
    else { for (const p of S.remote.values()) if (p.alive && Math.hypot(x - p.x, z - p.z) < 10) return true; }
    return false;
  };
  for (const m of mons) {
    if (!m.chasing || !near(m.x, m.z)) continue;
    ctx.fillStyle = 'rgba(255,50,40,0.9)';
    ctx.beginPath();
    ctx.arc(m.x * k, m.z * k, Math.max(3, px * 0.014), 0, Math.PI * 2);
    ctx.fill();
  }

  // teammates
  const mates = S.isHost
    ? [...S.players.values()].filter(p => p.id !== S.myId).map(p => ({ x: p.x, z: p.z, idx: p.idx, alive: p.alive }))
    : [...S.remote.values()];
  for (const p of mates) {
    ctx.fillStyle = p.alive ? '#' + AV_COLORS[p.idx % AV_COLORS.length].toString(16).padStart(6, '0') : '#666';
    ctx.beginPath();
    ctx.arc(p.x * k, p.z * k, Math.max(3, px * 0.012), 0, Math.PI * 2);
    ctx.fill();
    if (!p.alive) {                       // a body worth reviving
      ctx.strokeStyle = '#ff5050';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x * k, p.z * k, Math.max(5, px * 0.02), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // you: arrow pointing the way you face (forward = (-sin yaw, -cos yaw))
  ctx.save();
  ctx.translate(me.x * k, me.z * k);
  ctx.rotate(Math.atan2(-Math.cos(me.yaw), -Math.sin(me.yaw)));
  const a = Math.max(5, px * 0.025);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(a, 0); ctx.lineTo(-a * 0.7, a * 0.6); ctx.lineTo(-a * 0.35, 0); ctx.lineTo(-a * 0.7, -a * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(160,190,180,0.5)';
  ctx.strokeRect(0.5, 0.5, px - 1, px - 1);
}
