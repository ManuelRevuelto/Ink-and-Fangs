# 🌐 Modo online de Ink and Fangs

## Cómo funciona
- Un **servidor** (Node + WebSocket, carpeta `server/`) guarda el estado real de cada partida y ejecuta
  el mismo motor de reglas que el modo local.
- Cada jugador manda sus acciones y recibe **solo su vista** (`viewFor`): el tiburón nunca recibe qué hay
  en los bloques ocultos ni la mano del pulpo, así que no se puede hacer trampas mirando el navegador.
- **Salas por código** de 4 letras. Quien la crea elige papel (pulpo, tiburón o al azar) y pasa el
  código o el enlace `…?sala=ABCD` a su rival.
- Si se corta la conexión, el navegador se reconecta solo y vuelve a la sala. Las salas inactivas
  se borran a las 3 horas.

## Probarlo en tu ordenador
```bash
npm run dev
```
Abre http://localhost:5173 en **dos pestañas** (o en dos dispositivos de tu wifi usando la IP de tu
ordenador): en una «Online: crear una sala» y en la otra «Online: unirme a una sala».

Versión de producción en local:
```bash
npm run build
npm start          # http://localhost:8787 (puerto configurable con PORT)
```

## Publicarlo en internet (Render, gratis)
El repositorio ya trae `render.yaml`, así que Render lo configura solo:

1. Crea una cuenta en https://render.com (puedes entrar con tu cuenta de GitHub).
2. **New → Blueprint** y elige el repositorio `Ink-and-Fangs`.
3. Pulsa **Apply**. Render instala, construye (`npm run build`) y arranca (`npm start`).
4. Te dará una dirección tipo `https://ink-and-fangs.onrender.com`: esa es la que compartes.

Cada vez que subas cambios a `main`, Render vuelve a desplegar automáticamente.

⚠️ En el plan gratuito el servidor **se duerme** tras 15 minutos sin uso: la primera visita tarda
unos 30-60 segundos en despertarlo. Las salas viven en memoria, así que al dormirse o redesplegar
se pierden las partidas en curso.
