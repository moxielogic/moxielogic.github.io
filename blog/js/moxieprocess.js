"use strict";

(function(exports) {
	const EBADF = 9;
	const ENOSYS = 88;

	function ArrayEqual(arr1, off1, arr2, off2, n) {
		for (var i = 0; i < n; ++i) {
			if (arr1[off1 + i] !== arr2[off2 + i])
				return false;
		}
		return true;
	}

	var LE = {
		r16: (arr, i) => arr[i] | (arr[i + 1] << 8),
		r32: function(arr, i) {
			return arr[i] | (arr[i + 1] << 8) | (arr[i + 2] << 16) | (arr[i + 3] << 24);
		}
	};

	var BE = {
		r16: function(arr, i) {
			return (arr[i] << 8) | arr[i + 1];
		},
		r32: function(arr, i) {
			return (arr[i] << 24) | (arr[i + 1] << 16) | (arr[i + 2] << 8) | arr[i + 3];
		}
	};

	function Join(values) {
		var n = values.length;
		var text = "";
		for (var i = 0; i < values.length; ++i) {
			if (i != 0)
				text += " ";
			var x = values[i];
			if (x < 0)
				x += 0x100000000;
			text += x.toString(16);
		}
		return text;
	}

	function MoxieProcess(deps) {
		var heap = new ArrayBuffer(512 * 1024 * 1024);
		var heap8 = new Uint8Array(heap);
		var pc;

		function LoadElf32(data) {
			var magic = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
			var ELFCLASS32 = 1;
			var ELFDATA2LSB = 1;
			var ELFDATA2MSB = 2;
			var EM_MOXIE = 223;
			var PT_LOAD = 1;

			var data8 = new Uint8Array(data);
			if (!ArrayEqual(data8, 0, magic, 0, 4))
				throw "bad ELF magic";
			if (data8[4] != ELFCLASS32)
				throw "wrong class";
			var r;
			switch (data8[5]) {
			case ELFDATA2LSB: r = LE; break;
			case ELFDATA2MSB: r = BE; break;
			default: throw "wrong endianness";
			}
			var e_machine = r.r16(data8, 18);
			if (e_machine != EM_MOXIE)
				throw "wrong machine (non-moxie)";
			var e_entry = r.r32(data8, 24);
			var e_phoff = r.r32(data8, 28);
			var e_phentsize = r.r16(data8, 42);
			var e_phnum = r.r16(data8, 44);
			for (var i = 0; i < e_phnum; ++i) {
				var off = e_phoff + i * e_phentsize;
				var p_type = r.r32(data8, off);
				var p_offset = r.r32(data8, off + 4);
				var p_vaddr = r.r32(data8, off + 8);
				var p_filesz = r.r32(data8, off + 16);
				var p_memsz = r.r32(data8, off + 20);
				if (p_type != PT_LOAD)
					continue;
				if (p_filesz > p_memsz)
					throw "bad segment";
				var seg = data8.subarray(p_offset, p_offset + p_filesz);
				heap8.set(seg, p_vaddr);
				for (var j = p_filesz; j < p_memsz; ++j) 
					heap8[p_vaddr + i] = 0;
			}
			pc = e_entry;
		}

		function write32be(addr, value) {
			heap8[addr] = value >>> 24;
			heap8[addr + 1] = value >>> 16;
			heap8[addr + 2] = value >>> 8;
			heap8[addr + 3] = value;
		}

		function SetCommandLine(args) {
			var argc = args.length;
			var p = (3 + argc) * 4;
			var q = 4;
			write32be(q, argc);
			q += 4;
			for (var i = 0; i < argc; ++i) {
				write32be(q,  p);
				q += 4;
				var arg = args[i];
				var l = arg.length;
				for (var j = 0; j < l; ++j) {
					heap8[p] = arg.charCodeAt(j);
					++p
				}
				heap8[p] = 0;
				++p;
			}
			write32be(4 * (2 + argc), 0);
		}

		function Run() {
			var MoxieCPU;
			if (typeof require !== "undefined")
				MoxieCPU = require("./moxiecpu.js").MoxieCPU;
			else
				MoxieCPU = moxiecpu.MoxieCPU;

			var heap8 = new Uint8Array(heap);
			var cpu;
			const foreign = {
				raise: function(sig) {
					var pc = cpu.get_pc();
					console.log("pc: " + pc.toString(16));
					throw sig;
				},
				trace: function(pc, inst,
					fp, sp, r0, r1,
					r2, r3, r4, r5,
					r6, r7, r8, r9,
					r10, r11, r12, r13) {
					console.log(Join([ pc, inst,
						fp, sp, r0, r1,
						r2, r3, r4, r5,
						r6, r7, r8, r9,
						r10, r11, r12, r13
					]));
				},
				interr: function() { throw "internal error"; },
				TODO: function(x) { throw "TODO: " + x.toString(16); }
			};
			const stdlib = {
				Uint8Array: Uint8Array,
				Uint16Array: Uint16Array,
				Uint32Array: Uint32Array,
				Math: Math
			};
			cpu = new MoxieCPU(stdlib, foreign, heap);
			cpu.set_pc(pc);
			var fdTable = deps.fdTable;
			var fb = deps.fb;
			var fd;

			function Resume() {
				for (;;) {
					cpu.run();
					var swi = cpu.get_swi();
					var r0, r1, r2;
					switch (swi) {
					case 0:
						break;
					case 1: // exit
						r0 = cpu.get_r0();
						return r0;
					case 3: // close
						r0 = cpu.get_r0();
						fd = fdTable[r0];
						if (fd != null) {
							fd.close();
							fdTable[r0] = null;
							r0 = 0;
						} else
							r0 = -EBADF;
						cpu.set_r0(r0);
						break;
					case 4: // read
						throw "TODO: read";
					case 5: // write
						r0 = cpu.get_r0();
						r1 = cpu.get_r1();
						r2 = cpu.get_r2();
						fd = fdTable[r0];
						if (fd != null) {
							var strs = new Array(r2);
							for (var i = 0; i < r2; ++i) {
								var c = heap8[r1 + i];
								strs[i] = String.fromCharCode(c);
							}
							fd.write(strs.join(""));
							r0 = r2;
						} else
							r0 = -EBADF;
						cpu.set_r0(r0);
						break;
					case 0x100: // fbwrite
						if (fb != null) {
							r0 = cpu.get_r0();
							r1 = cpu.get_r1();
							r2 = cpu.get_r2();
							fb.set(heap8, r0, r1, r2);
							cpu.set_r0(0);
						} else
							cpu.set_r0(-ENOSYS);
						break;
					case 0x101: // msleep
						if (typeof window !== "undefined") {
							window.setTimeout(Resume, cpu.get_r0());
							cpu.set_r0(0);
							return;
						} else
							cpu.set_r0(-ENOSYS);
						break;
					default:
						cpu.set_r0(-ENOSYS);
						break;
					}
				}
			}

			Resume();
		}

		return {
			load: function(data) {
				LoadElf32(data);
			},
			run: function(args) {
				SetCommandLine(args);
				Run();
			}
		}
	}

	exports.MoxieProcess = MoxieProcess;
})(typeof exports === "undefined" ? this["moxieprocess"] = {} : exports);
