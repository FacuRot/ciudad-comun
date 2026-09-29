# Ciudad Común — Documentación del prototipo

> Nombre provisorio. City builder de navegador donde cientos de personas construyen la misma ciudad.
> Este paquete contiene todo lo necesario para empezar a construir el **prototipo de validación**.

Versión de la documentación: 0.2 · 13 de septiembre de 2026

## Cómo leer esta carpeta

Leer en orden la primera vez. Después, cada documento es referencia independiente.

| # | Archivo | Qué contiene | Cuándo leerlo |
|---|---------|--------------|---------------|
| 1 | `01-concepto.md` | Visión del juego completo: frase, fantasía, pilares, economía, ciclo del lote, primera sesión, estética. | Antes de cualquier decisión de diseño. Es la fuente de verdad del "por qué". |
| 2 | `02-alcance-prototipo.md` | Qué se construye, qué se falsea a mano, qué queda afuera, y la hipótesis que valida el prototipo. | Antes de arrancar y cada vez que el alcance se quiera abrir. |
| 3 | `03-arquitectura-y-stack.md` | Stack elegido, arquitectura cliente/servidor, decisiones técnicas y su justificación. | Semana 1. |
| 4 | `04-modelo-de-datos.md` | Tablas, relaciones, invariantes. El SQL vigente está en `supabase/migrations/`. | Semana 1, antes de tocar la base. |
| 5 | `05-reglas-y-parametros.md` | Todas las reglas del juego con sus números: jornadas, materiales, edificios, costos, tiempos, decaimiento, obras. | Al implementar cada mecánica. Es el documento de balance. |
| 6 | `06-acciones-y-api.md` | Contrato de cada acción del jugador (RPC): entradas, validaciones, efectos, eventos que emite. | Al implementar el backend y el cliente. |
| 7 | `07-pantallas-y-flujos.md` | Pantallas del prototipo, flujo de primera sesión, estados del mapa, qué muestra cada panel. | Al implementar el frontend. |
| 8 | `08-plan-de-construccion.md` | Plan de 6 semanas con entregables por semana y criterio de "listo". | Para planificar y para saber si el alcance se está abriendo. |
| 9 | `09-experimento-y-metricas.md` | Cómo se corre la prueba de 3 semanas: reclutamiento, umbrales, consultas SQL de las métricas, rituales diarios, entrevistas de cierre. | Antes de invitar a la primera persona. |
| — | `schema.sql` | **Histórico.** Esquema de partida del 13/09, del que salieron las primeras migraciones. El vigente es `supabase/migrations/`. | Solo como referencia de origen. |
| — | `tests-rpc-smoke.sql` | **Histórico.** Prueba de humo del esquema de partida. Las pruebas vigentes están en `tests/rpc.sql`. | Solo como referencia de origen. |
| — | `CLAUDE.md` | Instrucciones para Claude Code dentro del repo del juego. Copiar a la raíz del repo. | Al crear el repo. |
| — | `concepto.html` | Copia local del documento de concepto publicado (se abre en cualquier navegador). | Para compartir sin depender de Claude. |

## Principios que atraviesan toda la documentación

1. **El prototipo existe para responder una pregunta, no para parecerse al juego.** La pregunta: ¿un grupo de desconocidos vuelve un tercer día por la ciudad?
2. **El servidor manda.** Ninguna regla del juego vive en el cliente. Toda mutación pasa por una función de Postgres que valida y registra.
3. **Todo lo que pasa se registra como evento.** Las métricas del experimento salen de la tabla `events`, no de analítica externa.
4. **Lo más aburrido posible.** Postgres, funciones SQL, cron, canvas 2D, polling si hace falta. Nada que haya que aprender para el prototipo.
5. **Falsear antes que construir.** Chat, notificaciones y padrinazgo se hacen a mano en la primera cohorte.

## Documento vivo relacionado

El documento de concepto también está publicado como página en Claude (artifact "Ciudad Común"), con la misma información que `01-concepto.md` y `02-alcance-prototipo.md`.
