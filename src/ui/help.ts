/** Ayuda «¿Cómo se juega?» (resumen de las reglas de docs/reglas-original.md y docs/decisiones.md). */
export const HELP_HTML = `
<h1>📖 ¿Cómo se juega?</h1>
<div class="help-cols">
  <section>
    <h2>🐙 El pulpo</h2>
    <p><b>Gana</b> si se come las <b>4 comidas</b> o si el tiburón se <b>agota</b> (7 dados de hambre).</p>
    <p>Los 9 bloques del tablero están <b>ocultos</b>: solo tú sabes cuál es el pulpo. El tiburón ve «?».</p>
    <p>En tu turno haces <b>2 acciones</b> (puedes repetir):</p>
    <ul>
      <li><b>Jugar una carta</b>: paga su coste revelando bloques ocultos (la concha doble vale 2).</li>
      <li><b>Robar</b> hasta completar la mano.</li>
      <li><b>Descartar</b> una carta y ocultar 1 bloque.</li>
    </ul>
    <p><b>Moverse</b>: intercambiar bloques vecinos o barajarlos (el tiburón pierde la pista).
    <b>Esconderse</b>: volver a ocultar bloques. <b>Aprender</b>: conseguir cartas o bloques nuevos (trampas, comida…).
    <b>Comer</b> (1 acción): con el pulpo junto a la comida y su carta en la mano. La carta de comer se gasta para siempre y el poder de esa comida se aplica al momento: 🦀 mano de 5 · 🦞 ocultas todo · 🐌 buscas una carta · 🦪 aprendes 3 gratis.</p>
    <p>💡 Revelar un bloque da pistas al tiburón: paga con bloques que ya haya descartado.</p>
  </section>
  <section>
    <h2>🦈 El tiburón</h2>
    <p><b>Gana</b> si ataca al pulpo y lo vence en el <b>enfrentamiento</b>.</p>
    <p>Tu turno, en orden:</p>
    <ol>
      <li><b>Saca y tira</b> 2 dados de la bolsa.</li>
      <li><b>Corrientes</b> (🟦 azules): colócalas en casillas libres para nadar más lejos.</li>
      <li><b>Muévete</b> (obligatorio, sin dar la vuelta). Por corrientes nadas de número mayor a menor.</li>
      <li><b>Busca</b> (🟨) o <b>ataca</b> (🟥) en las zonas junto a ti: el dado debe igualar o superar el valor de la zona
        (rocas 5+, algas 4+, centro 2+).</li>
      <li><b>Crecimiento</b>: las búsquedas y la primera corriente te dan habilidades permanentes.</li>
      <li><b>Energía</b>: los dados sobrantes se guardan. Gastarla compra cartas (y dados rojos), pero da <b>hambre</b>.
        Con 3 dados guardados es obligatorio gastar.</li>
    </ol>
    <p>⚠️ Atacar y gastar energía dan hambre. Con 7, te agotas y gana el pulpo.</p>
  </section>
</div>
<section>
  <h2>⚔️ Enfrentamiento</h2>
  <p>Si el tiburón ataca al pulpo, ambos eligen en secreto un color. Si el tiburón acierta, gana.
  Si no, el pulpo escapa con su estrategia y esas cartas se descartan. En el tercer enfrentamiento el tiburón gana siempre.</p>
  <h2>🗺️ El tablero</h2>
  <p>Bosque de algas redondo con 9 zonas. Cada zona de roca tiene una <b>guarida</b> (🟥 casilla roja) en su borde exterior.
  El tiburón nada por las casillas de corriente entre las zonas.</p>
  <p class="small">Durante la partida, sigue las instrucciones de la barra inferior: lo que puedes pulsar se resalta en amarillo.</p>
</section>
`;
