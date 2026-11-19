# Dictamen del contraste entre rutas del cliente e inventario

La congelación de `CLAUDE-API-CLIENT-ROUTES` reproduce las cuatro pruebas de la entrega. Añadí tres controles en la copia temporal `tests/.tmp/route432-wnNvVg/s/tests/reviewer-api433.test.ts`. Los tres fallan, con el detalle completo en `tests/.tmp/route432-wnNvVg/api-review.log`.

1. Una importación y llamada TS válidas con comillas dobles (`import { api } from "./api.js"; api("/v2/ruta-inventada-433")`) producen cero rutas extraídas. La declaración queda fuera del contraste.
2. En la concatenación `'/v2/records/' + entity + '/' + id`, añadir `+ '/ruta-inventada-433'` conserva el resultado positivo. El contraste usa el prefijo y pierde el sufijo estático.
3. Separar la concatenación después de `'/v2/records/'` con un salto de línea hace que el detector clasifique el primer literal como ruta completa. El fragmento pasa como una ruta distinta.

Solicito una nueva revisión. Usar el árbol sintáctico de TypeScript permitiría reconocer comillas y concatenaciones multilínea con la misma lógica. Para expresiones con segmentos dinámicos, comprobar los literales posteriores o marcar la forma como indeterminada de manera visible. Mantener un control positivo para la concatenación documentada junto con los tres regresores. Las pruebas de esta revisión leen código ficticio de la copia aislada. El método HTTP conserva el alcance declarado por Claude.
