/** CS 1.6-style overlays: amber numbers, green crosshair, buy list, radar. */

import { BUY_MENU, WEAPONS } from "@shared/weapons.js";
import { MAP } from "@shared/mapData.js";
import { PHASE, TEAMS } from "@shared/constants.js";

export function createHud() {
  const el = {
    hp: document.querySelector("#hp"),
    armor: document.querySelector("#armor"),
    timer: document.querySelector("#timer"),
    money: document.querySelector("#money"),
    ammo: document.querySelector("#ammo"),
    gun: document.querySelector("#gun-name"),
    phase: document.querySelector("#phase-label"),
    banner: document.querySelector("#banner"),
    killfeed: document.querySelector("#killfeed"),
    action: document.querySelector("#action"),
    scoreboard: document.querySelector("#scoreboard"),
    buymenu: document.querySelector("#buymenu"),
    toast: document.querySelector("#toast"),
    cross: document.querySelector("#crosshair"),
    scope: document.querySelector("#scope"),
    dmg: document.querySelector("#dmg"),
    radar: document.querySelector("#radar-canvas"),
  };
  const radarCtx = el.radar.getContext("2d");
  let buyOpen = false;
  let buyCat = 0;
  let toastUntil = 0;
  const seenKills = new Set();

  function clock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function flashDamage(amount) {
    el.dmg.style.background = `radial-gradient(circle at center, transparent 30%, rgba(140, 18, 8, ${Math.min(0.72, amount / 80)}) 78%)`;
    el.dmg.style.opacity = "1";
    setTimeout(() => {
      el.dmg.style.opacity = "0";
    }, 140);
  }

  function toast(text) {
    el.toast.textContent = text;
    toastUntil = performance.now() + 1600;
  }

  function renderBuy(me) {
    if (!buyOpen || !me) {
      el.buymenu.hidden = true;
      return;
    }
    el.buymenu.hidden = false;
    const cats = BUY_MENU.map((cat, i) => {
      const on = i === buyCat ? "on" : "";
      return `<button type="button" data-cat="${i}" class="${on}">${cat.key}. ${cat.name}</button>`;
    }).join("");
    const cat = BUY_MENU[buyCat];
    const items = cat.items
      .map((item) => {
        const locked = item.team !== "BOTH" && item.team !== me.team;
        const broke = me.money < item.price;
        return `<button type="button" data-item="${item.item}" ${locked ? "disabled" : ""}>
          <span>${item.key}. ${item.name}${locked ? " — other side" : ""}</span>
          <span>$${item.price}</span>
        </button>`;
      })
      .join("");
    el.buymenu.innerHTML = `<h2>Buy menu — $${me.money}</h2>
      <div class="buy-grid"><div class="buy-cats">${cats}</div><div class="buy-items">${items}</div></div>
      <p class="hint">Number keys pick a category, then an item. B or Esc closes.</p>`;
  }

  function renderScore(state, meId) {
    const rows = (team) =>
      state.players
        .filter((p) => p.team === team)
        .map((p) => {
          const me = p.id === meId ? "me" : "";
          return `<tr class="${me}"><td>${escapeHtml(p.name)}${p.alive ? "" : " †"}</td><td>${p.kills}</td><td>${p.deaths}</td><td>$${p.money}</td><td>${p.hp}</td></tr>`;
        })
        .join("");
    el.scoreboard.innerHTML = `<h2>Round ${state.round} — T ${state.scores.T} : ${state.scores.CT} CT</h2>
      <table><thead><tr><th>Terrorists</th><th>K</th><th>D</th><th>$</th><th>HP</th></tr></thead><tbody class="col-t">${rows(TEAMS.T)}</tbody></table>
      <table><thead><tr><th>Counter-Terrorists</th><th>K</th><th>D</th><th>$</th><th>HP</th></tr></thead><tbody class="col-ct">${rows(TEAMS.CT)}</tbody></table>`;
  }

  function update(state, me, spreadPx, showScore) {
    if (!me) return;
    el.hp.textContent = String(me.hp);
    el.armor.textContent = me.helmet ? `${me.armor}+` : String(me.armor);
    el.money.textContent = `$${me.money}`;
    const spec = WEAPONS[me.weapon];
    el.gun.textContent = spec ? spec.name : me.weapon;
    if (!spec || spec.type === "melee" || spec.type === "c4") {
      el.ammo.textContent = spec?.type === "c4" ? "C4" : "—";
    } else {
      el.ammo.textContent = `${me.mag} | ${me.reserve}`;
    }
    const bomb = state.phase === PHASE.BOMB_PLANTED && state.bomb;
    el.phase.textContent = bomb ? `Bomb ${state.bomb.site}` : state.phase === PHASE.FREEZETIME ? "Freeze" : "Round";
    el.timer.textContent = clock(bomb ? state.bomb.time : state.phaseTime);
    el.timer.style.color = bomb && state.bomb.time < 10 ? "#ff6a4a" : "";

    if (state.phase === PHASE.ROUND_OVER && state.winner) {
      const side = state.winner === TEAMS.T ? "Terrorists Win" : "Counter-Terrorists Win";
      el.banner.textContent = side;
    } else if (state.phase === PHASE.FREEZETIME) {
      el.banner.textContent = "Freeze time";
    } else if (state.phase === PHASE.BOMB_PLANTED) {
      el.banner.textContent = `Bomb planted ${state.bomb?.site || ""}`;
    } else {
      el.banner.textContent = "";
    }

    if (me.plant > 0.05) el.action.textContent = `Planting ${Math.min(100, Math.round((me.plant / 3) * 100))}%`;
    else if (me.defuse > 0.05) el.action.textContent = `Defusing ${Math.min(100, Math.round((me.defuse / 5) * 100))}%`;
    else if (me.reloading) el.action.textContent = "Reloading";
    else el.action.textContent = "";

    const gap = 6 + spreadPx;
    const bars = el.cross.querySelectorAll("i");
    bars[0].style.top = `${-gap - 8}px`;
    bars[1].style.top = `${gap}px`;
    bars[2].style.left = `${-gap - 8}px`;
    bars[3].style.left = `${gap}px`;
    el.cross.hidden = !!me.scoped;
    el.scope.hidden = !me.scoped;

    for (const ev of state.events || []) {
      if (ev.type !== "kill" || seenKills.has(ev.id)) continue;
      seenKills.add(ev.id);
      const row = document.createElement("div");
      row.className = "kill";
      const hs = ev.headshot ? " ⌖" : "";
      row.innerHTML = `<span class="${ev.killerTeam === "T" ? "t" : "ct"}">${escapeHtml(ev.killer)}</span><span class="wpn">${escapeHtml(ev.weapon)}${hs}</span><span class="${ev.victimTeam === "T" ? "t" : "ct"}">${escapeHtml(ev.victim)}</span>`;
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    }

    el.scoreboard.hidden = !showScore;
    if (showScore) renderScore(state, me.id);
    if (performance.now() > toastUntil) el.toast.textContent = "";
    drawRadar(state, me);
  }

  function drawRadar(state, me) {
    const ctx = radarCtx;
    const w = el.radar.width;
    const h = el.radar.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(40, 28, 16, 0.35)";
    ctx.fillRect(0, 0, w, h);
    const b = MAP.bounds;
    const sx = (x) => ((x - b.min.x) / (b.max.x - b.min.x)) * (w - 12) + 6;
    const sz = (z) => ((z - b.min.z) / (b.max.z - b.min.z)) * (h - 12) + 6;
    ctx.strokeStyle = "rgba(231, 211, 161, 0.35)";
    ctx.strokeRect(sx(-8), sz(-5.3), sx(15) - sx(-8), sz(16) - sz(-5));
    ctx.fillStyle = "rgba(196, 92, 38, 0.35)";
    ctx.fillRect(sx(16), sz(-24.6), sx(31) - sx(16), sz(-8) - sz(-24.6));
    ctx.fillStyle = "rgba(76, 141, 255, 0.28)";
    ctx.fillRect(sx(-30), sz(-7), sx(-12) - sx(-30), sz(3) - sz(-7));
    ctx.fillStyle = "#e7d3a1";
    ctx.font = "11px Trebuchet MS, sans-serif";
    ctx.fillText("A", sx(22), sz(-15));
    ctx.fillText("B", sx(-22), sz(-1));
    if (state.bomb) {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      ctx.fillStyle = blink ? "#ff3b30" : "#7a180f";
      ctx.font = "bold 16px Trebuchet MS, sans-serif";
      ctx.fillText("X", sx(state.bomb.pos.x) - 5, sz(state.bomb.pos.z) + 5);
    }
    for (const p of state.players) {
      if (!p.alive) continue;
      if (p.team !== me.team && p.id !== me.id) continue;
      ctx.save();
      ctx.translate(sx(p.pos.x), sz(p.pos.z));
      ctx.fillStyle = p.id === me.id ? "#9dff6a" : p.team === TEAMS.T ? "#e08a4f" : "#8eb6ff";
      ctx.beginPath();
      ctx.arc(0, 0, p.id === me.id ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
      const fx = -Math.sin(p.yaw) * 8;
      const fz = -Math.cos(p.yaw) * 8;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fx, fz);
      ctx.stroke();
      ctx.restore();
    }
  }

  function toggleBuy(me) {
    buyOpen = !buyOpen;
    renderBuy(me);
    return buyOpen;
  }

  function closeBuy() {
    buyOpen = false;
    el.buymenu.hidden = true;
  }

  function buyKey(key, me) {
    if (!buyOpen) return null;
    const cat = BUY_MENU[buyCat];
    if (key >= "1" && key <= "4" && document.activeElement?.tagName !== "INPUT") {
      const item = cat.items.find((it) => it.key === key);
      if (item) return item.item;
      const idx = Number(key) - 1;
      if (BUY_MENU[idx]) {
        buyCat = idx;
        renderBuy(me);
      }
    }
    return null;
  }

  el.buymenu.addEventListener("click", (ev) => {
    const catBtn = ev.target.closest("[data-cat]");
    if (catBtn) {
      buyCat = Number(catBtn.dataset.cat);
      renderBuy(window.__me);
    }
  });

  return {
    el,
    update,
    flashDamage,
    toast,
    toggleBuy,
    closeBuy,
    buyKey,
    isBuyOpen: () => buyOpen,
    renderBuy,
    setBuyHandler(fn) {
      el.buymenu.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-item]");
        if (btn) fn(btn.dataset.item);
      });
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
