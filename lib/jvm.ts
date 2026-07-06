// A very small JVM. Parses a real .class file (as produced by javac) and
// interprets enough of the bytecode to run this site's Snake.java: one class,
// static int / int[] fields, static methods, int arithmetic and control flow.
// ~60 opcodes. No objects, no GC, no strings, deliberately. The point is
// that what runs in the browser is the genuine javac output, not a port.
//
// javap -c java/Snake.class shows exactly the instruction stream this executes.

type CpEntry =
  | { tag: 1; str: string }
  | { tag: 3; int: number }
  | { tag: 7; nameIdx: number }
  | { tag: 9 | 10; classIdx: number; natIdx: number }
  | { tag: 12; nameIdx: number; descIdx: number }
  | { tag: 0 }; // padding / unused

type MethodInfo = { name: string; desc: string; maxLocals: number; code: Uint8Array };

type Val = number | Int32Array | null;

export class MiniJVM {
  private cp: CpEntry[] = [];
  private methods = new Map<string, MethodInfo>();
  private statics = new Map<string, Val>();

  constructor(classBytes: ArrayBuffer) {
    const d = new DataView(classBytes);
    let o = 0;
    const u1 = () => d.getUint8(o++);
    const u2 = () => { const v = d.getUint16(o); o += 2; return v; };
    const u4 = () => { const v = d.getUint32(o); o += 4; return v; };

    if (u4() !== 0xcafebabe) throw new Error("not a class file");
    u2(); u2(); // minor, major

    const cpCount = u2();
    this.cp = [{ tag: 0 }];
    for (let i = 1; i < cpCount; i++) {
      const tag = u1();
      if (tag === 1) {
        const len = u2();
        const bytes = new Uint8Array(classBytes, o, len);
        o += len;
        this.cp.push({ tag: 1, str: new TextDecoder().decode(bytes) });
      } else if (tag === 3) {
        this.cp.push({ tag: 3, int: d.getInt32(o) }); o += 4;
      } else if (tag === 7) {
        this.cp.push({ tag: 7, nameIdx: u2() });
      } else if (tag === 9 || tag === 10) {
        this.cp.push({ tag: tag as 9 | 10, classIdx: u2(), natIdx: u2() });
      } else if (tag === 12) {
        this.cp.push({ tag: 12, nameIdx: u2(), descIdx: u2() });
      } else if (tag === 8 || tag === 16) { // String / MethodType: one u2
        u2(); this.cp.push({ tag: 0 });
      } else if (tag === 15) { // MethodHandle
        u1(); u2(); this.cp.push({ tag: 0 });
      } else if (tag === 4) { // Float
        u4(); this.cp.push({ tag: 0 });
      } else if (tag === 5 || tag === 6) { // Long/Double take two slots
        u4(); u4(); this.cp.push({ tag: 0 }, { tag: 0 }); i++;
      } else {
        throw new Error(`unsupported constant tag ${tag}`);
      }
    }

    u2(); u2(); u2(); // access, this, super
    const ifaces = u2(); o += ifaces * 2;

    const skipAttrs = () => {
      const n = u2();
      for (let i = 0; i < n; i++) { u2(); const len = u4(); o += len; }
    };

    const fieldCount = u2();
    for (let i = 0; i < fieldCount; i++) {
      u2(); const nameIdx = u2(); const descIdx = u2(); skipAttrs();
      const name = this.utf(nameIdx);
      const desc = this.utf(descIdx);
      this.statics.set(name, desc === "I" ? 0 : null);
    }

    const methodCount = u2();
    for (let i = 0; i < methodCount; i++) {
      u2();
      const name = this.utf(u2());
      const desc = this.utf(u2());
      const attrN = u2();
      let code: Uint8Array | null = null;
      let maxLocals = 0;
      for (let a = 0; a < attrN; a++) {
        const aName = this.utf(u2());
        const aLen = u4();
        if (aName === "Code") {
          const end = o + aLen;
          u2(); // max_stack
          maxLocals = u2();
          const codeLen = u4();
          code = new Uint8Array(classBytes, o, codeLen);
          o = end; // skip exception table + code attributes
        } else {
          o += aLen;
        }
      }
      if (code) this.methods.set(name + desc, { name, desc, maxLocals, code });
    }
    skipAttrs();

    // run the static initializer if javac emitted one
    if (this.methods.has("<clinit>()V")) this.invoke("<clinit>()V", []);
  }

  private utf(i: number): string {
    const e = this.cp[i];
    if (e.tag !== 1) throw new Error("bad utf index");
    return e.str;
  }

  private natOf(refIdx: number): { name: string; desc: string } {
    const ref = this.cp[refIdx];
    if (ref.tag !== 9 && ref.tag !== 10) throw new Error("bad ref");
    const nat = this.cp[ref.natIdx];
    if (nat.tag !== 12) throw new Error("bad nat");
    return { name: this.utf(nat.nameIdx), desc: this.utf(nat.descIdx) };
  }

  callInt(name: string, ...args: number[]): number {
    const key = `${name}(${"I".repeat(args.length)})I`;
    return this.invoke(key, args) as number;
  }
  callVoid(name: string, ...args: number[]): void {
    const key = `${name}(${"I".repeat(args.length)})V`;
    this.invoke(key, args);
  }

  private invoke(key: string, args: Val[]): Val {
    const m = this.methods.get(key);
    if (!m) throw new Error(`no method ${key}`);
    const code = m.code;
    const locals: Val[] = new Array(m.maxLocals).fill(0);
    for (let i = 0; i < args.length; i++) locals[i] = args[i];
    const stack: Val[] = [];
    let pc = 0;

    const s8 = (at: number) => (code[at] << 24) >> 24;
    const s16 = (at: number) => ((code[at] << 8) | code[at + 1]) << 16 >> 16;
    const u16 = (at: number) => (code[at] << 8) | code[at + 1];
    const pushI = (v: number) => stack.push(v | 0);
    const popI = () => (stack.pop() as number) | 0;
    const popArr = () => {
      const a = stack.pop();
      if (!(a instanceof Int32Array)) throw new Error("null/bad array");
      return a;
    };

    for (;;) {
      const op = code[pc];
      switch (op) {
        case 0x00: pc++; break; // nop
        case 0x02: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07: case 0x08:
          pushI(op - 0x03); pc++; break; // iconst_m1..5
        case 0x10: pushI(s8(pc + 1)); pc += 2; break; // bipush
        case 0x11: pushI(s16(pc + 1)); pc += 3; break; // sipush
        case 0x12: { // ldc (Integer only in our subset)
          const e = this.cp[code[pc + 1]];
          if (e.tag !== 3) throw new Error("ldc: only int constants supported");
          pushI(e.int); pc += 2; break;
        }
        case 0x13: { // ldc_w
          const e = this.cp[u16(pc + 1)];
          if (e.tag !== 3) throw new Error("ldc_w: only int constants supported");
          pushI(e.int); pc += 3; break;
        }
        case 0x15: stack.push(locals[code[pc + 1]]); pc += 2; break; // iload
        case 0x1a: case 0x1b: case 0x1c: case 0x1d:
          stack.push(locals[op - 0x1a]); pc++; break; // iload_0..3
        case 0x19: stack.push(locals[code[pc + 1]]); pc += 2; break; // aload
        case 0x2a: case 0x2b: case 0x2c: case 0x2d:
          stack.push(locals[op - 0x2a]); pc++; break; // aload_0..3
        case 0x36: locals[code[pc + 1]] = popI(); pc += 2; break; // istore
        case 0x3b: case 0x3c: case 0x3d: case 0x3e:
          locals[op - 0x3b] = popI(); pc++; break; // istore_0..3
        case 0x3a: locals[code[pc + 1]] = stack.pop() as Val; pc += 2; break; // astore
        case 0x4b: case 0x4c: case 0x4d: case 0x4e:
          locals[op - 0x4b] = stack.pop() as Val; pc++; break; // astore_0..3
        case 0x2e: { const i = popI(); const a = popArr(); pushI(a[i]); pc++; break; } // iaload
        case 0x4f: { const v = popI(); const i = popI(); const a = popArr(); a[i] = v; pc++; break; } // iastore
        case 0x57: stack.pop(); pc++; break; // pop
        case 0x59: stack.push(stack[stack.length - 1]); pc++; break; // dup
        case 0x60: { const b = popI(); pushI(popI() + b); pc++; break; } // iadd
        case 0x64: { const b = popI(); pushI(popI() - b); pc++; break; } // isub
        case 0x68: { const b = popI(); pushI(Math.imul(popI(), b)); pc++; break; } // imul
        case 0x6c: { const b = popI(); const a = popI(); if (b === 0) throw new Error("div0"); pushI((a / b) | 0); pc++; break; } // idiv
        case 0x70: { const b = popI(); const a = popI(); if (b === 0) throw new Error("div0"); pushI(a % b); pc++; break; } // irem
        case 0x74: pushI(-popI()); pc++; break; // ineg
        case 0x78: { const b = popI() & 31; pushI(popI() << b); pc++; break; } // ishl
        case 0x7a: { const b = popI() & 31; pushI(popI() >> b); pc++; break; } // ishr
        case 0x7c: { const b = popI() & 31; pushI(popI() >>> b); pc++; break; } // iushr
        case 0x7e: { const b = popI(); pushI(popI() & b); pc++; break; } // iand
        case 0x80: { const b = popI(); pushI(popI() | b); pc++; break; } // ior
        case 0x82: { const b = popI(); pushI(popI() ^ b); pc++; break; } // ixor
        case 0x84: { // iinc
          const idx = code[pc + 1];
          locals[idx] = (((locals[idx] as number) | 0) + s8(pc + 2)) | 0;
          pc += 3; break;
        }
        case 0x99: pc = popI() === 0 ? pc + s16(pc + 1) : pc + 3; break; // ifeq
        case 0x9a: pc = popI() !== 0 ? pc + s16(pc + 1) : pc + 3; break; // ifne
        case 0x9b: pc = popI() < 0 ? pc + s16(pc + 1) : pc + 3; break;  // iflt
        case 0x9c: pc = popI() >= 0 ? pc + s16(pc + 1) : pc + 3; break; // ifge
        case 0x9d: pc = popI() > 0 ? pc + s16(pc + 1) : pc + 3; break;  // ifgt
        case 0x9e: pc = popI() <= 0 ? pc + s16(pc + 1) : pc + 3; break; // ifle
        case 0x9f: case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4: { // if_icmpXX
          const b = popI(); const a = popI();
          const jump =
            op === 0x9f ? a === b : op === 0xa0 ? a !== b :
            op === 0xa1 ? a < b : op === 0xa2 ? a >= b :
            op === 0xa3 ? a > b : a <= b;
          pc = jump ? pc + s16(pc + 1) : pc + 3;
          break;
        }
        case 0xa7: pc += s16(pc + 1); break; // goto
        case 0xac: return popI();  // ireturn
        case 0xb1: return null;    // return (void)
        case 0xb2: { // getstatic
          const { name } = this.natOf(u16(pc + 1));
          stack.push(this.statics.get(name) ?? 0);
          pc += 3; break;
        }
        case 0xb3: { // putstatic
          const { name } = this.natOf(u16(pc + 1));
          this.statics.set(name, stack.pop() as Val);
          pc += 3; break;
        }
        case 0xb8: { // invokestatic (same class)
          const { name, desc } = this.natOf(u16(pc + 1));
          const params = desc.slice(1, desc.indexOf(")"));
          let count = 0;
          for (let i = 0; i < params.length; i++) {
            if (params[i] === "I") count++;
            else if (params[i] === "[") { count++; i++; }
            else throw new Error(`unsupported param type in ${desc}`);
          }
          const callArgs: Val[] = new Array(count);
          for (let i = count - 1; i >= 0; i--) callArgs[i] = stack.pop() as Val;
          const ret = this.invoke(name + desc, callArgs);
          if (!desc.endsWith("V")) stack.push(ret);
          pc += 3; break;
        }
        case 0xbc: { // newarray (int only)
          if (code[pc + 1] !== 10) throw new Error("newarray: int[] only");
          const len = popI();
          stack.push(new Int32Array(len));
          pc += 2; break;
        }
        case 0xbe: pushI(popArr().length); pc++; break; // arraylength
        default:
          throw new Error(`unimplemented opcode 0x${op.toString(16)} at pc=${pc} in ${key}`);
      }
    }
  }
}
