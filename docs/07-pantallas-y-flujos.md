# 07 · Pantallas y flujos

El prototipo tiene **una pantalla principal** (la ciudad) con paneles laterales, más las pantallas de entrada y un panel de administración. Todo funciona en navegador de escritorio y móvil; en móvil los paneles ocupan la parte inferior, la pantalla no se desplaza (el mapa es una ventana fija con zoom y el panel desplaza su propio contenido).

## Mapa de pantallas

```
/join/:token  ──registro──▶  /join/:token (elegir lote)  ──claim──▶  /city
/entrar  ──login──────────────────────────────────────────────────▶  /city
                                                                      ├── panel: Mi lote
                                                                      ├── panel: Lote ajeno
                                                                      ├── panel: Obra pública
                                                                      ├── panel: Barrio (qué falta)
                                                                      ├── modal: Mientras no estabas
                                                                      └── modal: Invitar
/clave  (contraseña nueva; adonde cae el mail de recuperación)
/admin  (solo is_admin)
```

## 1. Entrada · `/join/:token`

**Estado A — sin sesión.** Muestra el mapa de la ciudad de fondo (solo lectura, con los colores reales) y encima una tarjeta: "*Nombre del invitador* te invitó a *Ciudad Común*". Email, contraseña (mínimo 8) y el botón "Crear cuenta y elegir lote". No hay confirmación por email: al registrarse, la misma pantalla pasa al estado B sin recargar.

Debajo, "Ya tengo cuenta" cambia la tarjeta a entrar con la contraseña, sin salir del link. Es para quien se registró y se fue antes de fundar, o para quien ya juega y recibió otra invitación (en ese caso el estado C lo manda a la ciudad).

Si el token no es válido: "Esta invitación ya no sirve. Pedile otra a quien te invitó." Sin formulario.

**Estado B — con sesión, sin lote.** El mapa se vuelve interactivo. Los lotes libres que se pueden tomar (distancia ≤ 2 de un vecino activo) se ven con un borde punteado y los adyacentes al lote del invitador con un pulso suave. Los lotes libres que no se pueden tomar se ven apagados. Al tocar uno válido se abre la tarjeta de fundación:

- Apodo (2–24 caracteres; visible para todos)
- Nombre del lote (2–24)
- Color (8 muestras)
- Botón "Fundar acá"

Al confirmar, `claim_lot`. Si falla con `LOT_NOT_FREE`, el mapa se refresca y se pide elegir otro.

**Estado C — con sesión y lote.** Redirige a `/city`.

## 2. La ciudad · `/city`

### Layout

```
┌─────────────────────────────────────────────────┬──────────────┐
│ ● 3 jornadas   ▪ 32 ladrillo ▪ 15 madera ▪ 8 en │  [Panel]     │
│                                                 │              │
│              [ canvas del mapa ]                │  Mi lote /   │
│                                                 │  Lote ajeno /│
│                                                 │  Obra /      │
│  Barrio Fundadores · 31/41 · Escuela 62 %       │  Barrio      │
└─────────────────────────────────────────────────┴──────────────┘
```

Barra superior: jornadas (con puntos llenos/vacíos, 6 posiciones) e inventario. Pie del mapa: nombre del barrio visible, ocupación, progreso de la obra. Botón "Invitar" arriba a la derecha.

### El canvas

- Grilla 12×8, tile de tamaño fijo. La ciudad se apoya sobre un tablero de esquinas redondeadas con sombra.
- El suelo se mira desde arriba y lo construido se mira de frente con el ojo alto: se ve el frente y el techo entero (la planta del edificio, corrida hacia arriba tanto como mide la pared), nunca los costados. La luz viene de la izquierda: el techo es lo más claro, el frente va un tono más apagado y cada edificio tira sombra sobre el piso hacia la derecha, con una franja oscura donde la pared toca el suelo. Los volúmenes se pintan de arriba hacia abajo del mapa: lo que está más abajo está más cerca y tapa a lo de atrás.
- Calles: vereda, cordón claro y calzada que se encadena entre celdas, con línea de eje punteada, sendas peatonales al llegar a un cruce y arbolitos en la vereda.
- Tránsito, solo de adorno (no depende de nada del juego): pocos autos vistos desde arriba —algún taxi negro con techo amarillo y de vez en cuando un colectivo— cruzan la ciudad por las avenidas que van de borde a borde, por la mano derecha y sin doblar. En un cruce pasa una avenida por vez y frenan antes de la senda si alguien está cruzando. Transeúntes caminan por el medio de la vereda, doblan en las esquinas, cruzan por las sendas cuando no viene un auto y pasan por detrás de los arbolitos. Entran y salen por el borde del tablero. Unos 4 autos y 6 personas de día, menos al atardecer y apenas un par de cada uno de noche, cuando los autos llevan los faros prendidos. Con "reducir movimiento" activado en el sistema no aparecen.
- El lote construido no se pinta: el edificio se apoya directo sobre el mapa, sin cuadro de color detrás, y el color elegido por el dueño va en las paredes. El lote tomado que todavía no tiene nada construido sí muestra la marca del lote en ese color. El nivel se ve en el alto de las paredes y en cuántas ventanas tiene el frente (una por nivel).
- Tipo de edificio: cada oficio es un edificio distinto, no un objeto ni un glifo. Ladrillería: fábrica de ladrillo a la vista, losa con parapeto y claraboyas y una chimenea parada sobre el techo que humea mientras el lote está activo. Aserradero: galpón de madera con el techo a dos aguas de punta al frente, óculo en el frontón, portón y troncos apilados al costado. Generador: usina angosta y alta, losa con dos chimeneas cortas y el rayo pintado sobre la losa. Plaza: el lote no se edifica — cantero con camino, un kiosco con techo en punta en el medio y un árbol por nivel. El glifo (■ ▲ ⚡ ✿) queda solo en los paneles. Sin sprites ni imágenes: todo son formas del canvas.
- Estado: `activo` color pleno; `descuidado` color desaturado al 50 % con un ícono de pasto; `abandonado` gris con ícono de "cuidar" (una mano) visible.
- Construcción en curso: borde animado (línea que gira) y un pequeño reloj con el tiempo restante al hacer hover o tocar.
- Obra pública: celda distinta (más grande visualmente, con borde doble), un edificio cívico con columnas y frontón en el mismo punto de vista, y una barra de progreso dibujada en la parte inferior. Completa, se pone dorada.
- Lotes libres: borde punteado tenue. Lotes de barrio cerrado: casi invisibles, con el nombre del barrio en gris y "se abre pronto".
- Día/noche: el fondo del canvas cambia según la hora de la ciudad; de noche los lotes `activo` muestran 1 a 3 luces amarillas (ventanas del edificio, o faroles si es una plaza).
- Hover/tap sobre un lote: tooltip con nombre del lote y apodo del dueño. Click: abre el panel correspondiente.
- Acercar y alejar: pellizco en el celular, rueda del mouse en escritorio, hasta 4×. Con el mapa acercado, arrastrar lo corre y aparece un botón "Ver toda la ciudad". Nunca se puede alejar más que la ciudad entera, ni correrla más allá del borde. Un arrastre no abre paneles.
- Redibujo total en cada cambio de estado. Sin optimización.

### Panel: Mi lote

- Nombre del lote (editable inline) y color (muestras).
- Edificio actual: tipo, nivel, tasa de producción efectiva por hora con desglose ("2/h base · +10 % plaza vecina").
- Si no hay edificio: selector de tipo con la frase "En tu barrio escasea: **energía**" calculada en el cliente (material con menor producción total del barrio). Costo del nivel 1 y botón "Construir (1 jornada, 2 h)".
- Si hay edificio y nivel < 3: costo del siguiente nivel, materiales que faltan en rojo, botón "Mejorar". Si faltan materiales, debajo: "Pediles a tus vecinos" con la lista de quiénes producen ese material en el barrio.
- Si hay construcción en curso: tiempo restante, quiénes ayudaron.
- Sección "Quién pasó por acá": visitas de los últimos 7 días.

### Panel: Lote ajeno

Al abrirse llama a `visit_lot`.

- Nombre del lote, apodo del dueño, "por acá desde el 14 de sep", tipo y nivel.
- Estado con explicación humana: "Activo", "Hace 5 días que no viene" (descuidado), "Abandonado hace 9 días".
- Acciones según estado:
  - Construcción en curso → "Ayudar (1 jornada, −1 h)". Deshabilitado si ya ayudó.
  - `descuidado` / `abandonado` → "Cuidar (1 jornada, +2 días)". Muestra cuidados restantes.
  - Siempre → "Regalar materiales": selector de material, cantidad (mínimo 5, máximo lo que tengo), botón.

### Panel: Obra pública

- Nombre, barrio, efecto al completarse.
- Cuatro barras: ladrillo, madera, energía, jornadas, con "falta N".
- Formulario de aporte: tres campos numéricos prellenados con `min(lo que tengo, lo que falta)`, botón "Aportar (1 jornada)". Se puede aportar con los tres campos en cero.
- Placa: lista de contribuyentes ordenada por cantidad de aportes, con el propio destacado. Cuando la obra se completa, la placa queda fija con el título "La construyeron".

### Panel: Barrio (qué falta)

Se abre desde el pie del mapa. Muestra: producción total del barrio por material, cuántos lotes de cada tipo hay, cuántos lotes libres, y la obra con su progreso. Es la pantalla que le dice a un nuevo qué construir y a un veterano a quién ayudar.

### Modal: Mientras no estabas

Aparece al entrar si `heartbeat().show_summary`. Lista de líneas, con el orden de prioridad de `05-reglas-y-parametros.md` §11:

> Tu **aserradero** subió a nivel 2.
> **Marta** ayudó en tu construcción.
> **Julián** te regaló 20 de energía.
> La **Escuela** avanzó del 40 % al 62 %.
> **3 vecinos** pasaron por tu lote.
> Recogiste **46 de madera**.

Un solo botón: "Ver la ciudad". Máximo 8 líneas; si hay más, "y 4 cosas más" que expande.

### Modal: Invitar

Genera el token, muestra la URL y un botón de copiar y otro de compartir por WhatsApp (`https://wa.me/?text=...`). Texto sugerido: "Te guardé un lote al lado del mío en Ciudad Común: <url>".

### Avisos en vivo

Un toast discreto en la esquina cuando llega un evento dirigido al jugador por Realtime (ayuda recibida, regalo, obra completada, barrio abierto). Se apila, desaparece a los 6 segundos.

## 3. Entrar · `/entrar` y `/clave`

`/entrar` es la puerta de vuelta: una tarjeta centrada con email, contraseña y "Entrar". No se registra nadie acá; la cuenta se crea desde el link de invitación. Abajo hay dos cosas: "Olvidé mi contraseña", que cambia la tarjeta a pedir el mail de recuperación ("Revisá tu email"), y una línea para quien todavía no tiene lote ("Abrí el link que te pasaron").

`/city` y `/admin` sin sesión redirigen acá.

`/clave` es adonde vuelve el link de recuperación: pide la contraseña nueva y entra a la ciudad. Si el link venció o ya se usó, no hay sesión y la tarjeta ofrece pedir otro.

## 4. Administración · `/admin`

Solo `is_admin`. Una página sin diseño:

- Tarjeta con `admin_city_stats()`: jugadores, activos hoy, lotes por estado, construcciones activas, obras, avisos pendientes, nuevos en 24 h (para hacer de padrino).
- Botón "Abrir Barrio del Río" con confirmación.
- Tabla de `notifications_outbox` pendientes con botón "Marcar enviado" por fila, para el modo manual.
- Lista de invitaciones sin usar con sus URLs, para repartir.

## Flujo de la primera sesión (guion)

Este es el recorrido que el diseño intenta producir. Sirve para probar a mano antes de invitar a nadie.

1. Recibo por WhatsApp un link de alguien que conozco. Lo abro en el celular. Veo un mapa con colores y una tarjeta con el nombre de quien me invitó. Pongo mi email y elijo una contraseña.
2. Sin salir de la pantalla, el mapa se vuelve interactivo: hay lotes con borde punteado y uno o dos que pulsan al lado del lote de mi amigo. Toco uno.
3. Pongo un apodo, un nombre para el lote, elijo un color. "Fundar acá". El lote aparece con mi color. Tengo 3 jornadas y un kit de materiales.
4. Se abre el panel de mi lote. Dice que en el barrio escasea energía. Elijo generador. "Construir (1 jornada, 2 h)". El lote tiene borde animado. Me quedan 2 jornadas.
5. El pie del mapa dice "Escuela 62 %". La toco. Veo la barra, la placa con nombres, un formulario prellenado con mis 10 de energía. "Aportar (1 jornada)". La barra sube un poco y mi apodo aparece en la lista. Me queda 1 jornada.
6. Toco el lote de mi amigo. Veo que está construyendo. "Ayudar (1 jornada, −1 h)". Lo hago. Me quedan 0.
7. Cierro. Dos horas después me llega un email: "Tu generador está listo". Entro. Modal: "Tu generador subió a nivel 1. Marta ayudó en tu construcción. 2 vecinos pasaron por tu lote."

Si en el paso 7 la persona vuelve a entrar al día siguiente por su cuenta, el diseño funcionó.
