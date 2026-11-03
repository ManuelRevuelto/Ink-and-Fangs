# Decisiones de reglas de Ink and Fangs (aclaraciones sobre `reglas-original.md`)

Registro de lo que hemos decidido cuando las reglas dejaban dudas. El motor implementa esto.

## Tablero
- Tablero **redondo** dividido en 3×3 zonas: roca (5+) en las «esquinas», algas (4+) en los lados, expuesta (2+) en el centro.
- 24 casillas de corriente en los bordes de las zonas; el tiburón cambia de casilla atravesando cruces.
- **4 guaridas**, una por cada zona de roca, en uno de sus dos bordes exteriores (en simetría de giro). El otro borde exterior es una casilla normal por la que pasa el tiburón.

## Pulpo
- **Barajar:** los bloques se recolocan **al azar** en los huecos vacíos (el tiburón no elige).
- **Cartas jugadas** van a la pila de descarte y se rebarajan cuando se acaba el mazo.
- **Acción «descartar 1 y ocultar 1»:** la carta va a la pila de descarte (no sale del juego).
- **Efectos que dicen «descartar/deshacer una carta»:** esa carta sale del juego.
- Conchas de repuesto (al comer): ilimitadas.
- Al aprender un bloque, se cambia por un bloque revelado del tablero que no sea el pulpo ni comida.

## Tiburón
- **Cadenas de corrientes:** la primera corriente en la que entras siempre se puede usar, valga lo
  que valga; a partir de la segunda, cada dado debe ser menor que el anterior.
- No puedes terminar el movimiento sobre una corriente.
- Si no hay ninguna ruta legal, el tiburón se queda quieto ese turno.
- Energía: máximo 3 dados almacenados; los que sobren vuelven a la bolsa. Con 3, es obligatorio gastar.

## Enfrentamiento
- Las cartas de enfrentamiento gastadas salen del juego.

## Interpretaciones del motor (v0.1, pendientes de confirmar jugando)
- **Coste:** se paga revelando bloques ocultos; no se puede revelar de más (si sobra un bloque, es error).
- **Aprender N:** se pueden coger entre 1 y N cosas. Las cartas «Comer» traen su comida, que entra
  cambiándose por un bloque revelado.
- **Barajar N:** exactamente N bloques ocultos. «Arriesgarse» oculta primero el de la zona expuesta.
- **Ocultar N:** entre 1 y N bloques revelados.
- **Trampas:** solo se activan cuando se revelan por primera vez (búsqueda o ataque). Si el
  tiburón tiene «Observador», decide antes si la ignora.
- **Ataque:** el dado rojo va al hambre justo después del ataque (tras el enfrentamiento si era el pulpo).
- **Enfrentamiento:** si al pulpo solo le queda 1 carta, el tiburón gana directamente.
- **Energía:** con 3 dados es obligatorio gastar. Si no se puede pagar ninguna carta, igualmente
  se gasta (1 dado al hambre y el resto a la bolsa).
- **Vigilante:** el dado guardado se recupera en un turno posterior, antes de moverse.
