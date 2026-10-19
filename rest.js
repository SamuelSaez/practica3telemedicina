(function () {
	function debug(...args) {
		if (rest.debug) console.log("REST", ...args);
	}

	function rest(method, url, data, callback) {
		method = method.toUpperCase();
		if (typeof data === "function") {
			callback = data;
			data = null;
		}
		var async = typeof callback === "function";
		if (data && typeof data !== "string") data = JSON.stringify(data);
		var xhr = new XMLHttpRequest();
		xhr.open(method, url, async);
		if (rest.token && url.charAt(0) === "/") {
    		xhr.setRequestHeader("Authorization", "Bearer " + rest.token);
		}
		if(data) xhr.setRequestHeader("Content-type", "application/json;charset=UTF-8");
		debug(">>>", method, url, data);
		xhr.send(data);
		function end() {
			debug("<<<", xhr.status, xhr.response);
			var response = xhr.response;
			if (xhr.status >= 200 && xhr.status < 300 && response) response = JSON.parse(response);
			if (xhr.status === 401 && typeof rest.onNoAutorizado === "function") rest.onNoAutorizado();
			if (async) {
				callback(xhr.status, response);
			} else {
				return { status: xhr.status, response: response };
			}
		}
		if (async) {
			xhr.onload = end;
			xhr.onerror = end;
		} else {
			return end();
		}
	};

	rest.debug = false;
	rest.token = null;
	rest.get = function (url, callback) { return rest("GET", url, callback); };
	rest.post = function (url, data, callback) { return rest("POST", url, data, callback); };
	rest.put = function (url, data, callback) { return rest("PUT", url, data, callback); };
	rest.delete = function (url, callback) { return rest("DELETE", url, callback); };

	window.rest = rest;
})();