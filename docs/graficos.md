# 🎨 Cómo poner tus gráficos en Ink and Fangs

El juego usa gráficos **provisionales** (emojis y colores). Para cambiarlos por los tuyos **no hace falta
tocar código**: deja tus imágenes en la carpeta `public/assets/` con estos nombres exactos (en **PNG**,
mejor con fondo transparente) y recarga la página. Las que no existan siguen con el gráfico provisional,
así que puedes ir poniéndolas poco a poco.

## Bloques (se ven en el centro de cada zona)
| Fichero | Qué es | Tamaño recomendado |
|---|---|---|
| `pulpo.png` | El pulpo | 256×256 |
| `concha.png` | Concha | 256×256 |
| `conchaDoble.png` | Concha doble | 256×256 |
| `trampa.png` | Trampa (la misma imagen para las 4; el tipo se escribe debajo) | 256×256 |
| `cangrejo.png` | Comida: cangrejo de roca roja | 256×256 |
| `langosta.png` | Comida: langosta | 256×256 |
| `caracol.png` | Comida: caracol marino | 256×256 |
| `abulon.png` | Comida: abulón | 256×256 |
| `oculto.png` | Dorso de un bloque oculto (lo que ve el tiburón) | 256×288 (proporción 8:9) |

## Tablero
| Fichero | Qué es | Tamaño recomendado |
|---|---|---|
| `tiburon.png` | La ficha del tiburón (vista desde arriba) | 192×192 |
| `roca.png` | Textura de las zonas de roca (se recorta con la forma de la zona) | 512×512 |
| `algas.png` | Textura de las zonas de algas | 512×512 |
| `expuesta.png` | Textura de la zona expuesta (centro) | 512×512 |
| `fondo.png` | Fondo de todo el tablero (detrás del círculo) | 1280×1280 |

## Consejos
- Las imágenes se escalan manteniendo su proporción: si son cuadradas, mejor.
- Las texturas de las zonas se recortan con la forma de cada zona (gajos curvos en las rocas).
- Para cambiar colores, tipografías o el aspecto de los paneles: `src/ui/style.css`.
- Para cambiar cómo se dibuja algo del tablero (tamaños, posiciones): `src/ui/board.ts`.
- Los sonidos son sintéticos y están en `src/ui/sound.ts`.
