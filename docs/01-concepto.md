# 01 · Concepto del juego

Versión 0.2 · Nombre provisorio: **Ciudad Común**

Un city builder de navegador donde cientos de personas construyen la misma ciudad. Cada una tiene su lote; la ciudad es de todos. Se funda, crece, se consolida y queda como testimonio de quienes la levantaron.

## La frase

**r/place, pero es una ciudad y no se borra.** Una sola pantalla que se explica sin tutorial, donde cada acción chica queda a la vista de todos y el resultado de meses de gente desconocida coordinándose se convierte en un lugar.

## La fantasía

Volver al tercer día y ver que la ciudad cambió. Que alguien construyó al lado tuyo, que el hospital que empujaste entre veinte se terminó, que tu nombre está en la placa. Ser parte de algo que existe porque hubo gente, y poder señalar qué parte pusiste vos.

El jugador no es un alcalde omnipotente: es un vecino con un lote, tres jornadas por día y un barrio que lo necesita.

## Pilares

**Lo nuestro es el corazón.** La promesa es la ciudad compartida. Toda decisión de diseño se evalúa primero por cuánto refuerza el espectáculo colectivo y la interdependencia entre vecinos.

**Lo mío es el motor.** El lote propio, la producción acumulada y las construcciones con hora de fin son lo que trae al jugador de vuelta. Lo personal existe al servicio de lo colectivo y siempre se ve en el mapa.

**Igualdad de influencia.** Cinco minutos a la noche pesan lo mismo que todo el día pegado. Las jornadas no se compran ni se acumulan sin límite; la comunidad se mantiene sana porque nadie domina el mapa.

Regla de decisión derivada: cuando dos opciones de diseño empatan, gana la que hace más visible el aporte de una persona a los demás.

## Unidad social

**Ciudades acotadas de 150 a 300 lotes**, no una instancia global. Suficientemente chicas para reconocer nombres, suficientemente grandes para que existan barrios con identidad. El mapa se habilita por barrios a medida que el anterior se llena: siempre se ve denso y cada apertura es un evento.

**Ciclo de vida.** Los primeros en entrar son fundadores y quedan marcados para siempre. Cuando la ciudad completa sus lotes y sus hitos colectivos pasa a *consolidada*: sigue existiendo, se visita, los lotes siguen siendo de sus dueños, pero ya no hay qué construir. El juego empuja entonces a fundar o sumarse a la siguiente, llevándose reputación y títulos. Temporadas sin reset.

**Entrada por elección.** Se ve qué ciudades están abiertas, cuántos lotes quedan y qué les falta, o se llega por invitación directa al barrio de alguien. Nunca asignación al azar.

## Economía: dos monedas

Una mide atención, otra mide interdependencia, y cada una arregla el problema de la otra.

**Jornadas.** Tres por día, iguales para todos, acumulables hasta dos días. No se compran ni se ganan jugando más. Una jornada es *hacer algo*: construir en el lote, ayudar una obra ajena, aportar a una obra pública, cuidar el lote de un vecino ausente. Dan igualdad de influencia y ritmo: si cada jornada importa, el jugador piensa antes de gastarla.

**Materiales.** Pocos tipos. Cada lote produce uno solo, pasivamente, mientras el jugador no está. Casi ningún edificio se construye con un solo material: necesitás a alguien. Circulan por el mercado del barrio (en el prototipo, solo por regalo).

**Obras públicas.** Hospital, puente, subte, estadio: nadie los construye, los construye el barrio. Una barra tipo Kickstarter dice qué falta y cualquiera aporta. Los contribuyentes quedan en la placa. Es el mecanismo que hace visible el esfuerzo colectivo y le da destino a lo que nadie compra.

**Hitos colectivos.** Al llegar a cierta población o cobertura de servicios se desbloquean tiers nuevos para toda la ciudad.

**No negociable:** las jornadas nunca se venden. Monetización exclusivamente cosmética.

## Ciclo del lote

Se funda, crece, se cuida, decae, se hereda. El mapa cuenta solo quién está y quién se fue.

| Estado | Días sin entrar | Qué se ve | Qué pasa |
|--------|-----------------|-----------|----------|
| Activo | 0–3 | Luces prendidas | Produce normal |
| Descuidado | 4–7 | Pasto crecido, cartel | Media producción, un aviso |
| Abandonado | 8–14 | Grietas, sin luces | Sin producción; los vecinos pueden cuidarlo |
| Ruina | 15+ | Estructura deteriorada | Vuelve al pool **con la ruina encima** |
| Heredado | — | Restaurado por nuevo dueño | Restaurar es más barato que construir; capas de historia |

**Cuidar.** Durante el abandono, cualquier vecino gasta una jornada y frena el estado un par de días (máximo dos o tres veces). Genera vínculo entre desconocidos y protege a quien se fue de vacaciones.

**El que vuelve no se castiga dos veces.** Si perdió el lote, conserva reputación, inventario, desbloqueos y su nombre en las placas, con prioridad para tomar un lote libre en la misma ciudad.

**Señal de barrio.** Muchos lotes descuidados bajan el rendimiento de las obras públicas de la zona: los vecinos activos tienen un motivo propio para reclutar gente.

**Abuso a prever.** Cuentas alternativas ocupando lotes para heredarlos baratos o bloquear un barrio. Mitigación: ruinas solo para gente sin lote en la ciudad; restaurar cuesta según lo construido.

## Primera sesión

El tutorial es el juego; el primer maestro es un vecino real.

1. **La landing es el mapa en vivo.** Sin cuenta se navega, se hace zoom, se leen placas. El registro aparece al tocar un lote libre.
2. **Nunca un lote aislado.** El nuevo cae pegado a jugadores activos o en el barrio de quien lo invitó.
3. **Vecino padrino.** El vecino activo más cercano recibe "tenés un vecino nuevo". Si lo ayuda en 24 horas, los dos ganan algo.
4. **Tres jornadas con destino sugerido.** La primera nombra el lote y elige qué produce (mostrando qué escasea en el barrio). La segunda va a la obra pública: la barra se mueve y el nombre aparece. La tercera es libre.
5. **Salir con algo que termina hoy.** La primera construcción tarda 4 a 6 horas. Al volver, lo primero es el resumen de lo que pasó sin vos.

**Criterio de éxito:** a los cinco minutos, sin haber leído nada, el jugador responde qué es mío, qué es nuestro y quién está al lado.

## Estética

Estilizado y legible desde arriba, antes que detallado de cerca. Vista cenital, tiles, colores planos, formas simples (referencias: Townscaper, Mini Motorways, Dorfromantik). La captura que se comparte es la ciudad entera.

Los edificios crecen por niveles de forma procedural: pocos tipos, pocos niveles, una paleta. La personalización va por color y estilo. Ciclo día/noche con la hora real de la ciudad y ventanas encendidas donde hay gente.

Técnicamente, 2D en canvas con tiles. Se evita 3D y pixel art detallado.

## Fuera de alcance del juego completo (por ahora)

Competencia formal entre barrios o ciudades (emerge sola con masa crítica), comercio entre ciudades, mapa mundial, monetización, arte final.
