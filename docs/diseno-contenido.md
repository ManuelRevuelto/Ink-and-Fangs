# Diseño del contenido — BORRADOR v0.1 (para revisar)

Todo lo de este documento es propuesta. Cambia nombres, costes o efectos a tu gusto: el código
leerá estos datos desde `src/data/`, así que equilibrar el juego después será solo editar números.

Dados: azul = Corriente (C), amarillo = Búsqueda (B), rojo = Ataque (A).

---

## 1. Cartas del pulpo (21)

Coste = bloques que hay que revelar (0–3). La concha doble cuenta como 2.

### Iniciales (🌿, 7 cartas) — forman el mazo de robo al empezar
| # | Nombre | Tipo | Coste | Efecto |
|---|---|---|---|---|
| 1 | Aprendizaje rápido | Aprender | 1 | Aprender 1 |
| 2 | Observar | Aprender | 1 | Aprender 1 |
| 3 | Deslizarse (×2) | Moverse | 1 | Intercambiar 2 bloques adyacentes |
| 4 | Remolino | Moverse | 2 | Barajar 2 bloques ocultos |
| 5 | Camuflaje (×2) | Ocultar | 0 | Ocultar 1 bloque |

### Montones para aprender (14 cartas, 4 colores, boca arriba)
**Comer (naranja, 4)** — coste 0, requiere pulpo adyacente a la comida:
| Nombre | Comida |
|---|---|
| Comer cangrejo | Cangrejo de roca roja (mano 5 + robar) |
| Comer langosta | Langosta (ocultar todos tus bloques) |
| Comer caracol | Caracol marino (buscar 1 carta en mazo/descarte) |
| Comer abulón | Abulón (aprender 3 gratis) |

**Aprender (azul, 3)**
| Nombre | Coste | Efecto |
|---|---|---|
| Sentidos agudos | 2 | Aprender 2. Las cartas obtenidas van a la mano (las de Comer no) |
| Memoria de tentáculo | 2 | Aprender 2 |
| Genio del arrecife | 3 | Aprender 3 |

**Esconderse (morado, 3)** — coste 0
| Nombre | Efecto |
|---|---|
| Mimetismo | Ocultar 2 bloques |
| Cambio de color | Ocultar 1 bloque y robar 1 carta |
| Sombra de las algas | Ocultar todos los bloques de zonas de algas |

**Moverse (amarillo, 4)**
| Nombre | Coste | Efecto |
|---|---|---|
| Arriesgarse | 1 | Barajar el bloque de la zona expuesta + 1 bloque oculto más (el de la expuesta puede ocultarse o revelarse antes de barajar) |
| Nube de tinta | 2 | Barajar 3 bloques ocultos (el pulpo puede revelarse como parte del coste) |
| Evasión repentina | 2 | Hacer 2 intercambios (puede repetirse el mismo bloque) |
| Huida a las rocas | 3 | Intercambiar 2 bloques ocultos cualesquiera, aunque no sean adyacentes |

---

## 2. Cartas del tiburón (20)

El coste se paga con la suma de puntos de la Energía almacenada (2 dados ≈ 7 de media).
Los dados de las cartas suman exactamente la reserva: 8 azules, 7 amarillos y 9 rojos.

| Nombre | Copias | Coste | Fase | Efecto | Dados |
|---|---|---|---|---|---|
| Agresivo | 3 | 7 / 7 / 5 | — | Sin efecto | A+A / A+A / A |
| Ágil | 2 | 3 | Mover | Girar 180° antes de moverte | C |
| Atrevido | 1 | 5 | Mover | Pasar otro dado de la reserva al hambre → un dado rojo pasa a 6 | A |
| Hostil | 1 | 8 | Cualquiera | Descartar al azar 1 carta de enfrentamiento del pulpo (+ su pareja) | A |
| Hambriento | 3 | 4 | Robar y tirar | Robar y tirar 1 dado extra | B |
| Observador | 2 | 3 | Buscar/Atacar | Ignorar el efecto de una trampa | B |
| Reactivo | 2 | 3 | Robar y tirar | Devolver 2 dados y elegir 1 mirando en la bolsa | C |
| Implacable | 2 | 5 | Mover | Volver a tirar 1 o 2 dados | C+B |
| Despiadado | 1 | 6 | Mover | Sumar a un dado el valor de otro dado de la reserva (máx. 6); el otro vuelve a la bolsa | A |
| Rápido | 2 | 2 | Mover | Mover 1 casilla extra | C |
| Vigilante | 1 | 6 | Tras tirar | Guardar 1 dado para un turno posterior | A |

---

## 3. Fichas de crecimiento (4) — 3 dados cada una, se activan de izquierda a derecha
| Ficha | Habilidad permanente |
|---|---|
| 1 | Una vez por turno, puedes volver a tirar 1 dado |
| 2 | Robas 3 dados en lugar de 2 |
| 3 | Una vez por turno, puedes volver a tirar 1 dado más (en total, 2 repeticiones) |
| 4 | Robas 4 dados en lugar de 3 |

---

## 4. Enfrentamiento (3 + 3)
El pulpo escapa si el tiburón no elige el mismo color. Tras escapar, se descartan las dos cartas de
ese color. En el tercer enfrentamiento, el tiburón gana siempre.

| Color | Pulpo (estrategia) | Si escapa |
|---|---|---|
| Amarillo | Huir | Baraja el pulpo y hasta 2 bloques ocultos más |
| Rojo | Luchar | El tiburón vuelve a una guarida (elige el pulpo) y pierde 1 corriente |
| Gris | Entintar | Oculta todos tus bloques |
