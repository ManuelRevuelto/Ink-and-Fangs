# 📌 Estado del proyecto Ink and Fangs

> Documento para retomar el desarrollo otro día. Última actualización: **3 de noviembre de 2026**.
> Repositorio: https://github.com/ManuelRevuelto/Ink-and-Fangs (rama `main`).
> Publicado en **Render** (plan gratuito): **https://ink-and-fangs.onrender.com/**

---

## ✅ TODO pendiente

### 1. Modificar las cartas (pendiente: lo hace Manuel)
Ajustar valores, costes, efectos y nombres de las cartas a su gusto. Ver la guía de abajo:
[«Cómo modificar las cartas»](#-cómo-modificar-las-cartas).

Al terminar:
- [ ] Actualizar `docs/diseno-contenido.md` para que coincida con las cartas nuevas.
- [ ] Ejecutar `npm test` (todo en verde) y `npm run torneo` (ningún papel debería superar el 60% en «IA contra IA»).
- [ ] Subir a `main`: Render publica la nueva versión automáticamente.

### Ideas opcionales (no pedidas, por si apetecen)
- La IA del tiburón, sin pistas, tiende a rondar el centro (zona 2+, la más fácil). Se podría añadir
  algo de exploración para que sea menos previsible. El usuario dijo que da igual.
- Gráficos definitivos: dejar PNG en `public/assets/` (ver `docs/graficos.md`).
- Sonidos reales en lugar de los sintéticos (`src/ui/sound.ts`).
- Si el plan gratuito de Render se queda corto, las salas podrían guardarse en una base de datos
  para que no se pierdan al dormirse el servidor.

---

## 🗺️ Qué hay hecho (todas las fases del plan)

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Proyecto web TypeScript + Vite + Vitest | ✅ |
| 1 | Contenido v0.1: cartas, fichas de crecimiento, enfrentamientos | ✅ (pendiente el retoque de cartas) |
| 2 | Motor de reglas completo, determinista y con información oculta | ✅ |
| 3 | Interfaz guiada en el navegador, 2 jugadores en el mismo ordenador | ✅ |
| 4 | IA del tiburón y del pulpo, torneo IA contra IA | ✅ |
| 5 | Online con servidor propio (salas por código) y despliegue en Render | ✅ |
| 6 | Dificultad, sonido, animaciones, ayuda, móvil, gráficos sustituibles | ✅ |

### Modos de juego
- **2 jugadores en el mismo ordenador**, con pantalla de «pasa el turno» y resumen animado de lo
  que hizo el rival.
- **Contra la máquina**, llevando el pulpo o el tiburón. Niveles **Fácil / Normal / Difícil**.
- **Online**: crear sala (eligiendo papel) o unirse con un código de 4 letras o un enlace `?sala=ABCD`.
  Reconexión automática.

---

## 📜 Reglas tal como han quedado
Las reglas base están en `docs/reglas-original.md` (del documento original del usuario). Todas las
aclaraciones y cambios decididos están en **`docs/decisiones.md`**. Los más importantes:

- **Tablero redondo** de 3×3 zonas: rocas 5+ («esquinas»), algas 4+ (lados), expuesta 2+ (centro).
- **20 casillas de corriente.** Cada roca tiene **una única guarida** (su borde exterior es un arco).
  4 guaridas en total. El tiburón que sale de una guarida elige hacia qué lado va.
- **Barajar:** los bloques se recolocan al azar.
- **Cadenas de corrientes:** la primera siempre se puede usar; las siguientes, con números descendentes.
- **Comer cuesta 1 acción.** La carta de comer **sale de la partida** al usarse.
- **El poder de la comida se aplica automáticamente al comérsela:** 🦀 mano de 5 y robar ·
  🦞 ocultar todo · 🐌 buscar una carta (se elige al momento) · 🦪 aprender hasta 3 (se elige al momento).
- **Cartas que un efecto manda descartar** y **cartas de enfrentamiento gastadas** salen de la partida.
- **Energía:** máximo 3 dados; con 3 es obligatorio gastar.

---

## 🃏 Cómo modificar las cartas

Las cartas son **datos**: cambiar números y textos no requiere tocar el motor.

### Cartas del pulpo: `src/data/octopusCards.ts`
Cada carta tiene: `key` (identificador), `name`, `pile` (`aprender` / `comer` / `ocultar` / `moverse`),
`cost` (bloques a revelar, 0-3), `starter` (si es inicial, con alga), `copies`, `effect` y `text`
(lo que se muestra en la carta).

Efectos disponibles (`effect`):

| Efecto | Qué hace | Opciones |
|---|---|---|
| `{ kind: 'learn', n }` | Aprender hasta `n` (cartas o bloques) | `toHand: true` → las cartas van a la mano |
| `{ kind: 'swap', n }` | Hasta `n` intercambios de bloques adyacentes | `anyDistance: true` (no hace falta que sean vecinos), `hiddenOnly: true` (solo ocultos) |
| `{ kind: 'shuffle', n }` | Barajar exactamente `n` bloques ocultos | `includeExposed: true` → debe incluir el de la zona expuesta |
| `{ kind: 'hide', n }` | Ocultar hasta `n` bloques | `draw: k` → además roba `k` cartas |
| `{ kind: 'hideZoneKind', zoneKind }` | Ocultar todos los bloques de un tipo de zona (`'roca'`, `'algas'`, `'expuesta'`) | — |
| `{ kind: 'eat', food }` | Comer (`cangrejo`, `langosta`, `caracol`, `abulon`) | — |

### Cartas del tiburón: `src/data/sharkCards.ts`
Cada carta tiene `key`, `name`, `cost` (energía), `dice` (dados que añade a la bolsa: `azul`,
`amarillo`, `rojo`), `when` y `text`. Las copias se definen con `copies: [{}, {}, { cost: 5 }]`
(cada copia puede cambiar coste o dados).
- Cambiar **coste, dados, copias, nombre o texto** → solo datos.
- El **efecto** de cada `key` está programado en `useSharkCard` (`src/engine/shark.ts`). Un efecto
  nuevo requiere programarlo.
- Recomendación: que los dados de todas las cartas sumen la reserva (`TOTAL_DICE` − `INITIAL_BAG`):
  8 azules, 7 amarillos y 9 rojos.

### Otros datos ajustables
- Fichas de crecimiento: `src/data/growthTiles.ts`
- Enfrentamiento: `src/data/confrontation.ts`
- Límite de hambre, huecos de energía, mercado y dados iniciales: `src/data/sharkCards.ts`
- Tablero (zonas, valores, guaridas): `src/data/board.ts`

### Si una carta necesita un efecto que no existe
Hay que añadirlo al motor (`src/engine/octopus.ts` → `applyEffect`), a la interfaz guiada
(`src/ui/flows.ts` → `playFlow`) y a la IA del pulpo (`src/ai/octopusAI.ts` → `cardCandidates`).
Pedírselo a Claude describiendo el efecto.

---

## 🏗️ Arquitectura

```
src/data/      Contenido del juego (solo datos)
src/engine/    Motor de reglas puro y determinista (sin interfaz). applyAction / tryAction / viewFor
src/ai/        IAs: belief.ts (deducción del tiburón), sharkAI.ts, octopusAI.ts, difficulty.ts, randomPlayer.ts
src/ui/        Interfaz: board.ts (Canvas), panels.ts, flows.ts (pasos guiados), replay.ts (animaciones),
               sound.ts, help.ts, assets.ts (gráficos opcionales), app.ts (menú, modos, bucle)
src/net/       Protocolo y conexión online del navegador
server/        Servidor de salas (rooms.ts) y servidor de producción (index.ts)
tests/         Vitest: reglas, IA, eventos, interfaz (jsdom), online (servidor real)
tournament/    Torneo IA contra IA (npm run torneo)
docs/          Reglas, decisiones, diseño de contenido, gráficos, online y este documento
```

Principios que conviene mantener:
- **La información oculta solo sale por `viewFor`.** La interfaz, la IA y el servidor online solo
  trabajan con la vista de cada jugador. El test «juego limpio» comprueba que el tiburón no hace trampa.
- **El motor es puro:** recibe un estado y una acción y devuelve el estado nuevo. El servidor online
  ejecuta el mismo motor.
- **Eventos visuales públicos** (`state.events`) para animar y para la deducción del tiburón.

---

## ⌨️ Comandos

```bash
npm install
npm run dev              # juego + salas online en http://localhost:5173
npm test                 # 44 tests (reglas, IA, juego limpio, eventos, interfaz y online)
npm run torneo           # IA contra IA: % de victorias (PARTIDAS=1000, NIVELES=1 opcionales)
npm run build            # versión de producción en dist/
npm start                # servidor de producción (juego + salas) tras el build
```

---

## 📊 Números de referencia (para comparar tras cambiar cartas)
Torneo de 300 partidas con el contenido v0.1 y las reglas actuales:

| Enfrentamiento | 🐙 Pulpo | 🦈 Tiburón |
|---|---|---|
| IA contra IA (Normal) | 59.3% | 40.7% |
| Pulpo IA vs tiburón al azar | ~98% | ~2% |
| Tiburón IA vs pulpo al azar | ~24% | ~76% |

Niveles (tiburón contra pulpo Normal, 100 partidas): Fácil ~11% · Normal ~45% · Difícil ~55-63%.

---

## 🌐 Publicación
- **https://ink-and-fangs.onrender.com/** en **Render**, con el blueprint `render.yaml`. Build: `npm ci --include=dev && npm run build`. Start: `npm start`.
  Health check: `/health`.
- Cada push a `main` se publica solo.
- Plan gratuito: se duerme tras unos 15 minutos sin uso (la primera visita tarda 30-60 s) y las
  partidas en curso se pierden si se duerme o se vuelve a publicar.
- Guía completa: `docs/online.md`.

---

## 🧾 Historial (commits)
1. Base del proyecto y motor de reglas
2. Interfaz jugable en el navegador
3. Turnos del rival y de la máquina visibles en el tablero (animaciones)
4. Ink and Fangs: tablero redondo con 4 guaridas
5. IA del tiburón
6. Rocas con una sola guarida como borde exterior
7. IA del pulpo y torneo IA contra IA
8. Niveles de dificultad
9. Pulido: sonido, animaciones, ayuda, móvil y gráficos propios
10. Las cartas de comer se gastan para siempre
11. Modo online con servidor propio
12. El poder de la comida se aplica automáticamente al comérsela
13. Test de juego limpio de la IA del tiburón
