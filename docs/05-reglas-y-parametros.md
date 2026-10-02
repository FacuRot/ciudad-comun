# 05 · Reglas y parámetros del prototipo

Este es el documento de balance. Todos los números viven además en `game_config` (JSONB) y se pueden cambiar sin deploy. Los valores de acá son los **iniciales**; se recalibran con datos.

Zona horaria del juego: `America/Argentina/Buenos_Aires`. "Un día" es un día calendario en esa zona.

## 1. Jornadas

| Parámetro | Valor | Clave en config |
|-----------|-------|-----------------|
| Jornadas por día | 3 | `jornadas.per_day` |
| Máximo acumulable | 6 | `jornadas.cap` |
| Momento de recarga | 00:00 hora del juego | `jornadas.refill_hour` |
| Jornadas al registrarse | 3 | `jornadas.initial` |

- La recarga suma `per_day` hasta `cap`. Nunca se pierde una recarga por estar en el tope: simplemente no sube más.
- No existe ninguna forma de obtener jornadas fuera de la recarga. Ninguna acción las devuelve.
- Cada acción que consume jornada lo hace atómicamente en la misma transacción que aplica el efecto.

### Qué consume una jornada

| Acción | Consume | Sobre |
|--------|---------|-------|
| Construir / mejorar mi edificio | 1 | Mi lote |
| Ayudar una construcción ajena | 1 | Lote ajeno |
| Aportar a una obra pública | 1 | Barrio |
| Cuidar un lote abandonado | 1 | Lote ajeno |
| Mantener calles (§18) | 1 | Barrio |
| Regalar materiales | 0 | Jugador ajeno |
| Nombrar / cambiar color del lote | 0 | Mi lote |
| Recoger producción | 0 (automático) | Mi lote |

Las acciones con jornada sobre cosas ajenas (ayudar, aportar, cuidar, mantener calles) son las que cuentan para la métrica de "jornadas colectivas" del experimento. Regalar cuenta aparte como "gestos".

## 2. Materiales

Tres tipos: `ladrillo`, `madera`, `energia`.

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Kit inicial al registrarse | 20 ladrillo, 20 madera, 10 energía | `materials.starter` |
| Tope de acumulación sin recoger | 48 horas de producción | `production.accrual_cap_hours` |

- El inventario es por jugador, no por lote.
- La producción se **calcula perezosamente**: `producido = tasa_efectiva × horas desde production_collected_at`, con tope de 48 h. Se recoge automáticamente al entrar al juego y antes de cualquier acción del jugador.
- Se entregan unidades enteras y la fracción sigue acumulando: el reloj avanza solo por lo entregado, así que entrar seguido no hace perder producción (corregido el 13/09/2026; antes cada recogida reiniciaba la cuenta aunque diera cero).
- El kit inicial alcanza exactamente para construir el nivel 1 de cualquier edificio. A partir del nivel 2, ningún jugador puede avanzar solo.

## 3. Edificios

Cinco tipos, tres niveles. Cada lote tiene un solo edificio. El tipo se elige al construir el nivel 1 y no se cambia en el prototipo.

| Tipo | Produce | Efecto |
|------|---------|--------|
| `ladrilleria` | ladrillo | — |
| `aserradero` | madera | — |
| `generador` | energía | — |
| `plaza` | nada | +10 % de producción a cada lote ortogonalmente adyacente (máximo +20 % por lote receptor, acumulando plazas) |
| `residencial` | Alquiler: el material que elige el dueño, según el atractivo del barrio (§17.1) | Aloja 30 / 60 / 100 ciudadanos según el nivel, en vez de 10 (§16.1) |

### Producción por nivel (unidades por hora)

| Nivel | Tasa base |
|-------|-----------|
| 1 | 2 |
| 2 | 3 |
| 3 | 5 |

Una ladrillería nivel 1 produce 48 ladrillos por día. Un nivel 2 necesita 70 materiales de tres tipos: el propio se junta en un día, los otros dos hay que pedirlos.

### Costos y tiempos de construcción

| Nivel | Ladrillo | Madera | Energía | Jornadas | Duración |
|-------|----------|--------|---------|----------|----------|
| 1 | 15 | 10 | 0 | 1 | 2 h |
| 2 | 30 | 25 | 15 | 1 | 3 h |
| 3 | 60 | 50 | 40 | 1 | 6 h |

Tiempos reducidos a la mitad el 13/09/2026 (antes 4 / 6 / 12 h, con ayuda de −2 h).

La plaza y el residencial usan la misma tabla. Los materiales se descuentan al iniciar la construcción; no se devuelven.

Mientras hay una construcción en curso en el lote, no se puede iniciar otra. El nivel anterior sigue produciendo durante la mejora.

### Tasa efectiva de producción

```
tasa_efectiva = tasa_base(nivel)
              × bonus_plazas        (1.0, 1.1 o 1.2)
              × bonus_obra_barrio   (1.15 si la obra del barrio está terminada, si no 1.0)
              × factor_estado       (activo 1.0, descuidado 0.5, abandonado 0.0)
              × atractivo_barrio    (solo el residencial, §17.1; los demás tipos, 1.0)
```

Sin el último factor, la fórmula es la "tasa de §3" que usan el abastecimiento (§16.2) y el alquiler (§17.1).

## 4. Ayudar una construcción ajena

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Reducción por ayuda | 1 hora | `help.hours_reduced` |
| Ayudas máximas por jugador por construcción | 1 | `help.max_per_helper` |

- Cuesta 1 jornada. No se puede ayudar la propia construcción.
- Si al restar 1 hora el tiempo restante queda en cero o menos, la construcción se completa en el acto.
- El ayudante queda registrado en el evento y aparece en el resumen del dueño.

## 5. Obras públicas

Una por barrio. Nadie las inicia: existen desde el seed con progreso cero y se ven en el mapa como un lote especial con barra.

| Obra | Barrio | Ladrillo | Madera | Energía | Jornadas | Efecto al completarse |
|------|--------|----------|--------|---------|----------|-----------------------|
| Escuela | 1 | 500 | 400 | 300 | 90 | +15 % de producción para todos los lotes del Barrio 1 |
| Hospital | 2 | 400 | 300 | 300 | 60 | +15 % de producción para todos los lotes del Barrio 2 |

### Aportar

- Cuesta **1 jornada por aporte**. Mientras a la obra le falten jornadas, el aporte puede llevar cualquier cantidad de materiales (incluso cero: la jornada sola cuenta como "jornada de obra").
- Cada aporte suma 1 al contador de jornadas de la obra, hasta el objetivo, y los materiales entregados a cada contador. Un aporte no puede entregar más de lo que falta de cada material, ni el contador de jornadas pasa del objetivo.
- Con las jornadas completas, la jornada sola ya no suma: el aporte tiene que llevar al menos una unidad de algún material que falte. Si no lleva ninguno, se rechaza y no cuesta la jornada. Si lleva, cuesta 1 jornada como siempre.
- Se puede aportar a la obra de cualquier barrio de la ciudad, no solo al propio.
- La obra se completa cuando los cuatro contadores llegan a su objetivo. Al completarse: evento `public_work.completed` para toda la ciudad, la placa queda fija con todos los contribuyentes ordenados por cantidad de aportes, y se activa el bonus.

Orden de magnitud: con 40 jugadores produciendo ~48 materiales por día cada uno, la ciudad genera ~1.900 materiales diarios. La Escuela necesita 1.200. Debería completarse entre el día 4 y el 8 si la gente aporta; si no se completa en la semana 1, eso es un dato.

## 6. Estados del lote y decaimiento

El estado depende de los **días desde la última entrada del dueño** (`players.last_seen_at`), no de la actividad del lote.

| Estado | Días sin entrar (efectivos) | Producción | Visual |
|--------|-----------------------------|------------|--------|
| `activo` | 0–3 | 100 % | Ventanas encendidas de noche |
| `descuidado` | 4–7 | 50 % | Color desaturado, sin ventanas |
| `abandonado` | 8+ | 0 % | Gris, ícono de "cuidar" visible para vecinos |

- **Días efectivos** = días desde `last_seen_at` − días de cuidado acumulados en esta ausencia.
- El estado se recalcula por cron una vez al día (00:10 hora del juego) y en el momento en que el dueño entra (vuelve a `activo` inmediatamente, sin costo).
- Sin ruinas en el prototipo: un lote `abandonado` se queda así indefinidamente.

### Cuidar

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Días que suma cada cuidado | 2 | `care.days_added` |
| Cuidados máximos por ausencia | 3 | `care.max_per_absence` |
| Estado mínimo para poder cuidar | `descuidado` | `care.min_state` |

- Cuesta 1 jornada. No se puede cuidar el propio lote.
- Suma 2 días de gracia: el lote retrocede o se mantiene según los días efectivos resultantes.
- El contador de cuidados se reinicia cuando el dueño vuelve.
- El cuidador queda en el evento; el dueño lo ve en su resumen al volver.

## 7. Regalar materiales

- No cuesta jornada. Se regala a cualquier jugador de la ciudad, cualquier cantidad que se tenga.
- Mínimo por regalo: 5 unidades (para que no sea spam de 1 unidad).
- Registra evento `gift.sent` con emisor, receptor, material y cantidad. El receptor lo ve en su resumen.

### 7.1 Pedidos y lo que le falta a cada lote

Ampliación aprobada el 01/10/2026.

- **Pedir:** cada jugador puede tener un pedido abierto: un material y una cantidad entre `request.min_amount` (5) y `request.max_amount` (100). No cuesta jornada. Un pedido nuevo reemplaza al anterior.
- Se ve en el mapa como una burbuja de diálogo sobre el edificio, con el color del material y cuánto falta recibir.
- **Se cubre con regalos:** cada regalo de ese material al dueño suma a lo recibido; cuando llega a la cantidad pedida, el pedido se borra solo. Los regalos de otro material no cuentan. El dueño también lo puede quitar.
- **Lo que le falta a un vecino:** el panel de un lote ajeno muestra, por material, cuánto le falta para el próximo nivel (el siguiente al que se está construyendo, si hay obra). Cuenta su inventario más la producción que todavía no recogió. Nunca se ve el inventario de otro, solo el faltante.

## 8. Lotes, barrios y apertura

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Grilla | 12 columnas × 8 filas | seed |
| Lotes Barrio 1 | 41 | seed |
| Lotes Barrio 2 | 34 | seed |
| Distancia máxima a un lote ocupado para poder tomar uno libre | 2 (Manhattan) | `lots.max_claim_distance` |
| Apertura del Barrio 2 | 300 ciudadanos en el Barrio 1 (§16.4), ≥ 85 % de lotes del Barrio 1 ocupados **o** 10 días desde `cities.opened_at`, lo que ocurra primero. El admin puede forzarla. | `barrio.open_population`, `barrio.open_threshold`, `barrio.open_after_days` |

- **Nunca un lote aislado:** un lote libre solo se puede tomar si está a distancia ≤ 2 de un lote ocupado por un jugador activo o descuidado. En una ciudad vacía, cualquier lote del Barrio 1 es válido.
- El link de invitación lleva el lote del que invita; la UI destaca los lotes libres adyacentes a ese lote como sugerencia.
- Un jugador tiene exactamente un lote en el prototipo.
- Apertura del Barrio 2: evento `barrio.opened` a toda la ciudad, con `reason` según la vía (`population`, `threshold`, `time` o `admin`); los lotes pasan de `cerrado` a `libre`, la población arranca en 0 y las calles en 100.

## 9. Nombre y color del lote

- Nombre: 2 a 24 caracteres, único dentro de la ciudad, editable sin costo.
- Color: uno de 8 de la paleta (`config.palette`): terracota, ocre, oliva, teal, azul, lila, rosa, gris. Editable sin costo.
- Se muestra el nombre del lote, no el email ni el nombre real. El jugador elige un apodo al registrarse (`players.display_name`).

## 10. Visitas

- Abrir el panel de un lote ajeno registra `lot.visited` (visitante, lote), como máximo una vez por visitante por lote por día.
- El dueño ve en su resumen "N vecinos pasaron por tu lote" y, si toca, los nombres.

## 11. Resumen "mientras no estabas"

Se muestra al entrar si pasaron más de 2 horas desde `last_seen_at` (igual que el nivel 1, para que al volver cuando termina la primera construcción el resumen lo cuente; antes del 13/09/2026 eran 4 horas). Contiene, en este orden de prioridad:

1. Construcciones propias terminadas.
2. Ayudas recibidas (quién).
3. Regalos recibidos (quién, qué).
4. Cuidados recibidos (quién).
5. Obras públicas: progreso desde la última vez, y completadas.
6. Barrio abierto.
7. Ciudadanos de tu barrio: "llegaron N / se fueron N", con lo que más resta al atractivo (§16.2). Si las calles están gastadas o rotas (§18), un aviso. Al dueño de un residencial, cuánto rindió el alquiler (§17.2).
8. Vecinos nuevos a distancia ≤ 2.
9. Visitas recibidas (cantidad).
10. Materiales producidos y recogidos (el del residencial ya va en la línea 7).

Se genera consultando `events` desde `last_seen_at`. No se guarda aparte. La línea 7 entró el 29/09/2026 con los ciudadanos; antes el resumen tenía nueve.

## 12. Día y noche

El mapa se pinta según la hora actual en la zona horaria de la ciudad: noche de 20:00 a 07:00, atardecer de 18:00 a 20:00 y de 06:00 a 07:00, día el resto. Las ventanas se encienden solo en lotes `activo`. Es puramente visual y se calcula en el cliente.

## 13. Cron (jobs programados)

| Job | Horario (hora del juego) | Qué hace |
|-----|--------------------------|----------|
| `refill_jornadas` | 00:00 diario | `jornadas = LEAST(jornadas + per_day, cap)` para todos los jugadores de la ciudad |
| `update_lot_states` | 00:10 diario | Recalcula `lots.state` según días efectivos |
| `update_population` | 00:20 diario | Mueve la población de cada barrio abierto hacia su objetivo (§16.3) y después revisa la apertura del Barrio 2 |
| `complete_constructions` | cada 5 minutos | Cierra construcciones con `ends_at <= now()`, sube el nivel, emite evento |
| `check_barrio_opening` | cada hora | Abre el Barrio 2 si se cumple la condición |

Todos son idempotentes: correrlos dos veces no produce efectos dobles. `update_population` corre después de `update_lot_states` para usar los estados del día; una actualización por barrio por día del juego. El desgaste de las calles no tiene job: se calcula al leerlo (§18).

## 14. Configuración inicial (`game_config`)

```json
{
  "jornadas": { "per_day": 3, "cap": 6, "initial": 3, "refill_hour": 0 },
  "materials": { "types": ["ladrillo", "madera", "energia"],
                 "starter": { "ladrillo": 20, "madera": 20, "energia": 10 } },
  "production": { "rate_by_level": { "1": 2, "2": 3, "3": 5 }, "accrual_cap_hours": 48,
                  "state_factor": { "activo": 1.0, "descuidado": 0.5, "abandonado": 0.0 },
                  "plaza_bonus": 0.10, "plaza_bonus_cap": 0.20, "public_work_bonus": 0.15 },
  "buildings": {
    "types": ["ladrilleria", "aserradero", "generador", "plaza", "residencial"],
    "produces": { "ladrilleria": "ladrillo", "aserradero": "madera", "generador": "energia",
                  "plaza": null, "residencial": null },
    "levels": {
      "1": { "cost": { "ladrillo": 15, "madera": 10, "energia": 0 },  "hours": 2 },
      "2": { "cost": { "ladrillo": 30, "madera": 25, "energia": 15 }, "hours": 3 },
      "3": { "cost": { "ladrillo": 60, "madera": 50, "energia": 40 }, "hours": 6 }
    }
  },
  "help": { "hours_reduced": 1, "max_per_helper": 1 },
  "care": { "days_added": 2, "max_per_absence": 3, "min_state": "descuidado" },
  "decay": { "descuidado_after_days": 4, "abandonado_after_days": 8 },
  "gift": { "min_amount": 5 },
  "request": { "min_amount": 5, "max_amount": 100 },
  "lots": { "max_claim_distance": 2 },
  "barrio": { "open_threshold": 0.85, "open_after_days": 10, "open_population": 300 },
  "summary": { "min_hours_away": 2 },
  "palette": ["terracota", "ocre", "oliva", "teal", "azul", "lila", "rosa", "gris"],
  "citizens": { "capacity_per_lot": 10, "consumption_per_day": 2,
                "weights": { "lotes": 0.3, "calles": 0.3, "abastecimiento": 0.3, "obra": 0.1 },
                "arrival_rate": 0.30, "departure_rate": 0.15 },
  "residential": { "capacity_by_level": { "1": 30, "2": 60, "3": 100 } },
  "streets": { "initial": 100, "decay_per_day": 10, "points": 4,
               "cost": { "ladrillo": 10 }, "max_per_player_per_day": 1,
               "worn_below": 70, "broken_below": 40 }
}
```

`produces.residencial` es `null` porque el material del alquiler lo elige el dueño y queda guardado en el lote (`lots.rent_material`).

## 15. Qué vigilar durante la prueba (señales de desbalance)

- **La Escuela se completa antes del día 3:** los costos de obra son bajos; subirlos para la cohorte 2.
- **Nadie llega a nivel 2 en la semana 1:** los materiales cruzados son demasiado escasos o nadie regala; revisar el kit inicial o el mínimo de regalo antes de tocar costos.
- **Muchas jornadas sin usar al final del día (cap alcanzado):** hay poco que hacer; no bajar el cap, agregar destinos para la jornada.
- **Todos construyen plazas:** el bonus es demasiado alto o la gente prefiere el gesto pro-social; el segundo caso es una buena noticia.
- **Nadie cuida lotes:** o nadie se ausentó (bien) o cuidar no se ve; revisar el ícono en el mapa antes que la regla.
- **Nadie construye residenciales:** la vía de la población queda muerta. Mirar el atractivo promedio: si ronda 0,6, el alquiler no compensa y el problema es el barrio, no el residencial.
- **Más de un tercio de los lotes son residenciales:** el alquiler compensa demasiado, o el abastecimiento no está frenando. Revisar el consumo por ciudadano antes que la capacidad.
- **Los dueños de residenciales no mantienen calles más que el resto:** el alquiler no los está moviendo. Revisar que el resumen y el panel muestren lo que más resta.
- **Las calles siempre en 100:** o el desgaste es bajo, o mantener es una tarea que gusta (buena noticia). Mirar cuántos jugadores distintos mantienen.
- **Las calles llegan a 0 en la primera semana:** nadie las ve o cuesta demasiado. Revisar lo que se ve en el mapa antes que los números.
- **El abastecimiento siempre en 1:** el consumo es bajo y el factor no dice nada.

## 16. Ciudadanos

Ampliación del alcance aprobada el 29/09/2026 (propuesta del 28/09). Los números de §16 a §18 son iniciales y se calibran con el script de bots antes de la cohorte.

Cada barrio tiene una población de ciudadanos: gente que no juega, vive en el barrio y se muda según cómo esté. Es el termómetro colectivo: sube si el barrio está habitado, mantenido y abastecido, y baja si no.

Los ciudadanos **no tocan la producción ni las jornadas de nadie**. Si lo hicieran, se armaría una espiral (se va gente → se produce menos → se va más gente) y el que se queda pagaría por el que se fue. La única excepción es el alquiler del residencial (§17.1), y es buscada: solo la sufre quien eligió depender del barrio. Lo que dan:

- **Abren el Barrio 2** por una vía nueva (§16.4).
- **Se ven:** la gente que camina por las veredas de cada barrio crece con su población.

### 16.1 Capacidad

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Ciudadanos por lote con edificio (cualquier tipo salvo residencial) | 10 | `citizens.capacity_per_lot` |
| Ciudadanos por residencial, nivel 1 / 2 / 3 | 30 / 60 / 100 | `residential.capacity_by_level` |

- Capacidad del barrio = suma de lo que alojan sus lotes con edificio de nivel 1 o más. Un lote libre, o con su primera construcción en curso, no aloja a nadie.
- Durante una mejora cuenta el nivel anterior, igual que la producción.
- El estado del lote no cambia la capacidad: un lote abandonado sigue teniendo casas. Al abandono lo castiga el atractivo, para no descontarlo dos veces.
- La capacidad no baja nunca en el prototipo: no se demuele nada.

### 16.2 Atractivo

Un número entre 0 y 1 por barrio: el promedio ponderado de cuatro factores, cada uno entre 0 y 1.

| Factor | Qué mide | Cómo se calcula | Peso | Clave |
|--------|----------|-----------------|------|-------|
| Lotes | Que los vecinos estén | Promedio de `production.state_factor` de los lotes con dueño (activo 1, descuidado 0,5, abandonado 0). Sin lotes con dueño, 1 | 30 % | `citizens.weights.lotes` |
| Calles | Que las calles estén mantenidas | Estado de las calles ÷ 100 (§18) | 30 % | `citizens.weights.calles` |
| Abastecimiento | Que el barrio produzca lo que su gente necesita | Producción diaria del barrio ÷ (población × consumo), con tope 1 | 30 % | `citizens.weights.abastecimiento` |
| Obra | Que la obra pública del barrio esté terminada | 1 si está completada, 0 si no | 10 % | `citizens.weights.obra` |

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Consumo por ciudadano | 2 materiales por día | `citizens.consumption_per_day` |

- Producción diaria del barrio = suma de la tasa de §3 × 24 de sus lotes, de cualquier material, sin el alquiler de los residenciales (§17.1). Es solo una medida: **no se le descuenta ningún material a nadie**. Con población 0, el abastecimiento vale 1.
- Mientras la obra no esté terminada, el atractivo no pasa de 0,9 (1 menos el peso de la obra). La Escuela y el Hospital suman así un motivo más para terminarlos.
- El atractivo se calcula en el momento en que se usa (el job de población, el alquiler al recoger, los paneles); no se guarda.
- **Motivo principal:** el factor que más resta (`peso × (1 − factor)`). Si empatan, gana el primero en el orden de la tabla; si ninguno resta, no hay motivo. Es lo que ve el jugador: "hay lotes descuidados", "las calles", "falta producción", "falta la Escuela".

Orden de magnitud: una ladrillería nivel 1 produce 48 por día y aloja 10 ciudadanos que consumen 20, así que le sobran 28. Un residencial nivel 1 (30 ciudadanos, 60 por día) necesita algo más que el sobrante de dos lotes productivos nivel 1. Un barrio que se llena de residenciales sin subir la producción se queda sin abastecimiento.

### 16.3 Cómo cambia la población

Una vez por día, después de recalcular los estados de los lotes:

```
objetivo = floor(capacidad × atractivo)
si población < objetivo:  llegan  ceil((objetivo − población) × arrival_rate)
si población > objetivo:  se van  ceil((población − objetivo) × departure_rate)
```

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Llegan por día | 30 % de la diferencia | `citizens.arrival_rate` |
| Se van por día | 15 % de la diferencia | `citizens.departure_rate` |

- Irse es más lento que llegar, a propósito: un descuido de un par de días se nota, pero no vacía el barrio.
- La población nunca pasa la capacidad ni baja de 0.
- Emite un evento `barrio.population_changed` por barrio abierto y por día del juego, aunque no cambie nada. Eso hace idempotente al job, como `jornadas.refilled`. Lleva el día, la población antes y después, el objetivo, la capacidad, el atractivo con sus cuatro factores y el motivo principal.
- Los barrios cerrados no se actualizan. El Barrio 1 arranca en 0. El Barrio 2 arranca en 0 cuando se abre.

Orden de magnitud: con 30 lotes con edificio y atractivo 0,8, el objetivo es 240. Desde 0 se llega a unos 180 en 4 días y a unos 220 en 7. En la práctica tarda más, porque la capacidad crece a medida que entran jugadores.

### 16.4 Apertura del Barrio 2 por población

Se suma una tercera condición a §8: el Barrio 2 abre cuando el Barrio 1 llega a **300 ciudadanos**, cuando tiene el 85 % de los lotes ocupados o a los 10 días, lo que pase primero. El evento `barrio.opened` lleva `reason: 'population'`.

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Población del Barrio 1 que abre el Barrio 2 | 300 | `barrio.open_population` |

- Las otras dos condiciones se quedan porque garantizan lugar para los invitados nuevos. La población es la vía que se gana con un barrio sano.
- Como la población solo cambia a las 00:20, `update_population` revisa la apertura al terminar, sin esperar a la hora siguiente. Si se cumplen varias condiciones a la vez, la razón es la primera en este orden: población, ocupación, tiempo.
- Sin residenciales casi no se llega: 30 lotes productivos alojan 300 y el atractivo nunca es 1, y con 35 lotes ya abre por ocupación. Con 28 lotes productivos, 2 residenciales nivel 1, la Escuela terminada y el barrio casi impecable, el objetivo ronda los 320, y la población lo alcanza unos días después.
- Es el número más sensible de esta ampliación. Se calibra con los bots para que un barrio sano llegue entre el día 6 y el 8.

### 16.5 Cómo se ve

- **Panel del barrio:** "Barrio 1 · 182 de 240 ciudadanos" (la población y el objetivo de hoy), con flecha de tendencia, la capacidad, los cuatro factores como barras y el motivo principal en una línea.
- **Mapa:** la gente que camina por las veredas de un barrio crece con su población. Los autos dependen del estado de las calles (§18).

## 17. Residencial

Quinto tipo de edificio: `residencial`. Se construye en el lote propio, como cualquier otro. En la UI se llama "Residencial" y no "barrio residencial", para no confundirlo con los barrios del mapa.

| Tipo | Produce | Efecto |
|------|---------|--------|
| `residencial` | Alquiler: el material que elige el dueño, según el atractivo del barrio (§17.1) | Aloja 30 / 60 / 100 ciudadanos según el nivel, en vez de 10 (§16.1) |

- Usa la tabla de costos y tiempos de §3, como la plaza, y se puede ayudar como cualquier construcción.
- Como todo tipo, se elige en el nivel 1 y no se cambia.
- Suma capacidad solo a su barrio.

### 17.1 Alquiler

Sin producción propia, al dueño de un residencial no lo traería de vuelta nada suyo: ni materiales para recoger ni con qué subir de nivel sin depender por completo de regalos. Por eso el residencial cobra alquiler: produce como cualquier edificio, pero su tasa depende de cómo está el barrio.

```
tasa_efectiva(residencial) = tasa de §3 × atractivo del barrio (§16.2)
```

- El dueño elige el material del alquiler (ladrillo, madera o energía) al construir el nivel 1, y no se cambia. Queda guardado en el lote desde que empieza la construcción. Es un solo material, como en los demás edificios, así que tampoco avanza solo.
- Se recoge como cualquier producción: de forma perezosa y con tope de 48 h. El atractivo se toma en el momento de recoger, igual que los otros factores de la fórmula.
- **No cuenta para el abastecimiento** (§16.2). Si contara, una baja de población bajaría el alquiler, eso bajaría el abastecimiento y se iría más gente.
- Depende del atractivo y no de la ocupación del barrio (población ÷ capacidad) por dos motivos. La población arranca en 0 y tarda días en llenar el barrio, así que quien construyera un residencial la primera semana no cobraría casi nada. Y el atractivo se mueve en el día: si hoy se mantienen las calles, el alquiler sube hoy.

Orden de magnitud: sin la obra terminada el atractivo no pasa de 0,9, así que un residencial nivel 1 rinde como mucho 43 por día, contra 48 de una ladrillería. Con calles rotas y lotes descuidados el atractivo ronda 0,6, y rinde unos 29. Esa diferencia es el precio de alojar el triple de ciudadanos y de depender de los vecinos. Si muchos construyen residenciales, cae el abastecimiento, baja el atractivo y baja el alquiler de todos ellos, así que se regula solo.

### 17.2 Qué ve el dueño

- **Panel "Mi lote":** el alquiler actual por hora y el atractivo desglosado en sus cuatro factores, con el que más resta marcado.
- **Resumen al volver:** "Tu residencial rindió al 86 %. Lo que más resta: las calles." Le dice qué arreglar, y arreglarlo está en sus manos (§18). El 86 % es el atractivo del momento en que se recogió.

## 18. Mantenimiento de calles

Cada barrio tiene un estado de calles de 0 a 100. Baja solo con los días, y lo suben los vecinos gastando jornada y ladrillo. Las calles son la primera estructura con mantenimiento; las siguientes (luminarias, mantenimiento de la Escuela y el Hospital) entrarían como factores nuevos del atractivo, sin cambiar §16.3. Están anotadas en `despues.md`.

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Estado inicial | 100 | `streets.initial` |
| Desgaste | 10 puntos por día | `streets.decay_per_day` |
| Costo de mantener | 1 jornada + 10 ladrillo | `streets.cost` |
| Puntos por mantenimiento | 4 | `streets.points` |
| Mantenimientos por jugador, por barrio y por día del juego | 1 | `streets.max_per_player_per_day` |

- El desgaste es continuo y se calcula de forma perezosa, como la producción: `estado = estado guardado − desgaste × días desde la última actualización`, sin bajar de 0. Ningún job lo resta. Mantener guarda el estado nuevo y reinicia el reloj.
- El Barrio 2 arranca en 100 al abrirse. Mientras está cerrado, sus calles no se gastan.
- El estado se muestra redondeado a entero. Mantener suma 4 puntos, con tope de 100, y no se puede si el estado que se muestra ya es 100. Se puede mantener cualquier barrio abierto, no solo el propio, y cuenta como jornada colectiva.
- Con 10 de desgaste y 4 puntos por vez, hacen falta **tres vecinos distintos por día** para sostener las calles. El tope de uno por jugador y por día es lo que obliga a que sea tarea de varios. El día es el del juego: se renueva a las 00:00 hora de la ciudad, con las jornadas.
- Si nadie mantiene, las calles pasan de 100 a 0 en 10 días. Calles en 0 bajan el objetivo de población un 30 % de la capacidad, y a un 15 % diario de la diferencia el barrio pierde gente de a poco, no de golpe.
- Solo las ladrillerías producen ladrillo (y los residenciales que cobran en ladrillo). El resto mantiene con el kit inicial o con ladrillo regalado.
- El panel del barrio muestra quién mantuvo las calles en los últimos 7 días, sacado de los eventos.

| Estado | Rango | En el mapa |
|--------|-------|------------|
| Buenas | 70–100 | Como hoy |
| Gastadas | 40–69 | Grietas y algún bache |
| Rotas | 0–39 | Baches y pocos autos |

Los rangos se miran sobre el estado redondeado y viven en la config: `streets.worn_below` (70) y `streets.broken_below` (40). Solo nombran y dibujan; ninguna regla depende de ellos.

Una celda de calle pertenece al barrio que tiene más lotes en las ocho celdas que la rodean, y se dibuja con el estado de ese barrio. Si empatan —pasa en la avenida del medio, entre los dos barrios—, es del barrio de menor número.

## 19. Pendiente de decidir

Después de abrir el Barrio 2, los ciudadanos solo se ven; no dan nada más. Si hace falta un segundo efecto, que no toque la producción individual (ver §16). Anotado en `despues.md`, junto con las luminarias y el mantenimiento de las obras.
