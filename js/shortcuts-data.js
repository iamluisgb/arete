// Los atajos, como datos puros.
//
// Viven aquí y no en `ui/shortcuts.js` porque la ayuda los publica en una tabla
// generada: el generador corre en Node, sin DOM, y no puede importar un módulo
// que toca `document` al cargarse. Una sola lista, dos consumidores — y si se
// añade un atajo, la tabla de la ayuda cambia sola.

export const ATAJOS = [
  { tecla: '1 – 5', que: 'Ir a Hoy, Entrenar, Perfil, Cuerpo o Más' },
  { tecla: '6', que: 'Abrir Quirón' },
  { tecla: '/', que: 'Abrir Quirón con el cursor en el campo' },
  { tecla: 'N', que: 'Plegar y desplegar la navegación lateral' },
  { tecla: 'Espacio', que: 'Serie hecha, con la sesión en curso' },
  { tecla: '← →', que: 'Mes anterior y siguiente en el calendario' },
  { tecla: 'Esc', que: 'Cerrar lo que esté abierto' },
  { tecla: '?', que: 'Esta lista' },
];
