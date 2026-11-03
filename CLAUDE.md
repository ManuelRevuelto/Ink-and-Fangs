# Ink and Fangs — instrucciones para Claude

Videojuego web (TypeScript + Canvas, Vite, Vitest) de un juego de tablero asimétrico: pulpo vs tiburón.
Proyecto personal de Manuel, desarrollado entre los dos.

**Antes de nada, lee `docs/ESTADO.md`**: estado actual, TODO pendiente, arquitectura y comandos.

## Forma de trabajar
- Todo en **español**: conversación, textos del juego, comentarios, documentación y mensajes de commit.
- Si una regla no está clara, **pregunta** (AskUserQuestion) en vez de suponer, y registra la decisión
  en `docs/decisiones.md`.
- El contenido (cartas, tablero…) es **dato** en `src/data/`. Si cambias contenido, actualiza
  `docs/diseno-contenido.md`.
- La información oculta solo sale por `viewFor` (`src/engine/view.ts`). La IA, la interfaz y el servidor
  online trabajan solo con vistas. No romper esto; el test «juego limpio» lo vigila.
- Tras cambios de reglas o cartas: `npm test` en verde y `npm run torneo` para revisar el equilibrio.
- No hay navegador disponible normalmente: verifica con tests (jsdom para la interfaz) y, si hace falta
  ver el tablero, renderízalo a PNG con `@napi-rs/canvas` (`npm install --no-save @napi-rs/canvas`).
- Al terminar una tarea: commit en `main` con mensaje descriptivo en español y `git push`
  (Render publica automáticamente cada push).
