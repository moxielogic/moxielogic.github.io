"use strict";

(function(exports) {
	function MoxieCPU(stdlib, foreign, heap) {
		"use asm";

		var raise = foreign.raise;
		var trace = foreign.trace;
		var interr = foreign.interr;
		var TODO = foreign.TODO;

		var mem8 = new stdlib.Uint8Array(heap);
		var mem16 = new stdlib.Uint16Array(heap);
		var mem32 = new stdlib.Uint32Array(heap);
		var imul = stdlib.Math.imul;

		var SIGILL = 4;
		var SIGTRAP = 5;
		var SIGSEGV = 11;

		var CC_GT = 0x01;
		var CC_LT = 0x02;
		var CC_EQ = 0x04;
		var CC_GTU = 0x08;
		var CC_LTU = 0x10;

		var pc = 0;
		var cc = 0;

		var fp = 0, sp = 0, r0 = 0, r1 = 0,
			r2 = 0, r3 = 0, r4 = 0, r5 = 0,
			r6 = 0, r7 = 0, r8 = 0, r9 = 0,
			r10 = 0, r11 = 0, r12 = 0, r13 = 0;

		var swi = 0;

		function read16(addr) {
			addr = addr|0;
			var x = 0;
			if (addr & 1)
				raise(SIGSEGV|0);
			x = mem16[addr >> 1]|0;
			return ((x >> 8) | (x << 8)) & 0xffff;
		}

		function read32(addr) {
			addr = addr|0;
			var x0 = 0, x1 = 0;
			if (addr & 1)
				raise(SIGSEGV|0);
			x0 = mem16[addr >> 1]|0;
			x0 = ((x0 >> 8) | (x0 << 8)) & 0xffff;
			x1 = mem16[(addr + 2) >> 1]|0;
			x1 = ((x1 >> 8) | (x1 << 8)) & 0xffff;
			return (x0 << 16) | x1;
		}

		function write8(addr, value) {
			addr = addr|0;
			value = value|0;
			mem8[addr] = value;
		}

		function write16(addr, value) {
			addr = addr|0;
			value = value|0;
			if (addr & 1)
				raise(SIGSEGV|0);
			mem16[addr >> 1] = (value >> 8) | (value << 8);
		}

		function write32(addr, value) {
			addr = addr|0;
			value = value|0;
			var x0 = 0, x1 = 0;
			if (addr & 1)
				raise(SIGSEGV|0);
			x0 = value >>> 16;
			x0 = ((x0 >> 8) | (x0 << 8)) & 0xffff;
			x1 = value & 0xffff;
			x1 = ((x1 >> 8) | (x1 << 8)) & 0xffff;
			mem16[addr >> 1] = x0;
			mem16[(addr + 2) >> 1] = x1;
		}

		function getreg(index) {
			index = index|0;
			switch (index|0) {
			case 0x0: return fp|0; case 0x1: return sp|0;
			case 0x2: return r0|0; case 0x3: return r1|0;
			case 0x4: return r2|0; case 0x5: return r3|0;
			case 0x6: return r4|0; case 0x7: return r5|0;
			case 0x8: return r6|0; case 0x9: return r7|0;
			case 0xa: return r8|0; case 0xb: return r9|0;
			case 0xc: return r10|0; case 0xd: return r11|0;
			case 0xe: return r12|0; case 0xf: return r13|0;
			}
			return interr()|0;
		}

		function setreg(index, value) {
			index = index|0;
			value = value|0;
			switch (index|0) {
			case 0x0: fp = value; break; case 0x1: sp = value; break;
			case 0x2: r0 = value; break; case 0x3: r1 = value; break;
			case 0x4: r2 = value; break; case 0x5: r3 = value; break;
			case 0x6: r4 = value; break; case 0x7: r5 = value; break;
			case 0x8: r6 = value; break; case 0x9: r7 = value; break;
			case 0xa: r8 = value; break; case 0xb: r9 = value; break;
			case 0xc: r10 = value; break; case 0xd: r11 = value; break;
			case 0xe: r12 = value; break; case 0xf: r13 = value; break;
			default: interr(); break;
			}
		}

		function bcc(inst, cond) {
			inst = inst|0;
			cond = cond|0;
			var offset = 0;
			if (cond) {
				offset = (inst & 0x3ff) << 1;
				if (offset & 0x400)
					offset = offset | 0xfffff800;
				pc = (pc + 2 + offset)|0;
			} else
				pc = (pc + 2)|0;
			return 0;
		}

		function imm16s() {
			var x = 0;
			x = read16((pc + 2)|0)|0;
			if (x & 0x8000)
				x = x | 0xffff0000;
			return x|0;
		}

		function imm32() {
			return read32((pc + 2)|0)|0;
		}

		function jsr(dest, ret) {
			dest = dest|0;
			ret = ret|0;
			// return address
			write32((sp - 8)|0, ret);
			// frame pointer
			write32((sp - 12)|0, fp);
			sp = (sp - 12)|0;
			fp = sp;
			pc = dest;
		}

		function umul(a, b) {
			a = a|0;
			b = b|0;
			var r = 0;
			var i = 32;
			var bit = 1;
			for (; i; i = (i - 1)|0) {
				if (a & bit)
					r = (r + b)|0;
				bit = bit << 1;
				b = b << 1;
			}
			return r|0;
		}

		function step8(inst) {
			inst = inst|0;
			return 0;
		}

		function step() {
			var inst = 0, imm = 0;
			var a = 0, b = 0;
			var va = 0, vb = 0;
			inst = read16(pc)|0;
			/*
			trace(pc|0, inst|0,
				fp|0, sp|0, r0|0, r1|0,
				r2|0, r3|0, r4|0, r5|0,
				r6|0, r7|0, r8|0, r9|0,
				r10|0, r11|0, r12|0, r13|0);
			*/
			switch ((inst >> 8)|0) {
			case 0x00:
				return SIGILL|0;
			case 0x01: // ldi.l
				a = (inst >> 4) & 0xf;
				setreg(a, imm32()|0);
				pc = (pc + 6)|0;
				break;
			case 0x02: // mov
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				setreg(a, getreg(b)|0);
				pc = (pc + 2)|0;
				break;
			case 0x03: // jsra
				imm = imm32()|0;
				jsr(imm, (pc + 6)|0);
				break;
			case 0x04: // ret
				sp = fp;
				fp = read32(sp)|0;
				pc = read32((sp + 4)|0)|0;
				sp = (sp + 12)|0;
				break;
			case 0x05: // add.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, (va + vb)|0);
				pc = (pc + 2)|0;
				break;
			case 0x06: // push
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				va = (va - 4)|0;
				write32(va, vb);
				setreg(a, va);
				pc = (pc + 2)|0;
				break;
			case 0x07: // pop
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0;
				vb = read32(va|0)|0;
				va = (va + 4)|0;
				setreg(a, va);
				setreg(b, vb);
				pc = (pc + 2)|0;
				break;
			case 0x08: // lda.l
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				setreg(a, read32(imm)|0);
				pc = (pc + 6)|0;
				break;
			case 0x09: // sta.l
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				write32(imm, getreg(a)|0);
				pc = (pc + 6)|0;
				break;
			case 0x0a: // ld.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				va = read32(vb)|0;
				setreg(a, va);
				pc = (pc + 2)|0;
				break;
			case 0x0b: // st.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				write32(va, vb);
				pc = (pc + 2)|0;
				break;
			case 0x0c: // ldo.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				imm = imm16s()|0;
				setreg(a, read32((vb + imm)|0)|0);
				pc = (pc + 4)|0;
				break;
			case 0x0d: // sto.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				imm = imm16s()|0;
				write32((va + imm)|0, vb);
				pc = (pc + 4)|0;
				break;
			case 0x0e: // cmp
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				if ((va|0) == (vb|0))
					cc = CC_EQ;
				else {
					cc = 0;
					if ((va|0) < (vb|0))
						cc = cc | CC_LT;
					if ((va|0) > (vb|0))
						cc = cc | CC_GT;
					if ((va>>>0) < (vb>>>0))
						cc = cc | CC_LTU;
					if ((va>>>0) > (vb>>>0))
						cc = cc | CC_GTU;
				}
				pc = (pc + 2)|0;
				break;
			case 0x0f: // nop
				pc = (pc + 2)|0;
				break;
			case 0x10: // sex.b
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				if (vb & 0x80)
					va = vb | 0xffffff80;
				else
					va = vb & 0x7f;
				setreg(a, va);
				pc = (pc + 2)|0;
				break;
			case 0x11: // sex.s
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				if (vb & 0x8000)
					va = vb | 0xffff8000;
				else
					va = vb & 0x7fff;
				setreg(a, va);
				pc = (pc + 2)|0;
				break;
			case 0x12: // zex.b
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				setreg(a, vb & 0xff);
				pc = (pc + 2)|0;
				break;
			case 0x13: // zex.s
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				setreg(a, vb & 0xffff);
				pc = (pc + 2)|0;
				break;
			case 0x14: // umul.x
				TODO(inst|0);
				break;
			case 0x15: // mul.x
				TODO(inst|0);
				break;
			case 0x16:
			case 0x17:
			case 0x18:
				return SIGILL|0;
			case 0x19: // jsr
				a = (inst >> 4) & 0xf;
				va = getreg(a)|0;
				jsr(va, (pc + 2)|0);
				break;
			case 0x1a: // jmpa
				pc = imm32()|0;
				break;
			case 0x1b: // ldi.b
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				setreg(a, imm);
				pc = (pc + 6)|0;
				break;
			case 0x1c: // ld.b
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				setreg(a, mem8[vb]|0);
				pc = (pc + 2)|0;
				break;
			case 0x1d: // lda.b
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				setreg(a, mem8[imm]|0);
				pc = (pc + 6)|0;
				break;
			case 0x1e: // st.b
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				write8(va, vb);
				pc = (pc + 2)|0;
				break;
			case 0x1f: // sta.b
				a = (inst >> 4) & 0xf;
				va = getreg(a)|0;
				imm = imm32()|0;
				write8(imm, va);
				pc = (pc + 6)|0;
				break;
			case 0x20: // ldi.s
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				setreg(a, imm);
				pc = (pc + 6)|0;
				break;
			case 0x21: // ld.s
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				va = read16(vb)|0;
				setreg(a, va);
				pc = (pc + 2)|0;
				break;
			case 0x22: // lda.s
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				setreg(a, read16(imm)|0);
				pc = (pc + 6)|0;
				break;
			case 0x23: // st.s
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				write16(va, vb);
				pc = (pc + 2)|0;
				break;
			case 0x24: // sta.s
				a = (inst >> 4) & 0xf;
				imm = imm32()|0;
				va = getreg(a)|0;
				write16(imm, va);
				pc = (pc + 6)|0;
				break;
			case 0x25: // jmp
				a = (inst >> 4) & 0xf;
				pc = getreg(a)|0;
				break;
			case 0x26: // and
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, (va & vb)|0);
				pc = (pc + 2)|0;
				break;
			case 0x27: // lshr
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, va >>> vb);
				pc = (pc + 2)|0;
				break;
			case 0x28: // ashl
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, va << vb);
				pc = (pc + 2)|0;
				break;
			case 0x29: // sub.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, (va - vb)|0);
				pc = (pc + 2)|0;
				break;
			case 0x2a: // neg
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				setreg(a, (-vb)|0);
				pc = (pc + 2)|0;
				break;
			case 0x2b: // or
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, va | vb);
				pc = (pc + 2)|0;
				break;
			case 0x2c: // not
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				setreg(a, ~vb);
				pc = (pc + 2)|0;
				break;
			case 0x2d: // ashr
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, va >> vb);
				pc = (pc + 2)|0;
				break;
			case 0x2e: // xor
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, va ^ vb);
				pc = (pc + 2)|0;
				break;
			case 0x2f: // mul
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				//setreg(a, umul(va, vb)|0);
				setreg(a, imul(va, vb)|0);
				pc = (pc + 2)|0;
				break;
			case 0x30: // swi
				swi = imm32()|0;
				if (!swi)
					return SIGILL|0;
				pc = (pc + 6)|0;
				break;
			case 0x31: // div.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, ((va|0) / (vb|0))|0);
				pc = (pc + 2)|0;
				break;
			case 0x32: // udiv.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, ((va>>>0) / (vb>>>0))|0);
				pc = (pc + 2)|0;
				break;
			case 0x33: // mod.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, ((va|0) % (vb|0))|0);
				pc = (pc + 2)|0;
				break;
			case 0x34: // umod.l
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				setreg(a, ((va>>>0) % (vb>>>0))|0);
				pc = (pc + 2)|0;
				break;
			case 0x35: // brk
				pc = (pc + 2)|0;
				return SIGTRAP|0;
			case 0x36: // ldo.b
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				imm = imm16s()|0;
				setreg(a, mem8[(vb + imm)|0]|0);
				pc = (pc + 4)|0;
				break;
			case 0x37: // sto.b
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				imm = imm16s()|0;
				write8((va + imm)|0, vb);
				pc = (pc + 4)|0;
				break;
			case 0x38: // ldo.s
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				vb = getreg(b)|0;
				imm = imm16s()|0;
				setreg(a, read16((vb + imm)|0)|0);
				pc = (pc + 4)|0;
				break;
			case 0x39: // sto.s
				a = (inst >> 4) & 0xf;
				b = inst & 0xf;
				va = getreg(a)|0; vb = getreg(b)|0;
				imm = imm16s()|0;
				write16((va + imm)|0, vb);
				pc = (pc + 4)|0;
				break;
			case 0x3a: case 0x3b:
			case 0x3c: case 0x3d: case 0x3e: case 0x3f:
			case 0x40: case 0x41: case 0x42: case 0x43:
			case 0x44: case 0x45: case 0x46: case 0x47:
			case 0x48: case 0x49: case 0x4a: case 0x4b:
			case 0x4c: case 0x4d: case 0x4e: case 0x4f:
			case 0x50: case 0x51: case 0x52: case 0x53:
			case 0x54: case 0x55: case 0x56: case 0x57:
			case 0x58: case 0x59: case 0x5a: case 0x5b:
			case 0x5c: case 0x5d: case 0x5e: case 0x5f:
			case 0x60: case 0x61: case 0x62: case 0x63:
			case 0x64: case 0x65: case 0x66: case 0x67:
			case 0x68: case 0x69: case 0x6a: case 0x6b:
			case 0x6c: case 0x6d: case 0x6e: case 0x6f:
			case 0x70: case 0x71: case 0x72: case 0x73:
			case 0x74: case 0x75: case 0x76: case 0x77:
			case 0x78: case 0x79: case 0x7a: case 0x7b:
			case 0x7c: case 0x7d: case 0x7e: case 0x7f:
				return SIGILL|0;
			case 0x80: case 0x81: case 0x82: case 0x83:
			case 0x84: case 0x85: case 0x86: case 0x87:
			case 0x88: case 0x89: case 0x8a: case 0x8b:
			case 0x8c: case 0x8d: case 0x8e: case 0x8f:
				// inc
				a = (inst >> 8) & 0xf;
				va = getreg(a)|0;
				setreg(a, (va + (inst & 0xff))|0);
				pc = (pc + 2)|0;
				break;
			case 0x90: case 0x91: case 0x92: case 0x93:
			case 0x94: case 0x95: case 0x96: case 0x97:
			case 0x98: case 0x99: case 0x9a: case 0x9b:
			case 0x9c: case 0x9d: case 0x9e: case 0x9f:
				// dec
				a = (inst >> 8) & 0xf;
				va = getreg(a)|0;
				setreg(a, (va - (inst & 0xff))|0);
				pc = (pc + 2)|0;
				break;
			case 0xa0: case 0xa1: case 0xa2: case 0xa3:
			case 0xa4: case 0xa5: case 0xa6: case 0xa7:
			case 0xa8: case 0xa9: case 0xaa: case 0xab:
			case 0xac: case 0xad: case 0xae: case 0xaf:
				// gsr
				return TODO(inst|0)|0;
			case 0xb0: case 0xb1: case 0xb2: case 0xb3:
			case 0xb4: case 0xb5: case 0xb6: case 0xb7:
			case 0xb8: case 0xb9: case 0xba: case 0xbb:
			case 0xbc: case 0xbd: case 0xbe: case 0xbf:
				// ssr
				return TODO(inst|0)|0;
			case 0xc0: case 0xc1: case 0xc2: case 0xc3: // beq
				return bcc(inst, cc & CC_EQ)|0;
			case 0xc4: case 0xc5: case 0xc6: case 0xc7: // bne
				return bcc(inst, !(cc & CC_EQ))|0;
			case 0xc8: case 0xc9: case 0xca: case 0xcb: // blt
				return bcc(inst, cc & CC_LT)|0;
			case 0xcc: case 0xcd: case 0xce: case 0xcf: // bgt
				return bcc(inst, cc & CC_GT)|0;
			case 0xd0: case 0xd1: case 0xd2: case 0xd3: // bltu
				return bcc(inst, cc & CC_LTU)|0;
			case 0xd4: case 0xd5: case 0xd6: case 0xd7: // bgtu
				return bcc(inst, cc & CC_GTU)|0;
			case 0xd8: case 0xd9: case 0xda: case 0xdb: // bge
				return bcc(inst, cc & (CC_GT | CC_EQ))|0;
			case 0xdc: case 0xdd: case 0xde: case 0xdf: // ble
				return bcc(inst, cc & (CC_LT | CC_EQ))|0;
			case 0xe0: case 0xe1: case 0xe2: case 0xe3: // bgeu
				return bcc(inst, cc & (CC_GTU | CC_EQ))|0;
			case 0xe4: case 0xe5: case 0xe6: case 0xe7: // bleu
				return bcc(inst, cc & (CC_LTU | CC_EQ))|0;
			default:
				return SIGILL|0;
			}
			return 0;
		}

		function run() {
			var i = 0;
			var exc = 0;
			for (i = 0; (i|0) < 1000000; i = (i + 1)|0) {
				exc = step()|0;
				if (exc)
					raise(exc|0);
				if (swi)
					return;
			}
		}

		function set_pc(value) {
			value = value|0;
			pc = value;
		}

		function get_pc() {
			return pc|0;
		}

		function set_sp(value) {
			value = value|0;
			sp = value;
		}

		function get_swi() {
			var value = 0;
			value = swi;
			swi = 0;
			return value|0;
		}

		function get_r0() { return r0|0; }
		function get_r1() { return r1|0; }
		function get_r2() { return r2|0; }

		function set_r0(value) {
			value = value|0;
			r0 = value;
		}

		return {
			step: step,
			run: run,
			set_pc: set_pc,
			get_pc: get_pc,
			set_sp: set_sp,
			get_swi: get_swi,
			get_r0: get_r0,
			get_r1: get_r1,
			get_r2: get_r2,
			set_r0: set_r0
		};
	}

	exports.MoxieCPU = MoxieCPU;
})(typeof exports === "undefined" ? this["moxiecpu"] = {} : exports);
