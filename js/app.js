(function () {
	"use strict";

	var PAGE_SIZE = 24;
	var KEY_STORAGE = "memegif.giphyApiKey";
	var UPDATE_URL_STORAGE = "memegif.updateUrl";
	var GIPHY = "https://api.giphy.com/v1/gifs";
	var PANEL_VERSION = "1.2.1";
	var DEFAULT_UPDATE_URL = "https://api.github.com/repos/mardanius/meme-gif-panel/releases/latest";

	var csInterface = new CSInterface();
	var fs;
	var pathMod;
	try {
		fs = require("fs");
		pathMod = require("path");
	} catch (e) {
		fs = null;
		pathMod = null;
	}

	var state = {
		mode: "trending",
		query: "",
		offset: 0,
		total: 0,
		loading: false,
		busyId: null,
		loadedVersion: null,
		pendingAction: null
	};

	var els = {
		form: document.getElementById("search-form"),
		input: document.getElementById("search-input"),
		trending: document.getElementById("trending-btn"),
		settingsToggle: document.getElementById("settings-toggle"),
		settings: document.getElementById("settings"),
		apiKey: document.getElementById("api-key"),
		saveKey: document.getElementById("save-key"),
		status: document.getElementById("status"),
		grid: document.getElementById("grid"),
		wrap: document.getElementById("grid-wrap"),
		empty: document.getElementById("empty"),
		loadMore: document.getElementById("load-more"),
		version: document.getElementById("plugin-version"),
		checkUpdate: document.getElementById("check-update"),
		updateAction: document.getElementById("update-action"),
		updateUrl: document.getElementById("update-url"),
		saveUpdateUrl: document.getElementById("save-update-url")
	};

	function readHostVersion() {
		try {
			var id = csInterface.getExtensionID();
			var list = csInterface.getExtensions([id]);
			if (list && list.length && list[0].version) {
				return list[0].version;
			}
		} catch (e) {}
		return null;
	}

	// Premiere cachea la versión del manifiesto al cargar el panel, así que
	// leemos el archivo en disco para detectar una actualización ya instalada.
	function readDiskVersion() {
		if (!fs || !pathMod) {
			return null;
		}
		try {
			var root = csInterface.getSystemPath(SystemPath.EXTENSION);
			var manifest = fs.readFileSync(pathMod.join(root, "CSXS", "manifest.xml"), "utf8");
			var match = /ExtensionBundleVersion\s*=\s*"([^"]+)"/.exec(manifest);
			return match ? match[1] : null;
		} catch (e) {
			return null;
		}
	}

	function localVersion() {
		return readDiskVersion() || readHostVersion() || PANEL_VERSION;
	}

	function compareVersions(a, b) {
		var left = String(a).replace(/^v/i, "").split(/[.\-+]/);
		var right = String(b).replace(/^v/i, "").split(/[.\-+]/);
		var len = Math.max(left.length, right.length);
		var i;
		for (i = 0; i < len; i++) {
			var l = parseInt(left[i], 10) || 0;
			var r = parseInt(right[i], 10) || 0;
			if (l !== r) {
				return l > r ? 1 : -1;
			}
		}
		return 0;
	}

	function getUpdateUrl() {
		return (localStorage.getItem(UPDATE_URL_STORAGE) || "").trim() || DEFAULT_UPDATE_URL;
	}

	function setStatus(msg, isError) {
		els.status.textContent = msg || "";
		els.status.classList.toggle("error", !!isError);
	}

	function getApiKey() {
		return (localStorage.getItem(KEY_STORAGE) || "").trim();
	}

	function escapeJsxString(value) {
		return String(value)
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"');
	}

	function evalHost(script) {
		return new Promise(function (resolve, reject) {
			csInterface.evalScript(script, function (result) {
				if (!result || result === "EvalScript error.") {
					reject(new Error("Premiere no respondió al script."));
					return;
				}
				try {
					var data = JSON.parse(result);
					if (!data.ok) {
						reject(new Error(data.error || "Error en Premiere."));
						return;
					}
					resolve(data);
				} catch (err) {
					reject(new Error(result));
				}
			});
		});
	}

	function getProjectDir() {
		return evalHost("$._meme.getProjectDir()");
	}

	function importAndInsert(filePath) {
		return evalHost('$._meme.importAndInsert("' + escapeJsxString(filePath) + '")');
	}

	function sanitizeName(id, slug) {
		var base = String(id || "gif") + "_" + String(slug || "meme");
		return base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
	}

	function xhrGetJson(url, label) {
		var name = label || "Giphy";
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.open("GET", url, true);
			xhr.onload = function () {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						resolve(JSON.parse(xhr.responseText));
					} catch (e) {
						reject(new Error("Respuesta de " + name + " inválida."));
					}
				} else {
					reject(new Error(name + " HTTP " + xhr.status));
				}
			};
			xhr.onerror = function () {
				reject(new Error("No se pudo conectar con " + name + "."));
			};
			xhr.send();
		});
	}

	function downloadBinary(url, destPath) {
		return new Promise(function (resolve, reject) {
			if (!fs) {
				reject(new Error("Node.js no está habilitado en el panel CEP."));
				return;
			}
			var xhr = new XMLHttpRequest();
			xhr.open("GET", url, true);
			xhr.responseType = "arraybuffer";
			xhr.onload = function () {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						fs.writeFileSync(destPath, Buffer.from(xhr.response));
						resolve(destPath);
					} catch (e) {
						reject(e);
					}
				} else {
					reject(new Error("Descarga HTTP " + xhr.status));
				}
			};
			xhr.onerror = function () {
				reject(new Error("Fallo al descargar el GIF."));
			};
			xhr.send();
		});
	}

	// Acepta un JSON propio ({version, url}) o la respuesta de GitHub Releases.
	function parseRemoteRelease(payload) {
		if (!payload) {
			return null;
		}
		var version = payload.version || payload.tag_name || payload.latest;
		if (!version) {
			return null;
		}
		var url = payload.url || payload.download || payload.downloadUrl || "";
		var assets = payload.assets || [];
		var i;
		for (i = 0; !url && i < assets.length; i++) {
			if (/\.zxp$/i.test(assets[i].name || "")) {
				url = assets[i].browser_download_url;
			}
		}
		if (!url && assets.length) {
			url = assets[0].browser_download_url;
		}
		if (!url) {
			url = payload.html_url || "";
		}
		return { version: String(version).replace(/^v/i, ""), url: url };
	}

	function hideUpdateAction() {
		state.pendingAction = null;
		els.updateAction.hidden = true;
	}

	function showUpdateAction(label, handler) {
		state.pendingAction = handler;
		els.updateAction.textContent = label;
		els.updateAction.hidden = false;
	}

	function reloadPanel() {
		var root = csInterface.getSystemPath(SystemPath.EXTENSION);
		var hostPath = (pathMod ? pathMod.join(root, "jsx", "host.jsx") : root + "/jsx/host.jsx");
		csInterface.evalScript('$.evalFile("' + escapeJsxString(hostPath) + '")', function () {
			location.reload();
		});
	}

	function checkForUpdate(silent) {
		var installed = localVersion();
		els.version.textContent = "v" + installed;
		hideUpdateAction();

		if (state.loadedVersion && compareVersions(installed, state.loadedVersion) > 0) {
			showUpdateAction("Recargar", reloadPanel);
			setStatus("v" + installed + " instalada. Recarga el panel para aplicarla.");
			return Promise.resolve();
		}

		var url = getUpdateUrl();
		if (!url) {
			if (!silent) {
				setStatus("Añade la URL de actualizaciones en Ajustes.", true);
				els.settings.hidden = false;
				els.settingsToggle.setAttribute("aria-expanded", "true");
			}
			return Promise.resolve();
		}

		if (!silent) {
			setStatus("Buscando actualización…");
		}
		els.checkUpdate.disabled = true;

		return xhrGetJson(url, "servidor de actualizaciones")
			.then(function (payload) {
				var release = parseRemoteRelease(payload);
				if (!release) {
					throw new Error("El servidor no devolvió una versión.");
				}
				if (compareVersions(release.version, installed) > 0) {
					showUpdateAction("Descargar", function () {
						if (!release.url) {
							setStatus("La actualización no trae enlace de descarga.", true);
							return;
						}
						csInterface.openURLInDefaultBrowser(release.url);
						setStatus("Instala el .zxp descargado y pulsa Actualizar.");
					});
					setStatus("Nueva versión v" + release.version + " disponible.");
				} else if (!silent) {
					setStatus("");
				}
			})
			.catch(function (err) {
				if (!silent) {
					setStatus(err.message, true);
				}
			})
			.then(function () {
				els.checkUpdate.disabled = false;
			});
	}

	function giphyUrl() {
		var key = getApiKey();
		if (!key) {
			throw new Error("Añade tu API key de Giphy.");
		}
		var endpoint = state.mode === "search" ? "/search" : "/trending";
		var url =
			GIPHY +
			endpoint +
			"?api_key=" +
			encodeURIComponent(key) +
			"&limit=" +
			PAGE_SIZE +
			"&offset=" +
			state.offset +
			"&rating=g&lang=es";
		if (state.mode === "search") {
			url += "&q=" + encodeURIComponent(state.query);
		}
		return url;
	}

	function previewUrl(gif) {
		var images = gif.images || {};
		if (images.fixed_width && images.fixed_width.url) {
			return images.fixed_width.url;
		}
		if (images.preview_gif && images.preview_gif.url) {
			return images.preview_gif.url;
		}
		if (images.downsized && images.downsized.url) {
			return images.downsized.url;
		}
		return (images.original && images.original.url) || "";
	}

	function originalGifUrl(gif) {
		var images = gif.images || {};
		if (images.original && images.original.url) {
			return images.original.url;
		}
		if (images.downsized && images.downsized.url) {
			return images.downsized.url;
		}
		return previewUrl(gif);
	}

	function renderCards(gifs, append) {
		if (!append) {
			els.grid.innerHTML = "";
		}
		gifs.forEach(function (gif) {
			var card = document.createElement("button");
			card.type = "button";
			card.className = "card";
			card.setAttribute("data-id", gif.id);
			card.title = "Añadir al timeline";

			var thumb = document.createElement("div");
			thumb.className = "thumb";
			var img = document.createElement("img");
			img.alt = gif.title || "GIF";
			img.loading = "lazy";
			img.src = previewUrl(gif);
			thumb.appendChild(img);

			var title = document.createElement("p");
			title.className = "card-title";
			title.textContent = gif.title || gif.slug || gif.id;

			card.appendChild(thumb);
			card.appendChild(title);
			card.addEventListener("click", function () {
				addGif(gif, card);
			});
			els.grid.appendChild(card);
		});

		var hasItems = els.grid.children.length > 0;
		els.empty.hidden = hasItems;
		if (!hasItems) {
			els.empty.textContent = "No hay resultados.";
		}
		els.loadMore.hidden = state.offset >= state.total || !hasItems;
	}

	function loadGifs(reset) {
		if (state.loading) {
			return;
		}
		if (reset) {
			state.offset = 0;
			els.grid.innerHTML = "";
		}
		state.loading = true;
		els.loadMore.disabled = true;
		setStatus("Cargando memes…");
		els.empty.hidden = true;

		var url;
		try {
			url = giphyUrl();
		} catch (e) {
			state.loading = false;
			els.empty.hidden = false;
			els.empty.textContent = e.message;
			setStatus(e.message, true);
			els.settings.hidden = false;
			return;
		}

		xhrGetJson(url)
			.then(function (payload) {
				var gifs = (payload.data || []).filter(function (g) {
					return g && g.id && originalGifUrl(g);
				});
				var pagination = payload.pagination || {};
				state.offset += gifs.length;
				if (gifs.length === 0) {
					state.total = state.offset;
				} else {
					state.total = pagination.total_count || state.offset;
				}
				renderCards(gifs, !reset);
				setStatus(gifs.length ? "" : "No hay resultados.");
			})
			.catch(function (err) {
				els.empty.hidden = false;
				els.empty.textContent = err.message;
				setStatus(err.message, true);
			})
			.then(function () {
				state.loading = false;
				els.loadMore.disabled = false;
			});
	}

	function addGif(gif, card) {
		if (state.busyId) {
			return;
		}
		if (!fs || !pathMod) {
			setStatus("Este panel necesita Node.js (CEP).", true);
			return;
		}

		state.busyId = gif.id;
		card.classList.add("busy");
		setStatus("Guardando GIF…");

		getProjectDir()
			.then(function (info) {
				var gifDir = pathMod.join(info.path, "gif");
				if (!fs.existsSync(gifDir)) {
					fs.mkdirSync(gifDir);
				}
				var fileName = sanitizeName(gif.id, gif.slug) + ".gif";
				var dest = pathMod.join(gifDir, fileName);
				if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
					return dest;
				}
				return downloadBinary(originalGifUrl(gif), dest);
			})
			.then(function (dest) {
				setStatus("Insertando en el timeline…");
				return importAndInsert(dest).then(function (result) {
					return { dest: dest, track: result.track };
				});
			})
			.then(function (info) {
				var label = pathMod.basename(info.dest);
				if (info.track) {
					setStatus("Añadido en V" + info.track + ": " + label);
				} else {
					setStatus("Añadido: " + label);
				}
			})
			.catch(function (err) {
				setStatus(err.message, true);
			})
			.then(function () {
				state.busyId = null;
				card.classList.remove("busy");
			});
	}

	els.form.addEventListener("submit", function (ev) {
		ev.preventDefault();
		var q = els.input.value.trim();
		if (!q) {
			state.mode = "trending";
			state.query = "";
		} else {
			state.mode = "search";
			state.query = q;
		}
		loadGifs(true);
	});

	els.trending.addEventListener("click", function () {
		els.input.value = "";
		state.mode = "trending";
		state.query = "";
		loadGifs(true);
	});

	els.loadMore.addEventListener("click", function () {
		loadGifs(false);
	});

	els.wrap.addEventListener("scroll", function () {
		if (els.loadMore.hidden || state.loading) {
			return;
		}
		var nearBottom = els.wrap.scrollTop + els.wrap.clientHeight >= els.wrap.scrollHeight - 80;
		if (nearBottom) {
			loadGifs(false);
		}
	});

	els.settingsToggle.addEventListener("click", function () {
		var open = els.settings.hidden;
		els.settings.hidden = !open;
		els.settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
	});

	els.saveKey.addEventListener("click", function () {
		var key = els.apiKey.value.trim();
		if (!key) {
			setStatus("La API key no puede estar vacía.", true);
			return;
		}
		localStorage.setItem(KEY_STORAGE, key);
		setStatus("API key guardada.");
		loadGifs(true);
	});

	els.saveUpdateUrl.addEventListener("click", function () {
		var url = els.updateUrl.value.trim();
		if (url) {
			localStorage.setItem(UPDATE_URL_STORAGE, url);
		} else {
			localStorage.removeItem(UPDATE_URL_STORAGE);
		}
		checkForUpdate(false);
	});

	els.checkUpdate.addEventListener("click", function () {
		checkForUpdate(false);
	});

	els.updateAction.addEventListener("click", function () {
		if (state.pendingAction) {
			state.pendingAction();
		}
	});

	els.apiKey.value = getApiKey();
	els.updateUrl.value = getUpdateUrl();
	state.loadedVersion = localVersion();
	els.version.textContent = "v" + state.loadedVersion;
	hideUpdateAction();
	if (getUpdateUrl()) {
		checkForUpdate(true);
	}
	if (!getApiKey()) {
		els.settings.hidden = false;
		setStatus("Pega tu API key de Giphy para cargar memes.");
		els.empty.hidden = false;
		els.empty.textContent = "Configura la API key para ver la librería.";
	} else {
		loadGifs(true);
	}
})();
