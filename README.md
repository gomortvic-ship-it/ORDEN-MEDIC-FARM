# ORDEN FARMACÉUTICO — Localizador de medicamentos

Aplicación web (PWA) para saber dónde colocar cada medicamento: muestra la **letra de acomodo**, el producto, su código y precio, y los **4 productos anteriores y 4 posteriores** del orden maestro. Funciona en celular, tableta y computadora, y sin conexión después de la primera carga.

## Cómo se determina el orden (analizado del Excel entregado)
- Hoja única, 1,734 productos, columnas `Sal, Descripción, Código, Tipo, PRECIO Público, Exist.`
- Las filas **ya están en el orden maestro** (alfabético por `Sal`, con grupos `X-`, `Y-`, `Z-`, `ZZ-` al final para accesorios/otros). Se **respeta el orden de las filas**; no se reordena. Hay 29 puntos donde la `Sal` retrocede alfabéticamente (por textos truncados); se conservan tal cual.
- **Letra de acomodo** = primera letra de `Sal` (sin acento). Si la `Sal` empieza con `X-`, `Y-`, `Z-` o `ZZ-` la letra es ese prefijo. Ej.: Diurmessel → sal Furosemida → **F**.
- Los 4 anteriores/posteriores son los registros contiguos en la hoja, incluso con la misma sustancia.
- `data.json` solo contiene: `codigo, descripcion, sal, letra, precio, orden`. No incluye existencias ni tipo.
- Único cambio a los textos: se colapsan espacios dobles (37 descripciones). 207 códigos son internos no numéricos (ej. `PJ30`); se conservan como texto.

## Archivos
`index.html, styles.css, app.js, search.js, pos.js, scanner.js, import-excel.html, import-excel.js, import-ui.js, data.json, manifest.json, service-worker.js, icon-192.png, icon-512.png, vendor/` (ZXing 0.21.3 y SheetJS 0.18.5 incluidos localmente, con sus licencias), `tools/build-data.js`, `tests/`.
No se incluye `google-apps-script.js`: no hay integración con Google Sheets.

## Publicar en GitHub Pages
1. Crea un repositorio en github.com (p. ej. `orden-farmaceutico`). Nota: GitHub Pages gratuito requiere repositorio **público**, y `data.json` (nombres y precios) quedaría visible para cualquiera con el enlace.
2. **Add file → Upload files**: sube *el contenido* del proyecto (incluidas carpetas `vendor`, `tools`, `tests`) y **Commit changes**.
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → Save.
4. Tras 1–2 minutos la app estará en `https://TU-USUARIO.github.io/orden-farmaceutico/`.
5. En el celular ábrela y usa "Agregar a pantalla de inicio" / "Instalar".

## Actualizar el catálogo con otro Excel
1. Abre la app → pie de página **Actualizar catálogo** (o `import-excel.html`).
2. Elige el Excel, la hoja, y revisa la correspondencia de columnas (se detecta sola; si hay duda se te pide elegir). Criterio de orden recomendado: *Orden de las filas*.
3. **Validar y generar**: revisa el informe (excluidos, sin código, duplicados, precios inválidos) y la vista previa.
4. **Descargar data.json** y reemplaza el de tu repositorio (Add file → Upload files, mismo nombre → Commit).
5. Con internet, la app descarga el catálogo nuevo en la siguiente apertura. Si cambias código (no solo datos), sube también `service-worker.js` con `CACHE_VERSION` incrementado (`v2`…); los celulares mostrarán "Actualizar".
Todo se procesa en el navegador; el Excel no se envía a ningún servidor. Por línea de comandos: `node tools/build-data.js catalogo.xlsx`.
La página no puede escribir en GitHub por sí sola; no se usa ningún token.
Nota: si Excel guarda códigos como número, los ceros iniciales ya se perdieron en el archivo; la app no puede recuperarlos (la búsqueda tolera ceros iniciales de más o de menos).

## Probar el lector desde el celular
Abre la URL **https** de GitHub Pages en Chrome (Android) o Safari (iPhone) → **Escanear** → acepta el permiso de cámara → apunta al código, bien iluminado y a ~15–25 cm. Al leer, se detiene y abre el producto. Si no lee o hay error, usa el campo "Escribe el código".
Limitaciones: requiere HTTPS; si negaste el permiso hay que activarlo en ajustes del navegador; en iPhone, las apps instaladas en pantalla de inicio piden el permiso de nuevo en algunas versiones; códigos dañados o con poca luz pueden fallar. **El lector no se ha probado con cámaras físicas reales** (ver pruebas).

## Sin conexión
Estrategia "red primero": con internet siempre toma lo más nuevo; sin internet usa lo guardado y muestra el aviso *"Sin conexión: usando el catálogo guardado"*. Interfaz, JS, CSS, catálogo y las bibliotecas (incluido el lector) están en caché local. Requiere haber abierto la app una vez con internet.

## Pruebas
- `node --test tests/catalog.test.js` — 14 pruebas unitarias (letra, vecinos, inicio/final, búsquedas, importación).
- `node tests/e2e.js` y `node tests/e2e-import.js archivo.xlsx` — pruebas en Chromium con Playwright.
