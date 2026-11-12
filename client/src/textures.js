/** Canvas sandstone, crate planks, cobble, and sky. No external image files. */

import * as THREE from "three";

function canvasTex(size, paint, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  paint(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  return tex;
}

function noise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function makeTextures() {
  const sand = canvasTex(256, (g, s) => {
    g.fillStyle = "#c4a06a";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const v = 150 + Math.floor(noise(x, y) * 70);
      g.fillStyle = `rgba(${v}, ${v - 30}, ${v - 70}, 0.35)`;
      g.fillRect(x, y, 2 + noise(y, x) * 3, 1 + noise(x + 3, y) * 2);
    }
    g.strokeStyle = "rgba(90, 60, 30, 0.18)";
    for (let y = 0; y < s; y += 32) {
      g.beginPath();
      g.moveTo(0, y + noise(y, 1) * 6);
      g.lineTo(s, y + noise(y, 4) * 6);
      g.stroke();
    }
  }, 2);

  const stone = canvasTex(256, (g, s) => {
    g.fillStyle = "#b08958";
    g.fillRect(0, 0, s, s);
    const rows = 4;
    const cols = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c * s) / cols + (r % 2 ? 18 : 0);
        const y = (r * s) / rows;
        const shade = 150 + ((r * 3 + c * 5) % 7) * 8;
        g.fillStyle = `rgb(${shade}, ${shade - 36}, ${shade - 72})`;
        g.fillRect(x + 3, y + 3, s / cols - 8, s / rows - 8);
        g.strokeStyle = "rgba(60, 36, 16, 0.55)";
        g.strokeRect(x + 3, y + 3, s / cols - 8, s / rows - 8);
      }
    }
  }, 1.4);

  const crate = canvasTex(128, (g, s) => {
    g.fillStyle = "#8a5a2b";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#5c3a18";
    g.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(0, i * 22 + 8);
      g.lineTo(s, i * 22 + 4);
      g.stroke();
    }
    g.strokeStyle = "#c08a48";
    g.strokeRect(8, 8, s - 16, s - 16);
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(s - 8, s - 8);
    g.moveTo(s - 8, 8);
    g.lineTo(8, s - 8);
    g.stroke();
  }, 1);

  const metal = canvasTex(128, (g, s) => {
    g.fillStyle = "#6d5840";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      g.fillStyle = y % 16 === 0 ? "#8a7354" : "#574632";
      g.fillRect(0, y, s, 4);
    }
    g.fillStyle = "#3a2c1c";
    g.fillRect(0, 0, 6, s);
    g.fillRect(s - 6, 0, 6, s);
  }, 1);

  const sky = canvasTex(512, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, "#7eb6e6");
    grad.addColorStop(0.55, "#d7c4a0");
    grad.addColorStop(1, "#c4a06a");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.ellipse(40 + i * 60, 70 + (i % 3) * 18, 28, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, 1);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.wrapS = THREE.ClampToEdgeWrapping;
  sky.wrapT = THREE.ClampToEdgeWrapping;

  return { sand, stone, crate, metal, sky };
}

export function materialFor(textures, mat, side = THREE.FrontSide) {
  const map = textures[mat] || textures.sand;
  return new THREE.MeshLambertMaterial({ map, side });
}
