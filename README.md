# 🐙 Ink and Fangs 🦈

Juego de tablero asimétrico para dos jugadores convertido en videojuego web.
Un **pulpo** se esconde en un bosque de algas moviendo bloques ocultos con cartas,
mientras un **tiburón** lo caza tirando dados para nadar, buscar y atacar.

- **El pulpo gana** si se come las 4 comidas o si el tiburón se agota (7 dados de hambre).
- **El tiburón gana** si ataca al pulpo y lo vence en el enfrentamiento.

🎮 **Jugar:** https://ink-and-fangs.onrender.com/

> 📌 **Estado actual, TODO pendiente y guía para retomar el desarrollo: [docs/ESTADO.md](docs/ESTADO.md)**

## Modos de juego
- 2 jugadores en el mismo ordenador (con pantalla de «pasa el turno»).
- Contra la máquina, llevando el pulpo o el tiburón (niveles Fácil, Normal y Difícil).
- **Online**: cada jugador en su dispositivo, con salas por código. Ver [docs/online.md](docs/online.md).

## Cómo arrancarlo
```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # tests de reglas, simulación de partidas e interfaz
npm run torneo   # torneo IA contra IA: % de victorias de cada papel (para equilibrar cartas)
npm run build    # versión para publicar en dist/
npm start        # servidor de producción: juego + salas online (tras npm run build)
```

## Estructura
| Carpeta | Contenido |
|---|---|
| `src/data/` | Contenido del juego: tablero, cartas, fichas de crecimiento, enfrentamiento |
| `src/engine/` | Motor de reglas puro y determinista (sin interfaz) |
| `src/ui/` | Interfaz: tablero en Canvas, paneles, flujos guiados y animaciones |
| `src/ai/` | Jugadores de la máquina |
| `src/net/` y `server/` | Modo online: protocolo, conexión del navegador y servidor de salas |
| `docs/` | Reglas originales, diseño del contenido y decisiones de reglas |
| `tests/` | Tests con Vitest |

Los gráficos actuales son provisionales (formas y emojis). Para poner los tuyos basta con dejar imágenes en `public/assets/`: mira [docs/graficos.md](docs/graficos.md).
