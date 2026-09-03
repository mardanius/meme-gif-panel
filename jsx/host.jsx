if (typeof $ === "undefined") {
	$ = {};
}

$._meme = {
	_json: function (ok, extra) {
		var out = { ok: ok };
		if (extra) {
			for (var k in extra) {
				if (extra.hasOwnProperty(k)) {
					out[k] = extra[k];
				}
			}
		}
		return JSON.stringify(out);
	},

	_normPath: function (p) {
		if (!p) {
			return "";
		}
		return String(p).replace(/\\/g, "/").toLowerCase();
	},

	_dirName: function (filePath) {
		var p = String(filePath);
		var idxFwd = p.lastIndexOf("/");
		var idxBack = p.lastIndexOf("\\");
		var idx = idxFwd > idxBack ? idxFwd : idxBack;
		if (idx < 0) {
			return p;
		}
		return p.substring(0, idx);
	},

	_findBin: function (parent, name) {
		var i;
		var child;
		for (i = 0; i < parent.children.numItems; i++) {
			child = parent.children[i];
			if (child.type === ProjectItemType.BIN && child.name === name) {
				return child;
			}
		}
		return null;
	},

	_topUnlockedVideoTrack: function (seq) {
		var i;
		var track;
		for (i = seq.videoTracks.numTracks - 1; i >= 0; i--) {
			track = seq.videoTracks[i];
			if (track && !track.isLocked()) {
				return { track: track, index: i };
			}
		}
		return null;
	},

	_getOrCreateGifBin: function () {
		var existing = this._findBin(app.project.rootItem, "gif");
		if (existing) {
			return existing;
		}
		return app.project.rootItem.createBin("gif");
	},

	_findItemByPath: function (parent, targetPath) {
		var i;
		var child;
		var found;
		var media;
		var want = this._normPath(targetPath);
		for (i = 0; i < parent.children.numItems; i++) {
			child = parent.children[i];
			if (child.type === ProjectItemType.BIN) {
				found = this._findItemByPath(child, targetPath);
				if (found) {
					return found;
				}
			} else {
				try {
					media = child.getMediaPath();
					if (this._normPath(media) === want) {
						return child;
					}
				} catch (e) {}
			}
		}
		return null;
	},

	getProjectDir: function () {
		try {
			if (!app.project) {
				return this._json(false, { error: "No hay proyecto abierto." });
			}
			var projectPath = app.project.path;
			if (!projectPath || projectPath === "not saved" || projectPath === "") {
				return this._json(false, { error: "Guarda el proyecto primero." });
			}
			return this._json(true, { path: this._dirName(projectPath) });
		} catch (e) {
			return this._json(false, { error: String(e) });
		}
	},

	importAndInsert: function (filePath) {
		try {
			if (!app.project) {
				return this._json(false, { error: "No hay proyecto abierto." });
			}
			var seq = app.project.activeSequence;
			if (!seq) {
				return this._json(false, { error: "Abre una secuencia activa." });
			}
			if (!seq.videoTracks || seq.videoTracks.numTracks < 1) {
				return this._json(false, { error: "La secuencia no tiene pistas de vídeo." });
			}

			var target = this._topUnlockedVideoTrack(seq);
			if (!target) {
				return this._json(false, { error: "Todas las pistas de vídeo están bloqueadas." });
			}

			var bin = this._getOrCreateGifBin();
			var item = this._findItemByPath(app.project.rootItem, filePath);
			if (!item) {
				app.project.importFiles([filePath], 1, bin, 0);
				item = this._findItemByPath(app.project.rootItem, filePath);
			}
			if (!item) {
				return this._json(false, { error: "No se pudo importar el GIF." });
			}

			var t = seq.getPlayerPosition();
			target.track.insertClip(item, t);
			return this._json(true, { track: target.index + 1 });
		} catch (e) {
			return this._json(false, { error: String(e) });
		}
	}
};
