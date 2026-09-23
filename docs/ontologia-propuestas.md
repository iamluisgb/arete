# Propuestas de mapeo — los 89 de Areté contra free-exercise-db

> Generado por `tools/build-exercise-ontology.py --tabla` a partir de
> `docs/ontologia-propuestas.json` (la fuente de verdad). No editar aquí.
>
> Estado: **aplicada** = ya está en `js/exercise-ontology.js`; **propuesta** =
> espera confirmación humana. Las confianza `alta/media/baja` son del LLM que
> propuso; ninguna se aplica sin revisión (medición del plan: el difuso miente).

| # | Areté | Alias | fedb | Confianza | Aplicada | pattern | domains | Nota |
|---|-------|-------|------|-----------|----------|---------|---------|------|
| 1 | 1 kettlebell mano swing | Swing 1 Mano | One-Arm_Kettlebell_Swings | confirmada | ✅ sí | hinge | kb, glyco |  |
| 2 | 1 kettlebell muerto peso pierna | Deadlift con 1 Pierna | Kettlebell_One-Legged_Deadlift | confirmada | ✅ sí | hinge | strength |  |
| 3 | abdominal plancha | Plancha Abdominal | Plank | confirmada | ✅ sí | core | core |  |
| 4 | banca pre | Press Banca, Press de Banca, Bench Press, Bench, banca pre | Barbell_Bench_Press_-_Medium_Grip | confirmada | ✅ sí | push_h | strength | nodo canónico de la semilla F3, enriquecido con fedb |
| 5 | barra curl | Curl con Barra | Barbell_Curl | confirmada | ✅ sí | pull_v | strength | flexión de codo: se clasifica pull vertical sagital |
| 6 | barra elevacion pierna | Elev. Piernas a Barra | Hanging_Leg_Raise | confirmada | ✅ sí | core | core |  |
| 7 | barra remo | Remo con Barra | Bent_Over_Barbell_Row | confirmada | ✅ sí | pull_h | strength, pull |  |
| 8 | clean | Clean, Cleans | Clean | confirmada | ✅ sí | hinge | strength |  |
| 9 | clean dead kettlebell | Dead Clean | Kettlebell_Dead_Clean | confirmada | ✅ sí | hinge | kb |  |
| 10 | diamante flexion | Flexiones diamante | Push-Ups_-_Close_Triceps_Position | confirmada | ✅ sí | push_h | strength |  |
| 11 | flexion inclinada | Flexiones inclinadas | Incline_Push-Up | confirmada | ✅ sí | push_h | strength |  |
| 12 | flexion mano | Flexiones de manos | Handstand_Push-Ups | confirmada | ✅ sí | push_v | strength |  |
| 13 | flexion palmada | Flexiones con Palmada, Flexiones con palmada | Plyo_Push-up | confirmada | ✅ sí | push_h | strength, glyco |  |
| 14 | fondo | Fondos | Parallel_Bar_Dip | confirmada | ✅ sí | push_v | strength |  |
| 15 | fondo paralela | Fondos Paralelas | Bench_Dips | confirmada | ✅ sí | push_v | strength |  |
| 16 | frontal sentadilla | Sentadilla Frontal, Front Squat, frontal sentadilla | Front_Squat_Clean_Grip | confirmada | ✅ sí | squat | strength | variante declarada de la semilla F3, enriquecida con fedb |
| 17 | invertido remo | Remo invertido | Inverted_Row | confirmada | ✅ sí | pull_h | pull, strength |  |
| 18 | kettlebell molino | Windmill | Kettlebell_Windmill | confirmada | ✅ sí | hinge | kb, mobility |  |
| 19 | kettlebell pistol | Pistol | Kettlebell_Pistol_Squat | confirmada | ✅ sí | lunge | strength | contraparte lastrada de pistol sentadilla |
| 20 | kettlebell remo | Row | One-Arm_Kettlebell_Row | confirmada | ✅ sí | pull_h | strength, pull |  |
| 21 | kettlebell remo renegade | Renegade Row | Alternating_Renegade_Row | confirmada | ✅ sí | pull_h | strength, pull, core |  |
| 22 | kettlebell snatch | Snatch, Snatch (KB), Snatches (KB) | One-Arm_Kettlebell_Snatch | confirmada | ✅ sí | hinge | kb, glyco |  |
| 23 | kettlebell thruster | Thruster, Thruster (KB), Thrusters (KB) | Kettlebell_Thruster | confirmada | ✅ sí | squat | kb, glyco | sentadilla + press: agrupa con las sentadillas |
| 24 | kettlebell turco | Levantamiento Turco | Kettlebell_Turkish_Get-Up_Lunge_style | confirmada | ✅ sí | loco | kb, mobility | get-up: total-body, sin patrón propio en el vocabulario cerrado |
| 25 | kettlebell salto sentadilla | Squat con Salto | — | confirmada | — | squat | glyco | el alias "Squat con Salto" resuelve al nodo jump-squat (semilla); la clave KB exacta queda sin nodo hasta revisión |
| 26 | militar pre | Press Militar, Press de Hombro, Overhead Press, OHP, militar pre | Barbell_Shoulder_Press | confirmada | ✅ sí | push_v | strength | nodo canónico de la semilla F3, enriquecido con fedb |
| 27 | muerto peso | Peso Muerto, Deadlift, muerto peso | Barbell_Deadlift | confirmada | ✅ sí | hinge | strength | nodo canónico de la semilla F3, enriquecido con fedb |
| 28 | muerto peso rumano | PM Rumano, Peso Muerto Rumano, Romanian Deadlift, RDL, muerto peso rumano | Stiff-Legged_Barbell_Deadlift | confirmada | ✅ sí | hinge | strength | fedb la llama Stiff-Legged: mismo patrón de bisagra con rango similar |
| 29 | pre push | Push Press, pre push | Push_Press | confirmada | ✅ sí | push_v | strength |  |
| 30 | salto sentadilla | Sentadilla con Salto, Sentadillas con Salto, Squat con Salto, Jump Squat, salto sentadilla, Sentadilla con salto, Sentadillas con salto | Freehand_Jump_Squat | confirmada | ✅ sí | squat | glyco | variante declarada de la semilla F3, enriquecida con fedb |
| 31 | salto zancada | Zancadas con salto | Scissors_Jump | confirmada | ✅ sí | lunge | glyco |  |
| 32 | sentadilla | Sentadilla, Sentadillas, Sentadilla trasera, Back Squat, Squat, Squats, sentadilla | Barbell_Squat | confirmada | ✅ sí | squat | strength | nodo canónico de la semilla F3, enriquecido con fedb |
| 33 | sit ups | Sit-ups | Sit-Up | confirmada | ✅ sí | core | core |  |
| 34 | barra zancada | Desplantes con Barra | Barbell_Lunge | confirmada | ✅ sí | lunge | strength |  |
| 35 | curl invertido | Curl Invertido | Reverse_Barbell_Curl | confirmada | ✅ sí | pull_v | strength |  |
| 36 | encogimiento | Encogimientos | Crunches | confirmada | ✅ sí | core | core |  |
| 37 | escalador | Escaladores, Mountain Climbers | Mountain_Climbers | confirmada | ✅ sí | loco | cardio, core |  |
| 38 | kettlebell pre suelo | Press en el Suelo, Floor Press, kettlebell pre suelo | Alternating_Floor_Press | confirmada | ✅ sí | push_h | strength | variante declarada de la semilla F3, enriquecida con fedb |
| 39 | asistida pistol sentadilla | Pistol squat asistida | propia | confirmada | ✅ sí | lunge | strength |  |
| 40 | bottom flexion kettlebell up | Flexión Bottom-Up | propia | confirmada | ✅ sí | push_v | strength, kb |  |
| 41 | bulgara sentadilla | Sentadilla Búlgara, Bulgarian Split Squat, bulgara sentadilla | propia | confirmada | ✅ sí | lunge | strength | fedb no la tiene: entrada propia (semilla F3) |
| 42 | burpee | Burpees | propia | confirmada | ✅ sí | loco | cardio, glyco |  |
| 43 | burpee clean kettlebell pre | Burpee & Clean & Press | propia | confirmada | ✅ sí | loco | cardio, kb |  |
| 44 | burpee completo | Burpee completo | propia | confirmada | ✅ sí | loco | cardio, glyco |  |
| 45 | burpee flexion | Burpee con flexión | propia | confirmada | ✅ sí | loco | cardio, glyco |  |
| 46 | burpee salto sin | Burpee sin salto | propia | confirmada | ✅ sí | loco | cardio, glyco |  |
| 47 | burpee tecnica | Burpee (técnica) | propia | confirmada | ✅ sí | loco | cardio |  |
| 48 | clean kettlebell pre | Clean & Press, Clean & Press (KB) | propia | confirmada | ✅ sí | push_v | kb, strength | equivalente con barra en fedb: Clean and Press; el compuesto KB es del método |
| 49 | clean kettlebell pre push | Clean & Push Press | propia | confirmada | ✅ sí | push_v | kb, strength | candidato fedb: One-Arm Kettlebell Push Press (sin el clean previo) |
| 50 | dead kettlebell snatch | Dead Snatch | propia | confirmada | ✅ sí | hinge | kb, glyco |  |
| 51 | dominada | Dominada, Dominadas, Dominada Prono, Dominada Supino, Dominada Supina, Pull-up, Pull-ups, Chin-up, Chin-ups, dominada | propia | confirmada | ✅ sí | pull_v | pull | fedb no tiene la dominada estricta estándar: solo Chin-Up (supino) y asistidas |
| 52 | dominada kettlebell | — | propia | confirmada | ✅ sí | pull_v | pull | dominada lastrada con KB; el alias genérico "Dominada" ya resuelve al canónico y no se duplica |
| 53 | dominada negativa | Dominada negativa | propia | confirmada | ✅ sí | pull_v | pull |  |
| 54 | estandar flexion | Flexiones estándar | propia | confirmada | ✅ sí | push_h | strength | fedb no tiene la flexión estándar: solo variantes |
| 55 | flexion | Flexiones | propia | confirmada | ✅ sí | push_h | strength |  |
| 56 | flexion kettlebell palmada | — | propia | confirmada | ✅ sí | push_h | strength, glyco | la palmada con KB en una mano exige potencia asimétrica El alias "Flexión con Palmada" normaliza igual que el de la palmada sin peso: queda en ese nodo. |
| 57 | flexion rodilla | Flexiones rodillas | propia | confirmada | ✅ sí | push_h | strength |  |
| 58 | jack jumping | Jumping Jacks | propia | confirmada | ✅ sí | loco | cardio, glyco |  |
| 59 | kettlebell lateral zancada | Desplante Lateral | propia | confirmada | ✅ sí | lunge | strength |  |
| 60 | kettlebell maleta muerto peso | Deadlift Maleta | propia | confirmada | ✅ sí | hinge | strength, kb | candidato fedb: One-Arm Side Deadlift (con barra) |
| 61 | kettlebell muerto peso | — | propia | confirmada | ✅ sí | hinge | strength, kb | fedb no tiene el deadlift de KB a dos manos El alias "Deadlift" queda en el canónico (barra): no se duplica. |
| 62 | kettlebell muerto peso sumo | Deadlift Sumo | propia | confirmada | ✅ sí | hinge | strength, kb | candidato fedb: Sumo Deadlift (con barra) |
| 63 | kettlebell ocho zancada | Desplante en Ocho | propia | confirmada | ✅ sí | lunge | kb, core |  |
| 64 | kettlebell power swing | Power Swing | propia | confirmada | ✅ sí | hinge | kb, glyco | swing con énfasis en el snap de cadera; fedb no lo distingue |
| 65 | kettlebell pre | Press | propia | confirmada | ✅ sí | push_v | strength, kb | fedb solo tiene variantes del press KB (Alternating, Arnold, Seesaw) |
| 66 | kettlebell salto zancada | Desplante con Salto | propia | confirmada | ✅ sí | lunge | glyco, kb |  |
| 67 | kettlebell sentadilla | — | propia | confirmada | ✅ sí | squat | strength, kb | POSO CONFLICTO: nombre = sentadilla KB (goblet), pero el tip habla de banco y pie delantero — posible split squat. Revisar la ilustración. fedb sí tiene Goblet Squat. El alias "Squat" queda en el canónico (barra): no se duplica. |
| 68 | kettlebell swing | Swing, Swing (KB), Swings (KB) | propia | confirmada | ✅ sí | hinge | kb, glyco | fedb solo tiene el swing a una mano (One-Arm Kettlebell Swings); el estándar S&S es a dos manos |
| 69 | kettlebell zancada | Desplante | propia | confirmada | ✅ sí | lunge | strength, kb | candidato fedb: Dumbbell Lunges (con mancuernas) |
| 70 | lateral plancha | Plancha Lateral | propia | confirmada | ✅ sí | core | core | fedb no tiene la plancha lateral (solo Push Up to Side Plank) |
| 71 | muerto peso unilateral | PM Unilateral | propia | confirmada | ✅ sí | hinge | strength | candidato fedb: One-Arm Side Deadlift |
| 72 | salto | Saltos | propia | confirmada | ✅ sí | loco | cardio, glyco |  |
| 73 | high kettlebell muerto peso pull | Deadlift High Pull, High Pull, high kettlebell muerto peso pull | propia | confirmada | ✅ sí | pull_h | strength, kb | entrada propia (semilla F3); fedb: Kettlebell Sumo High Pull es la variante sumo, el High Pull de Areté sale del dead stop |
| 74 | 1 pierna sentadilla | Sentadilla 1 pierna, Sentadilla 1 Pierna, 1 Pierna Sentadilla | — | confirmada | ✅ sí | squat | strength | resuelta por el nodo pistol-squat (semilla, alias "Sentadilla 1 Pierna") |
| 75 | dominada prona | Dominada pronas, Dominadas pronas | — | confirmada | ✅ sí | pull_v | pull | resuelve por el canónico pullup |
| 76 | dominada prono | Dominada Prono | — | confirmada | ✅ sí | pull_v | pull | resuelve por el canónico pullup |
| 77 | dominada supina | Dominada supinas | — | confirmada | ✅ sí | pull_v | pull | resuelve por el canónico pullup (el canónico lleva el alias Chin-up) |
| 78 | dominada supino | Dominada Supino | — | confirmada | ✅ sí | pull_v | pull | resuelve por el canónico pullup |
| 79 | high kettlebell pull | High Pull, High Pull (KB) | — | confirmada | ✅ sí | pull_h | kb | el alias "High Pull" resuelve al nodo deadlift-high-pull (semilla) |
| 80 | kettlebell rack sentadilla | Squat en Rack, Sentadilla en Rack, Squat Rack (KB), kettlebell rack sentadilla | propia | confirmada | ✅ sí | squat | strength, kb | entrada propia (semilla F3): rack unilateral con una KB; fedb no la tiene |
| 81 | pistol sentadilla | Pistol Squat, Sentadilla Pistol, Pistol squat, Sentadilla pistol, pistol sentadilla, Sentadilla 1 Pierna, 1 Pierna Sentadilla | propia | confirmada | ✅ sí | squat | strength | variante declarada de la semilla F3; fedb no tiene el pistol libre (solo KB y Smith) |
| 82 | abdominal barra | Sit-up con Barra | Sit-Up | media | — | core | core | sit-up con pies anclados bajo barra: el Sit-Up de fedb es sin carga ni anclaje. Revisar. |
| 83 | barra sit ups | Sit-ups con Barra | Sit-Up | media | — | core | core | igual que abdominal barra: el anclaje con barra no está en fedb. Revisar. |
| 84 | bajo kettlebell molino | Windmill Bajo | Kettlebell_Windmill | media | — | hinge | kb, mobility | windmill bajo: pesa en la mano que baja; fedb no distingue la variante. Revisar. |
| 85 | basica sentadilla | Sentadilla básica | Bodyweight_Squat | media | — | squat | strength | sentadilla corporal con mini-banda de abducción; fedb la lista sin banda. Revisar. |
| 86 | elevacion pierna | Elevación de piernas | Flat_Bench_Lying_Leg_Raise | media | — | core | core | elevación de piernas en suelo; fedb la lista en banco plano. Revisar. |
| 87 | elevacion talon | Elevación Talones | Standing_Calf_Raises | media | — | squat | strength | fedb la lista en máquina; en Areté es sin peso. Revisar. |
| 88 | flexion pike | Pike push-ups | Handstand_Push-Ups | media | — | push_v | strength | la pike es la regresión del HSPU; fedb no la distingue. Revisar. |
| 89 | zancada | Desplantes, Zancadas | Bodyweight_Walking_Lunge | media | — | lunge | strength | la zancada de Areté es alternada en sitio; fedb lista la caminada. Revisar. |
