import * as THREE from 'three';

type Draw = (g: CanvasRenderingContext2D, s: number) => void;

function canvasTex(size: number, draw: Draw, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g: CanvasRenderingContext2D, s: number, n: number, maxA: number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.55
      ? `rgba(0,0,0,${Math.random() * maxA})`
      : `rgba(255,255,255,${Math.random() * maxA * 0.5})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function stains(g: CanvasRenderingContext2D, s: number, n: number, rgb: string, a: number): void {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 16 + Math.random() * 56;
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export interface Textures {
  concrete: THREE.CanvasTexture; tile: THREE.CanvasTexture; wood: THREE.CanvasTexture;
  carpet: THREE.CanvasTexture; metal: THREE.CanvasTexture; plaster: THREE.CanvasTexture;
  ceiling: THREE.CanvasTexture;
}
let cache: Textures | null = null;

export function getTextures(): Textures {
  if (cache) return cache;
  cache = {
    concrete: canvasTex(256, (g, s) => {
      g.fillStyle = '#74746f'; g.fillRect(0, 0, s, s);
      speckle(g, s, 9000, 0.28); stains(g, s, 6, '20,18,14', 0.35);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        let x = Math.random() * s, y = Math.random() * s;
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.2) * 20; g.lineTo(x, y); }
        g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3; g.strokeRect(0, 0, s, s);
    }),
    tile: canvasTex(256, (g, s) => {
      const q = s / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? '#c9c8c0' : '#1f2022';
        g.fillRect(i * q, j * q, q, q);
      }
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke(); }
      speckle(g, s, 5000, 0.25); stains(g, s, 5, '60,30,10', 0.22);
    }),
    wood: canvasTex(256, (g, s) => {
      const pw = s / 8;
      for (let i = 0; i < 8; i++) {
        const l = 26 + Math.random() * 10;
        g.fillStyle = `hsl(24,42%,${l}%)`; g.fillRect(i * pw, 0, pw, s);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
          const x = i * pw + Math.random() * pw;
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 6, s); g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(i * pw, 0, 2, s);
        g.fillRect(i * pw, Math.random() * s, pw, 2);
      }
      speckle(g, s, 3000, 0.2); stains(g, s, 4, '15,8,4', 0.3);
    }),
    carpet: canvasTex(256, (g, s) => {
      g.fillStyle = '#4a1822'; g.fillRect(0, 0, s, s);
      speckle(g, s, 22000, 0.3);
      g.strokeStyle = 'rgba(200,160,80,.28)'; g.lineWidth = 2;
      const q = s / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.beginPath(); g.moveTo(i * q + q / 2, j * q + 4); g.lineTo(i * q + q - 4, j * q + q / 2);
        g.lineTo(i * q + q / 2, j * q + q - 4); g.lineTo(i * q + 4, j * q + q / 2); g.closePath(); g.stroke();
      }
      stains(g, s, 4, '10,0,0', 0.3);
    }),
    metal: canvasTex(256, (g, s) => {
      g.fillStyle = '#2c3036'; g.fillRect(0, 0, s, s);
      speckle(g, s, 7000, 0.3);
      g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 2;
      const q = s / 4;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke(); }
      g.fillStyle = 'rgba(160,170,180,.35)';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * q + 8, j * q + 8, 2, 0, 6.3); g.fill(); }
    }),
    plaster: canvasTex(256, (g, s) => {
      g.fillStyle = '#8f8a76'; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 32) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, 0, 16, s); }
      speckle(g, s, 6000, 0.22); stains(g, s, 7, '40,34,20', 0.3);
      const gr = g.createLinearGradient(0, s, 0, s * 0.6);
      gr.addColorStop(0, 'rgba(20,15,8,.45)'); gr.addColorStop(1, 'rgba(20,15,8,0)');
      g.fillStyle = gr; g.fillRect(0, s * 0.6, s, s * 0.4);
    }),
    ceiling: canvasTex(256, (g, s) => {
      g.fillStyle = '#8d8d86'; g.fillRect(0, 0, s, s);
      speckle(g, s, 5000, 0.3); stains(g, s, 6, '30,26,16', 0.3);
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3;
      const q = s / 2;
      for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke(); }
    }),
  };
  return cache;
}

/** Small landscape for the 'Oil Painting' valuables - a different one per item. */
export function paintingTexture(seed: number): THREE.CanvasTexture {
  return canvasTex(128, (g, s) => {
    const hue = (seed * 47) % 360;
    const sky = g.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, `hsl(${hue},50%,22%)`); sky.addColorStop(1, `hsl(${(hue + 30) % 360},60%,55%)`);
    g.fillStyle = sky; g.fillRect(0, 0, s, s);
    g.fillStyle = `hsl(${(hue + 60) % 360},70%,80%)`; g.beginPath(); g.arc(s * (0.3 + (seed % 5) * 0.1), s * 0.3, s * 0.08, 0, 6.3); g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `hsl(${(hue + 200) % 360},30%,${12 + i * 8}%)`;
      g.beginPath(); g.moveTo(0, s);
      for (let x = 0; x <= s; x += 16) g.lineTo(x, s * (0.55 + i * 0.12) - Math.sin(x * 0.07 + seed + i) * 12);
      g.lineTo(s, s); g.closePath(); g.fill();
    }
  }, false);
}

/** Extraction pad decal: hazard border, green glow, label. */
export function padTexture(): THREE.CanvasTexture {
  return canvasTex(512, (g, s) => {
    g.fillStyle = 'rgba(10,70,45,.85)'; g.fillRect(0, 0, s, s);
    g.save(); g.beginPath(); g.rect(0, 0, s, s); g.rect(26, 26, s - 52, s - 52); g.clip('evenodd');
    for (let i = -s; i < s * 2; i += 44) {
      g.fillStyle = '#e6c010'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 0); g.lineTo(i + 22 - s, s); g.lineTo(i - s, s); g.fill();
    }
    g.restore();
    g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(26, 26, s - 52, s - 52);
    g.fillStyle = 'rgba(120,255,180,.9)'; g.font = 'bold 54px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EXTRACTION', s / 2, s / 2 - 10);
    g.font = '28px monospace'; g.fillText('drop valuables here', s / 2, s / 2 + 40);
  }, false);
}
