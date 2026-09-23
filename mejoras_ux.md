# Mejoras UX/UI — Areté

Checklist de la auditoría UX/UI completa (2026-09). Cada punto lleva severidad, evidencia
con rutas y la recomendación. Los que ya estaban en `mejoras_arete.md` no se duplican (ver
"Ya anotado" al final). Prioridad: **P0** = daña la tesis del producto o excluye usuarios,
**P1** = fricción real en un flujo crítico, **P2** = pulido.

## P0 — tesis y accesibilidad

**UX-1. La limitante no vive en "Hoy".** El nivel global es el mínimo de los dominios —
es la tesis entera del producto — pero el limitante ("Limitado por {dominio}")
solo aparece en la cabecera de Perfil (`js/ui/profile.js:104-108`). En Hoy se ve el nivel
y "· X/7 medidos" (`js/ui/dashboard.js:135-137`), no *qué* lo limita. Un atleta que abre
la app a diario debería leer "tu limitante es {dominio}" con un CTA directo (medir o la
sesión que lo ataca) sin entrar a Perfil. **Recomendación:** en `dashLevel`, línea de
limitante + CTA que abre la card de dominio o propone sesión.

**UX-2. Primer uso sin camino guiado.** El perfil nuevo es `provisional · 0/7 medidos`
y los estados vacíos existen pero no hay una secuencia de onboarding: qué dominio medir
primero, cuál es un test barato vs caro, por qué importa el peso corporal (sin él no hay
ratios de fuerza). Quirón tiene pantalla de setup; el atleta nuevo no tiene nada
equivalente. **Recomendación:** card de arranque en Hoy con los 3 primeros pasos
(peso corporal → 1 test barato → 1 sesión), que se descarta al cumplirlos.

**UX-3. Los toasts son invisibles para lectores de pantalla.** El contenedor no tiene
`role="status"` ni `aria-live` (`js/ui/toast.js`) — y los toasts llevan mensajes críticos:
errores de Quirón, "Carrera guardada automáticamente (datos parciales)", errores de Drive.
Todo lo que viaja por toast no llega a un usuario de lector de pantalla. **Recomendación:**
`role="status" aria-live="polite"` en el contenedor (y `assertive` para errores de guardado).

**UX-4. Celebración de PR sin gestión de foco.** El overlay `#prCelebration`
(`app.html:873-881`) no recibe ni devuelve foco; el foco queda detrás del overlay y un
usuario de teclado o lector no sabe que hay algo modal en pantalla. Contrasta con el resto
de la app, que maneja foco bien (trap en `js/app.js:501-545`, retorno en sheets). 
**Recomendación:** al abrir, foco al botón; al cerrar, devolver al elemento que disparó.

## P1 — fricción en flujos críticos

**UX-5. Los errores de Quirón enseñan la entraña.** `"No se pudo aplicar: " + msg` y
burbujas `.q-err` con `e.message` crudo (`js/ui/quiron.js`): el atleta ve errores de
proveedor, JSON y red. **Recomendación:** mensaje humano por clase de error (red, cuota,
clave inválida, longitud) + detalle plegable; "Reintentar" donde aplique.

**UX-6. Validación de series solo al final.** Los inputs de la rejilla aceptan cualquier
valor y la validación corre al guardar (`safeNum`/parse); el error se descubre tras
completar toda la sesión — el peor momento. **Recomendación:** feedback inline en blur
(borde + mensaje corto), no bloquear el guardado con valores ambiguos sino marcarlos.

**UX-7. El draft se descarta en silencio si cambió el número de ejercicios.** La
restauración posicional de drafts descarta si el count no matchea (`js/ui/training.js:96-100`)
— el atleta que edita su plan pierde el borrador sin saberlo. **Recomendación:** al
descartar, toast explicando el porqué; si es por cambio de plan, ofrecer descartar
explícitamente.

**UX-8. Diagnóstico de sync invisible para el atleta.** sync v2 expone `getDiag()` y el
evento `arete-sync-degraded`, pero la UI del badge e historial legible en Ajustes quedó
como follow-up (`odd/tasks/sync-v2.md`). Hoy un fallo de sync solo se ve si abrís la
consola. **Recomendación:** fila de estado en la página de Copia de seguridad con el
último resultado del ciclo y su `why` (el mismo dato que ya calcula el motor).

**UX-9. El GPS ausente en navegador no se explica.** `canTrackRuns()` oculta el botón de
medir en navegador (`js/platform.js:28-30`, `js/ui/running.js:1502-1504`) — decisión
correcta — pero el atleta de navegador no recibe la razón y puede concluir que "la app no
sabe medir". **Recomendación:** en la pestaña Carrera de navegador, una línea discreta:
"El GPS en vivo solo está en la app instalada; importa tu GPX o regístralo a mano".

**UX-10. Zonas de FC indicadas solo con color.** En la carrera en vivo, la zona es solo
croma (`js/ui/running*`): daltónicos y lectores de pantalla fuera. **Recomendación:**
inicial de zona o número junto al color (patrón ya usado en dominios).

**UX-11. El radar del Perfil no es legible sin ver.** `role="img" aria-labelledby`
nombra el gráfico pero su contenido (los 7 valores) no es texto. **Recomendación:**
tabla sr-only con dominio/nivel/caducidad al lado del SVG — el dato ya está en las cards,
es duplicarlo accesible.

**UX-12. "Sin actividad aún" sin salida.** El estado vacío del dashboard no ofrece CTA
(`js/ui/dashboard.js`), cuando el historial sí los tiene ("Empezar una sesión",
`js/ui/history.js:152-159`). **Recomendación:** mismo patrón: CTA a Entrenar.

## P2 — pulido

**UX-13. Tildes que faltan en copy:** "Records Personales" (`js/ui/settings.js render1RMs`),
"Pulsometro" (`js/ui/running.js` strings de FC), "Aerobico" (`running.js updateRodajeUI`).
Barato y no es solo ortografía: es confianza.

**UX-14. Carga silenciosa en pantallas pesadas.** Calendario, plan de carrera y radar
renderizan síncrono sin skeleton — en móviles lentos hay un salto de contenido. Bajo
riesgo porque los cálculos son locales; medir antes de invertir.

**UX-15. `--fs-2xs` a 11 px en móvil.** El token baja a `.6875rem` bajo 640 px
(`app.css:693-694`); revisar dónde se usa para metadatos y confirmar que no baja de lo
razonable (13 px suele ser el suelo práctico).

**UX-16. `localStorage` lleno en Quirón se traga en silencio.** El `catch` de
`saveConvo` no avisa (`js/ui/quiron.js`): la conversación deja de persistirse sin señal.
**Recomendación:** toast único "no se pudo guardar la conversación (espacio lleno)".

**UX-17. Notificaciones del SW solo cubren descanso y carrera.** Los avisos de
"Descanso"/"¡Tiempo!" y el heartbeat de carrera (`sw.js`) dependen de que el atleta tenga
la pantalla encendida o la app abierta; nada avisa de "sesión sin guardar" si mata la
pestaña. Candidato a evaluar, no necesariamente a hacer: el draft ya salva la sesión.

## Ya anotado (no duplicar)

- Dos temporizadores de descanso en paralelo — `mejoras_arete.md` #6.
- Tabla de umbrales femenina — `mejoras_arete.md` #7.
- Advisory F3 (liftMetric silencioso, test skipIf, índice de alias) — `mejoras_arete.md` #9.
- Filas en confianza `media` de la ontología — pendientes de revisión humana.
