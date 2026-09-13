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
| Regalar materiales | 0 | Jugador ajeno |
| Nombrar / cambiar color del lote | 0 | Mi lote |
| Recoger producción | 0 (automático) | Mi lote |

Las acciones con jornada sobre cosas ajenas (ayudar, aportar, cuidar) son las que cuentan para la métrica de "jornadas colectivas" del experimento. Regalar cuenta aparte como "gestos".

## 2. Materiales

Tres tipos: `ladrillo`, `madera`, `energia`.

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Kit inicial al registrarse | 20 ladrillo, 20 madera, 10 energía | `materials.starter` |
| Tope de acumulación sin recoger | 48 horas de producción | `production.accrual_cap_hours` |

- El inventario es por jugador, no por lote.
- La producción se **calcula perezosamente**: `producido = tasa_efectiva × horas desde production_collected_at`, con tope de 48 h. Se recoge automáticamente al entrar al juego y antes de cualquier acción del jugador.
- El kit inicial alcanza exactamente para construir el nivel 1 de cualquier edificio. A partir del nivel 2, ningún jugador puede avanzar solo.

## 3. Edificios

Cuatro tipos, tres niveles. Cada lote tiene un solo edificio. El tipo se elige al construir el nivel 1 y no se cambia en el prototipo.

| Tipo | Produce | Efecto |
|------|---------|--------|
| `ladrilleria` | ladrillo | — |
| `aserradero` | madera | — |
| `generador` | energía | — |
| `plaza` | nada | +10 % de producción a cada lote ortogonalmente adyacente (máximo +20 % por lote receptor, acumulando plazas) |

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

La plaza usa la misma tabla. Los materiales se descuentan al iniciar la construcción; no se devuelven.

Mientras hay una construcción en curso en el lote, no se puede iniciar otra. El nivel anterior sigue produciendo durante la mejora.

### Tasa efectiva de producción

```
tasa_efectiva = tasa_base(nivel)
              × bonus_plazas        (1.0, 1.1 o 1.2)
              × bonus_obra_barrio   (1.15 si la obra del barrio está terminada, si no 1.0)
              × factor_estado       (activo 1.0, descuidado 0.5, abandonado 0.0)
```

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

- Cuesta **1 jornada por aporte**. El aporte puede llevar cualquier cantidad de materiales (incluso cero: la jornada sola cuenta como "jornada de obra").
- Cada aporte suma 1 al contador de jornadas de la obra y los materiales entregados a cada contador. Un aporte no puede entregar más de lo que falta de cada material.
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

## 8. Lotes, barrios y apertura

| Parámetro | Valor | Clave |
|-----------|-------|-------|
| Grilla | 12 columnas × 8 filas | seed |
| Lotes Barrio 1 | 41 | seed |
| Lotes Barrio 2 | 34 | seed |
| Distancia máxima a un lote ocupado para poder tomar uno libre | 2 (Manhattan) | `lots.max_claim_distance` |
| Apertura del Barrio 2 | ≥ 85 % de lotes del Barrio 1 ocupados **o** 10 días desde `cities.opened_at`, lo que ocurra primero. El admin puede forzarla. | `barrio.open_threshold`, `barrio.open_after_days` |

- **Nunca un lote aislado:** un lote libre solo se puede tomar si está a distancia ≤ 2 de un lote ocupado por un jugador activo o descuidado. En una ciudad vacía, cualquier lote del Barrio 1 es válido.
- El link de invitación lleva el lote del que invita; la UI destaca los lotes libres adyacentes a ese lote como sugerencia.
- Un jugador tiene exactamente un lote en el prototipo.
- Apertura del Barrio 2: evento `barrio.opened` a toda la ciudad; los lotes pasan de `cerrado` a `libre`.

## 9. Nombre y color del lote

- Nombre: 2 a 24 caracteres, único dentro de la ciudad, editable sin costo.
- Color: uno de 8 de la paleta (`config.palette`): terracota, ocre, oliva, teal, azul, lila, rosa, gris. Editable sin costo.
- Se muestra el nombre del lote, no el email ni el nombre real. El jugador elige un apodo al registrarse (`players.display_name`).

## 10. Visitas

- Abrir el panel de un lote ajeno registra `lot.visited` (visitante, lote), como máximo una vez por visitante por lote por día.
- El dueño ve en su resumen "N vecinos pasaron por tu lote" y, si toca, los nombres.

## 11. Resumen "mientras no estabas"

Se muestra al entrar si pasaron más de 4 horas desde `last_seen_at`. Contiene, en este orden de prioridad:

1. Construcciones propias terminadas.
2. Ayudas recibidas (quién).
3. Regalos recibidos (quién, qué).
4. Cuidados recibidos (quién).
5. Obras públicas: progreso desde la última vez, y completadas.
6. Barrio abierto.
7. Vecinos nuevos a distancia ≤ 2.
8. Visitas recibidas (cantidad).
9. Materiales producidos y recogidos.

Se genera consultando `events` desde `last_seen_at`. No se guarda aparte.

## 12. Día y noche

El mapa se pinta según la hora actual en la zona horaria de la ciudad: noche de 20:00 a 07:00, atardecer de 18:00 a 20:00 y de 06:00 a 07:00, día el resto. Las ventanas se encienden solo en lotes `activo`. Es puramente visual y se calcula en el cliente.

## 13. Cron (jobs programados)

| Job | Horario (hora del juego) | Qué hace |
|-----|--------------------------|----------|
| `refill_jornadas` | 00:00 diario | `jornadas = LEAST(jornadas + per_day, cap)` para todos los jugadores de la ciudad |
| `update_lot_states` | 00:10 diario | Recalcula `lots.state` según días efectivos |
| `complete_constructions` | cada 5 minutos | Cierra construcciones con `ends_at <= now()`, sube el nivel, emite evento |
| `check_barrio_opening` | cada hora | Abre el Barrio 2 si se cumple la condición |

Todos son idempotentes: correrlos dos veces no produce efectos dobles.

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
    "types": ["ladrilleria", "aserradero", "generador", "plaza"],
    "produces": { "ladrilleria": "ladrillo", "aserradero": "madera", "generador": "energia", "plaza": null },
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
  "lots": { "max_claim_distance": 2 },
  "barrio": { "open_threshold": 0.85, "open_after_days": 10 },
  "summary": { "min_hours_away": 4 },
  "palette": ["terracota", "ocre", "oliva", "teal", "azul", "lila", "rosa", "gris"]
}
```

## 15. Qué vigilar durante la prueba (señales de desbalance)

- **La Escuela se completa antes del día 3:** los costos de obra son bajos; subirlos para la cohorte 2.
- **Nadie llega a nivel 2 en la semana 1:** los materiales cruzados son demasiado escasos o nadie regala; revisar el kit inicial o el mínimo de regalo antes de tocar costos.
- **Muchas jornadas sin usar al final del día (cap alcanzado):** hay poco que hacer; no bajar el cap, agregar destinos para la jornada.
- **Todos construyen plazas:** el bonus es demasiado alto o la gente prefiere el gesto pro-social; el segundo caso es una buena noticia.
- **Nadie cuida lotes:** o nadie se ausentó (bien) o cuidar no se ve; revisar el ícono en el mapa antes que la regla.
