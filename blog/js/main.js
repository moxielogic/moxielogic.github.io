"use strict";

function LoadAsync(url, onready) {
	var req = new XMLHttpRequest();
	req.responseType = "arraybuffer";
	req.open("get", url);
	req.onreadystatechange = function() {
		if (req.readyState !== XMLHttpRequest.DONE)
			return;
		if (req.status !== 200)
			return;
		onready(req.response);
	}
	req.send();
}

function FDFromElement(elem) {
	return {
		write: function(s) { elem.textContent += s; },
		close: function() { }
	};
}

function OnProgramChange() {
	var program = document.getElementById("program");
	var args = document.getElementById("args");
	var index = program.selectedIndex;
	if (index < 0)
		return;
	var item = program.item(index);
	switch (item.value) {
	case "binarytrees": args.value = "10"; break;
	case "fasta": args.value = "1000"; break;
	case "fannkuchredux": args.value = "9"; break;
	case "nbody": args.value = "1000"; break;
	case "lissa": args.value = "2 3"; break;
	}
}

function conv16to32(src, i, dst, n) {
	i = i|0;
	n = n|0;
	var j = 0;
	while (n) {
		var h = src[i]|0;
		var l = src[(i + 1)|0];
		i = (i + 2)|0;
		var c16 = (h << 8) | l;
		dst[j] = (255 * (c16 >> 11) / 0x1f)|0;
		dst[(j + 1)|0] = (255 * ((c16 >> 5) & 0x3f) / 0x3f)|0;
		dst[(j + 2)|0] = (255 * (c16 & 0x1f) / 0x1f)|0;
		dst[(j + 3)|0] = 0xff;
		j = (j + 4)|0;
		n = (n - 1)|0;
	}
}

var g_asmJsLoaded = false;
var g_documentLoaded = false;

function OnRunClick() {
	if (!(g_asmJsLoaded && g_documentLoaded))
		return;

	var stdout = document.getElementById("stdout");
	stdout.textContent = "";
	var stderr = document.getElementById("stderr");
	stderr.textContent = "";
	var fdTable = [];
	fdTable[1] = FDFromElement(stdout);
	fdTable[2] = FDFromElement(stderr);

	var canvas = document.getElementById("canvas");
	canvas.width = 0;
	canvas.height = 0;

	var fb = {
		set: function(heap8, addr, width, height) {
			var ctx = canvas.getContext("2d");
			var imageData = ctx.createImageData(width, height);
			var data = imageData.data;
			canvas.width = width;
			canvas.height = height;
			conv16to32(heap8, addr, data, width * height);
			ctx.putImageData(imageData, 0, 0);
		}
	};


	var process = moxieprocess.MoxieProcess({ fdTable: fdTable, fb: fb });
	var program = document.getElementById("program");
	var args = document.getElementById("args");
	var index = program.selectedIndex;
	if (index < 0)
		return;
	var item = program.item(index);
	var progName = item.value;
	var argv = args.value.split(" ");
	argv.splice(0, 0, progName);
	LoadAsync("/" + progName, function (data) {
		process.load(data);
		process.run(argv);
	});
}

function OnReady() {
	if (!(g_asmJsLoaded && g_documentLoaded))
		return;
	OnProgramChange();
}

function OnAsmJsLoaded() {
	g_asmJsLoaded = true;
	OnReady();
}

function OnDocumentLoaded() {
	g_documentLoaded = true;
	OnReady();
}

function OnLoad() {
	document.removeEventListener("DOMContentLoaded", OnLoad);
	window.removeEventListener("load", OnLoad);
	OnDocumentLoaded();
}

function main() {
	if (document.readyState === "complete" ||
		(document.readyState !== "loading" && !document.documentElement.doScroll)) {
		window.setTimeout(OnDocumentLoaded);
	} else {
		document.addEventListener("DOMContentLoaded", OnLoad);
		window.addEventListener("load", OnLoad);
	}
}

main()
