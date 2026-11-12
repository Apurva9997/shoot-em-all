# Shoot 'Em All

**Play:** [https://shoot-em-all-apurva.netlify.app](https://shoot-em-all-apurva.netlify.app)

A browser tactical first-person shooter in the shape of Counter-Strike 1.6's bomb mode, built from scratch. The map, sandstone textures, weapon viewmodels, hitboxes, and sound are generated in code. Nothing is fetched from a CDN at runtime except the npm packages you install.

The live site is the Netlify client. A 30 Hz game loop cannot run on a static host, so online matches need the Node server in `server/`. Until that process is deployed, the page loads and the round starts only when you run the server yourself. `render.yaml` is a blueprint for a free Node host; point `VITE_SERVER_URL` at it when you build the client.

The server is authoritative. It runs a 30 Hz loop, validates movement against the same physics the client predicts with, and resolves hitscan against head, torso, and leg boxes. The client renders with Three.js, interpolates other players, and draws a translucent amber HUD.

## Play

```bash
npm install
npm run dev
```

Open [http://localhost:5183](http://localhost:5183). Pick Terrorist or Counter-Terrorist. If you are the only human, a bot takes the other side so the round can be played.

`npm start` builds the client and serves it from the Node process on port 3091.

## Layout

| Path | Role |
| --- | --- |
| `shared/` | Weapon stats, Dust2 AABBs, movement, hitscan. Imported by both sides. |
| `server/` | Express + Socket.IO, rooms, 30 Hz tick, economy, C4, bots. |
| `client/` | Vite + Three.js renderer, procedural assets, HUD, prediction. |

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (pointer lock) |
| WASD | Move. Air control uses the same accel curve as the ground, just weaker. |
| Space | Jump |
| Ctrl | Crouch. Lowers the camera, the hitbox, and the spread. |
| Mouse1 | Fire. Hold to plant or defuse when C4 is out or you are on the bomb. |
| Mouse2 | AWP scope (2×, tighter spread, movement still blooms it) |
| R | Reload |
| 1 / 2 / 3 / 5 | Primary, pistol, knife, C4 |
| G | Drop the weapon in hand |
| E | Plant (T, C4 selected, inside A or B) or defuse (CT, near the bomb) |
| B | Buy menu, freeze time only |
| Tab | Scoreboard |

## Round

Freeze time is 5 seconds. Live time is 1:55. A planted bomb runs 40 seconds. Between rounds, 5 seconds.

Cash starts at $800. A kill pays $300, a round win $3250, a round loss $1400. Survivors keep their guns. Anyone who died respawns with a pistol and no armor.

The Glock and USP are $400. The AK-47 is $2700 and one-taps a bare head. The M4A1 is $3100. The AWP is $4750 and kills on a torso or head hit, armor or not. One terrorist carries the C4 each round.

## Deploy

The client is a static Vite build. Netlify publishes `client/dist` from `netlify.toml`.

```bash
npm run build --prefix client
npx netlify deploy --prod --dir=client/dist
```

The authoritative server is the Node process in `server/`. `render.yaml` builds the client and starts that process. After that host is up, rebuild the client with `VITE_SERVER_URL` set to its public URL so the Netlify page connects to it.

## License

MIT. See [LICENSE](LICENSE).
