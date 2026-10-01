# 02 · Alcance del prototipo

El prototipo existe para responder una pregunta, no para parecerse al juego. Todo lo que no ayude a responderla queda afuera, aunque ya esté diseñado.

## Hipótesis

> Si 40 personas que no se conocen comparten una ciudad chica con lotes propios, jornadas limitadas y una obra pública que necesita de todos, **una mayoría vuelve al tercer día** y **una parte gasta jornadas en cosas que no son suyas**.

Dos partes medibles: volver, y actuar sobre lo colectivo. Si vuelven pero solo miran su lote, la hipótesis del corazón colectivo falló aunque la retención se vea bien.

## Se construye

Ciudadanos, residencial y mantenimiento de calles se sumaron el 29/09/2026 (reglas en `05-reglas-y-parametros.md` §16 a §18). Lo que esas secciones no dicen —luminarias, mantenimiento de las obras, un segundo efecto de los ciudadanos— sigue afuera y está en `despues.md`.

- **Una ciudad**, 75 lotes en dos barrios: Barrio 1 con 41 lotes abierto desde el inicio; Barrio 2 con 34 lotes que se abre a mitad de la prueba (ver `05-reglas-y-parametros.md` para la condición de apertura).
- **Jornadas:** 3 por día, acumulables hasta 6. Sin excepciones, sin compra, sin bonus.
- **Tres materiales:** ladrillo, madera, energía.
- **Cinco tipos de edificio**, tres niveles cada uno, dibujados con rectángulos de color: ladrillería, aserradero, generador, plaza y residencial.
- **Obras públicas:** una por barrio (Escuela en Barrio 1, Hospital en Barrio 2), con barra de progreso y placa de contribuyentes.
- **Ciudadanos por barrio:** gente que no juega y se muda una vez por día hacia capacidad × atractivo. No tocan la producción ni las jornadas de nadie; se ven caminando por las veredas y abren el Barrio 2 por una tercera vía (300 en el Barrio 1).
- **Residencial:** aloja más ciudadanos y cobra un alquiler que depende del atractivo del barrio.
- **Mantenimiento de calles:** un estado por barrio que se gasta solo y que sostienen los vecinos con jornada y ladrillo. Cuenta como jornada colectiva.
- **Construcciones con hora real de finalización.** Ayudar a una construcción ajena la acorta.
- **Lote con nombre y color** a elección.
- **Decaimiento simplificado:** activo → descuidado → abandonado, con la acción de cuidar. Sin ruinas ni herencia (en tres semanas casi no ocurrirían).
- **Regalo de materiales** a cualquier vecino de la ciudad con un botón. **Sin mercado ni precios.**
- **Pedidos de materiales y lo que le falta a cada lote** (sumado el 01/10/2026, `05` §7.1): cada jugador puede pedir una cantidad de un material, que se ve como una burbuja sobre su edificio hasta que los regalos la cubren; y en el panel de un lote ajeno se ve qué le falta para su próximo nivel. Sin texto libre: no es chat.
- **Pantalla "mientras no estabas"** al volver.
- **Registro de visitas** a lotes ajenos ("3 vecinos pasaron por tu lote").
- **Entrada por link de invitación**: quien la recibe se registra con email y contraseña, y vuelve con esas credenciales por `/entrar`.
- **Panel de administración mínimo** para el equipo: ver estado de la ciudad, enviar avisos, forzar apertura del Barrio 2.

## Se falsea a mano (Mago de Oz)

- El chat del barrio es un **grupo de WhatsApp**. Estar adentro vale más que cualquier analítica.
- Las notificaciones de "terminó tu construcción" y "tenés un vecino nuevo" se mandan con un script simple por email, o a mano si el script no está listo. El sistema registra qué habría que notificar; el envío es secundario.
- El **padrino** de las primeras 48 horas de cada jugador es el equipo (Facundo más una o dos personas de confianza).

## Queda explícitamente afuera

Múltiples ciudades · consolidación · ruinas y herencia · gobierno de barrio · mercado y precios · cosméticos · monetización · arte · landing pública · perfiles de jugador · chat dentro del juego · notificaciones push · app móvil (el navegador móvil alcanza).

Regla: si algo de esta lista aparece en una conversación de implementación, la respuesta es "después del experimento".

## Decisiones de simplificación respecto del concepto

Estas diferencias con `01-concepto.md` son deliberadas y se revierten después del experimento:

| Concepto completo | Prototipo | Por qué |
|-------------------|-----------|---------|
| Mercado de materiales | Solo regalo | Elimina el balance económico y mide interdependencia social de forma más pura |
| Cinco materiales | Tres | Suficiente para forzar dependencia, no tanto como para necesitar planilla |
| Ruina y herencia de lotes | Sin ruina | No ocurre en 3 semanas |
| Recuperar lote descuidado cuesta 1 jornada | Se recupera solo al entrar | Menos fricción para el que vuelve, que es un jugador valioso |
| Landing pública con mapa en vivo | Link de invitación | Cohorte cerrada; la landing se valida después |
| Padrino automático con recompensa | Padrino manual (equipo) | Ver si el gesto funciona antes de sistematizarlo |
| Hitos de ciudad que desbloquean tiers | Un solo hito: apertura del Barrio 2 | Un evento colectivo alcanza para testear el efecto |

## El experimento en una frase

Una cohorte de 40 a 60 personas, tres semanas, invitación cerrada, un tercio conocidos y dos tercios desconocidos entre sí, con umbrales fijados antes de arrancar. Detalle completo en `09-experimento-y-metricas.md`.

## Tiempo

4 a 6 semanas de construcción (noches y fines de semana) y 3 de prueba. Si la construcción pasa de 6 semanas, el alcance se abrió: volver a este documento.
