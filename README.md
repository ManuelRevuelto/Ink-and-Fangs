# 🐙 Ink and Fangs 🦈

Juego de tablero asimétrico para dos jugadores convertido en videojuego web.
Un **pulpo** se esconde en un bosque de algas moviendo bloques ocultos con cartas,
mientras un **tiburón** lo caza tirando dados para nadar, buscar y atacar.

- **El pulpo gana** si se come las 4 comidas o si el tiburón se agota (7 dados de hambre).
- **El tiburón gana** si ataca al pulpo y lo vence en el enfrentamiento.

## Modos de juego
- 2 jugadores en el mismo ordenador (con pantalla de «pasa el turno»).
- Contra la máquina, llevando el pulpo o el tiburón.

## Cómo arrancarlo
```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # tests de reglas, simulación de partidas e interfaz
npm run torneo   # torneo IA contra IA: % de victorias de cada papel (para equilibrar cartas)
npm run build    # versión para publicar en dist/
```

## Estructura
| Carpeta | Contenido |
|---|---|
| `src/data/` | Contenido del juego: tablero, cartas, fichas de crecimiento, enfrentamiento |
| `src/engine/` | Motor de reglas puro y determinista (sin interfaz) |
| `src/ui/` | Interfaz: tablero en Canvas, paneles, flujos guiados y animaciones |
| `src/ai/` | Jugadores de la máquina |
| `docs/` | Reglas originales, diseño del contenido y decisiones de reglas |
| `tests/` | Tests con Vitest |

Los gráficos actuales son provisionales (formas y emojis): se cambian en `src/ui/board.ts` y `src/ui/style.css`.
