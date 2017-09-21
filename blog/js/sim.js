"use strict";

const fs = require('fs');

const MoxieProcess = require('./moxieprocess.js').MoxieProcess;

function WrapStream(stream) {
	return {
		write: function(s) { stream.write(s); },
		close: function() { }
	};
}


var fdTable = [];
fdTable[1] = WrapStream(process.stdout);
fdTable[2] = WrapStream(process.stderr);

var data = fs.readFileSync(process.argv[2]);
var proc = new MoxieProcess({ fdTable: fdTable, fb: null });
proc.load(data);
proc.run(process.argv.slice(2));
