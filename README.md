# Meme GIF Library (Premiere CEP)

Panel CEP para Adobe Premiere Pro: librería de memes GIF (Giphy), descarga a la carpeta `gif` junto al `.prproj` e inserción en la pista de vídeo más alta (sin sobrescribir clips).

Premiere a veces trata mal la temporización o la transparencia de los GIF animados. Este plugin guarda e importa el GIF original, sin convertirlo a MP4.

## Requisitos

- Premiere Pro 14 o posterior (panel en **Ventana > Extensiones (heredado)**)
- Proyecto **guardado** en disco y una **secuencia activa**

## API key de Giphy

Los paquetes publicados llevan una key incluida, así que el plugin funciona al instalarlo sin configurar nada. Esa key es compartida por todos los usuarios: si se agota la cuota, el panel avisa y cada uno puede poner la suya en el engranaje de **Configuración**, que tiene prioridad sobre la incluida.

Para compilar con key incluida, guarda la tuya en `.giphy-key` (ignorado por git):

```bash
echo "TU_KEY_DE_GIPHY" > .giphy-key
```

`scripts/install-dev.sh` y `scripts/package-zxp.sh` sustituyen el marcador `__GIPHY_API_KEY__` de [js/app.js](js/app.js) por ese valor al copiar o empaquetar, mediante [scripts/inject-key.sh](scripts/inject-key.sh). Sin `.giphy-key`, el panel se comporta como antes y pide la key a cada usuario.

## Desarrollo

Premiere carga la carpeta instalada en `/Library/Application Support/Adobe/CEP/extensions/Meme GIF Library`, no este proyecto. Para probar cambios, copia el panel sobre ella:

```bash
bash scripts/install-dev.sh
```

El script activa `PlayerDebugMode` (necesario porque la copia altera la firma del paquete) y sincroniza `CSXS`, `css`, `js`, `jsx` e `index.html`. Si la carpeta del sistema no existe, instala en la de usuario. Con `MEMEGIF_DEST` puedes forzar otra ruta.

Después de ejecutarlo, pulsa **Recargar** en el panel. La primera vez (o si cambias `CSXS/manifest.xml`) cierra y abre Premiere.

Abre el panel en **Ventana > Extensiones (heredado) > Meme GIF Library** y pega tu API key de Giphy.

Como alternativa, si desinstalas la copia de `/Library` puedes enlazar el proyecto en vivo y saltarte el copiado:

```bash
sudo rm -rf "/Library/Application Support/Adobe/CEP/extensions/Meme GIF Library"
ln -sfn "$(pwd)" "$HOME/Library/Application Support/Adobe/CEP/extensions/com.memegif.library"
```

Chrome DevTools del panel (si `.debug` está presente): `http://localhost:8088`.

## Uso

- Al abrir el panel se cargan **tendencias**.
- Escribe un término y pulsa **Buscar**.
- Pasa el ratón por encima de un GIF y pulsa **Add** (o haz clic en la tarjeta): se descarga a `{carpeta_del_proyecto}/gif/{id}_{slug}.gif`, se importa al bin `gif` del proyecto y se **inserta** (no se sobreescribe) en la **pista de vídeo más alta desbloqueada**, en el playhead.
- La API key y la URL de actualizaciones están detrás del botón del engranaje.
- Si el archivo ya existe, no se vuelve a descargar.

## Versión y actualizaciones

La versión visible en el panel sale de `CSXS/manifest.xml` (`ExtensionBundleVersion` y `Extension Version`). Al publicar un cambio, súbelas las dos (ahora **1.2.0**).

En la cabecera del panel están la versión actual y el botón **Actualizar**:

- Si hay una versión más nueva en el servidor, aparece **Descargar** al lado (abre el enlace en el navegador). Si estás al día, no aparece nada.
- Si ya reemplazaste los archivos del panel en disco, el botón aparece como **Recargar**: recarga la interfaz y reevalúa `jsx/host.jsx` sin cerrar Premiere.

Por defecto consulta las releases de este repo, así que no hay que configurar nada:

```text
https://api.github.com/repos/mardanius/meme-gif-panel/releases/latest
```

Puedes apuntar a otro sitio desde el engranaje de **Configuración > URL de actualizaciones**. Acepta la API de GitHub Releases (lee `tag_name` y el `.zxp` adjunto) o un JSON propio:

```json
{ "version": "1.3.0", "url": "https://ejemplo.com/MemeGifLibrary.zxp" }
```

### Registro

- **1.4.0** — API key de Giphy incluida en los paquetes publicados, con aviso si se agota la cuota.
- **1.3.1** — Los ajustes y el botón Cargar más respetan el atributo `hidden`.
- **1.3.0** — Ajustes detrás de un botón de engranaje y botón **Add** al pasar el ratón sobre cada GIF.
- **1.2.1** — Releases de GitHub como origen de actualizaciones por defecto.
- **1.2.0** — Botón Actualizar con versión al lado, aviso de descarga y recarga del panel sin reiniciar Premiere.
- **1.1.0** — Inserta en la pista de vídeo más alta sin sobrescribir; versión visible en el panel.
- **1.0.0** — Librería Giphy, carpeta `gif` del proyecto, empaquetado ZXP.

## Publicar una versión

Con `gh` autenticado y el repo creado:

```bash
bash scripts/release.sh "Qué cambió en esta versión"
```

El script lee la versión de `CSXS/manifest.xml`, firma el `.zxp`, hace push y crea la release `vX.Y.Z` con el paquete adjunto. Al terminar imprime la URL que debes pegar en el campo *URL de actualizaciones* del panel.

El repo debe ser **público** para que el panel pueda consultar `api.github.com` sin credenciales.

## Empaquetar .zxp

```bash
chmod +x scripts/package-zxp.sh
bash scripts/package-zxp.sh
```

El instalador queda en `dist/MemeGifLibrary.zxp` (certificado self-signed de desarrollo en `certs/`). Instálalo con [Anastasiy’s Extension Manager](https://install.anastasiy.com/) o UPIA.

Si `ZXPSignCmd` no está en el PATH, el script intenta descargarlo a `tools/`. También puedes exportar `ZXPSIGNCMD=/ruta/a/ZXPSignCmd`.

## Estructura

- `CSXS/manifest.xml` — metadatos CEP, Node.js, host Premiere
- `index.html` / `css/styles.css` — UI responsive
- `js/app.js` — Giphy, descarga y puente con Premiere
- `jsx/host.jsx` — ruta del proyecto, import e insert
- `scripts/package-zxp.sh` — firma del `.zxp`
