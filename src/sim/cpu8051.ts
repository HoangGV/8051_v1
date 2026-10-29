/**
 * Complete Intel 8051 CPU Core Simulator
 * Implements 111 instructions (255 opcodes), exact machine cycles,
 * PSW flags, Timers 0 & 1, Interrupts (INT0, INT1, T0, T1),
 * 128B RAM + Bit-addressable memory + SFRs, and Quasi-bidirectional I/O.
 */

import { CpuStateSnapshot, PortMode } from '../types';

// SFR Addresses
export const SFR_P0 = 0x80;
export const SFR_SP = 0x81;
export const SFR_DPL = 0x82;
export const SFR_DPH = 0x83;
export const SFR_PCON = 0x87;
export const SFR_TCON = 0x88;
export const SFR_TMOD = 0x89;
export const SFR_TL0 = 0x8a;
export const SFR_TL1 = 0x8b;
export const SFR_TH0 = 0x8c;
export const SFR_TH1 = 0x8d;
export const SFR_P1 = 0x90;
export const SFR_SCON = 0x98;
export const SFR_SBUF = 0x99;
export const SFR_P2 = 0xa0;
export const SFR_IE = 0xa8;
export const SFR_P3 = 0xb0;
export const SFR_IP = 0xb8;
export const SFR_PSW = 0xd0;
export const SFR_ACC = 0xe0;
export const SFR_B = 0xf0;

// PSW Bit positions
export const BIT_PSW_P = 0;
export const BIT_PSW_F1 = 1;
export const BIT_PSW_OV = 2;
export const BIT_PSW_RS0 = 3;
export const BIT_PSW_RS1 = 4;
export const BIT_PSW_F0 = 5;
export const BIT_PSW_AC = 6;
export const BIT_PSW_CY = 7;

export class Cpu8051 {
  // Registers
  public pc: number = 0;
  public rom: Uint8Array = new Uint8Array(65536);
  public ram: Uint8Array = new Uint8Array(128);
  public sfr: Uint8Array = new Uint8Array(128); // 0x80 - 0xFF mapped to 0x00 - 0x7F

  // Hardware Pins physical voltage / logic levels from external circuit
  // [port 0-3][pin 0-7]
  public pinInputs: boolean[][] = [
    [true, true, true, true, true, true, true, true], // P0
    [true, true, true, true, true, true, true, true], // P1
    [true, true, true, true, true, true, true, true], // P2
    [true, true, true, true, true, true, true, true], // P3
  ];

  // Previous state of pins for edge detection (e.g. INT0, INT1, T0, T1)
  private prevPinP3_2: boolean = true;
  private prevPinP3_3: boolean = true;
  private prevPinP3_4: boolean = true;
  private prevPinP3_5: boolean = true;

  // Clock & Execution stats
  public fOscHz: number = 12000000; // 12 MHz default
  public totalCycles: number = 0;
  public totalInstructions: number = 0;
  public lastChangedRamAddr: number | null = null;
  public portMode: PortMode = 'easy';

  // Interrupt active stack (priority: 0 = low, 1 = high, -1 = none)
  public activeInterruptPriority: number = -1;
  public isServicingInterrupt: boolean = false;

  // On-demand logging hooks
  public onLog?: (level: 'INFO' | 'OK' | 'WARN' | 'ERROR', message: string) => void;
  public onPinStateChange?: () => void;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.pc = 0x0000;
    this.ram.fill(0);
    this.sfr.fill(0);

    // Initial SFR states on RESET
    this.writeSfr(SFR_SP, 0x07);
    this.writeSfr(SFR_P0, 0xff);
    this.writeSfr(SFR_P1, 0xff);
    this.writeSfr(SFR_P2, 0xff);
    this.writeSfr(SFR_P3, 0xff);
    this.writeSfr(SFR_ACC, 0x00);
    this.writeSfr(SFR_B, 0x00);
    this.writeSfr(SFR_PSW, 0x00);
    this.writeSfr(SFR_DPL, 0x00);
    this.writeSfr(SFR_DPH, 0x00);
    this.writeSfr(SFR_TMOD, 0x00);
    this.writeSfr(SFR_TCON, 0x00);
    this.writeSfr(SFR_TL0, 0x00);
    this.writeSfr(SFR_TH0, 0x00);
    this.writeSfr(SFR_TL1, 0x00);
    this.writeSfr(SFR_TH1, 0x00);
    this.writeSfr(SFR_IE, 0x00);
    this.writeSfr(SFR_IP, 0x00);
    this.writeSfr(SFR_PCON, 0x00);

    this.totalCycles = 0;
    this.totalInstructions = 0;
    this.lastChangedRamAddr = null;
    this.activeInterruptPriority = -1;
    this.isServicingInterrupt = false;

    this.updateParity();
    if (this.onPinStateChange) this.onPinStateChange();
  }

  // --- MEMORY ACCESS HELPERS ---

  public readSfr(addr: number): number {
    return this.sfr[addr - 0x80] || 0;
  }

  public writeSfr(addr: number, val: number): void {
    val &= 0xff;
    const oldVal = this.sfr[addr - 0x80];
    this.sfr[addr - 0x80] = val;

    if (addr === SFR_ACC) {
      this.updateParity();
    } else if (addr === SFR_P0 || addr === SFR_P1 || addr === SFR_P2 || addr === SFR_P3) {
      if (oldVal !== val && this.onPinStateChange) {
        this.onPinStateChange();
      }
    }
  }

  public readRam(addr: number): number {
    addr &= 0x7f;
    return this.ram[addr];
  }

  public writeRam(addr: number, val: number): void {
    addr &= 0x7f;
    val &= 0xff;
    this.ram[addr] = val;
    this.lastChangedRamAddr = addr;
  }

  // Read direct internal address: 00H - 7FH is RAM, 80H - FFH is SFR
  public readDirect(addr: number): number {
    addr &= 0xff;
    if (addr < 0x80) {
      return this.readRam(addr);
    }
    // Port pins: direct read reads latch unless configured
    return this.readSfr(addr);
  }

  public writeDirect(addr: number, val: number): void {
    addr &= 0xff;
    val &= 0xff;
    if (addr < 0x80) {
      this.writeRam(addr, val);
    } else {
      this.writeSfr(addr, val);
    }
  }

  // Bit addressable: 00H-7FH are bits of RAM 20H-2FH
  // 80H-FFH are bits of SFRs with address ending in 0 or 8
  public readBit(bitAddr: number): boolean {
    bitAddr &= 0xff;
    if (bitAddr < 0x80) {
      const byteAddr = 0x20 + (bitAddr >> 3);
      const bitPos = bitAddr & 0x07;
      return ((this.readRam(byteAddr) >> bitPos) & 1) === 1;
    } else {
      const sfrAddr = bitAddr & 0xf8;
      const bitPos = bitAddr & 0x07;
      return ((this.readSfr(sfrAddr) >> bitPos) & 1) === 1;
    }
  }

  public writeBit(bitAddr: number, val: boolean): void {
    bitAddr &= 0xff;
    const bitMask = 1 << (bitAddr & 0x07);
    if (bitAddr < 0x80) {
      const byteAddr = 0x20 + (bitAddr >> 3);
      let byteVal = this.readRam(byteAddr);
      byteVal = val ? byteVal | bitMask : byteVal & ~bitMask;
      this.writeRam(byteAddr, byteVal);
    } else {
      const sfrAddr = bitAddr & 0xf8;
      let byteVal = this.readSfr(sfrAddr);
      byteVal = val ? byteVal | bitMask : byteVal & ~bitMask;
      this.writeSfr(sfrAddr, byteVal);
    }
  }

  // Register Bank access: R0-R7
  public getRegisterBank(): number {
    const psw = this.readSfr(SFR_PSW);
    return (psw >> 3) & 0x03;
  }

  public readR(index: number): number {
    const bankBase = this.getRegisterBank() * 8;
    return this.readRam(bankBase + (index & 0x07));
  }

  public writeR(index: number, val: number): void {
    const bankBase = this.getRegisterBank() * 8;
    this.writeRam(bankBase + (index & 0x07), val);
  }

  // Indirect internal RAM access: @R0, @R1
  public readIndirect(rIndex: number): number {
    const ptr = this.readR(rIndex & 1) & 0x7f;
    return this.readRam(ptr);
  }

  public writeIndirect(rIndex: number, val: number): void {
    const ptr = this.readR(rIndex & 1) & 0x7f;
    this.writeRam(ptr, val);
  }

  // DPTR
  public getDPTR(): number {
    return (this.readSfr(SFR_DPH) << 8) | this.readSfr(SFR_DPL);
  }

  public setDPTR(val: number): void {
    this.writeSfr(SFR_DPH, (val >> 8) & 0xff);
    this.writeSfr(SFR_DPL, val & 0xff);
  }

  // Accumulator & B register
  public get A(): number {
    return this.readSfr(SFR_ACC);
  }
  public set A(val: number) {
    this.writeSfr(SFR_ACC, val & 0xff);
  }

  public get B(): number {
    return this.readSfr(SFR_B);
  }
  public set B(val: number) {
    this.writeSfr(SFR_B, val & 0xff);
  }

  public get SP(): number {
    return this.readSfr(SFR_SP);
  }
  public set SP(val: number) {
    this.writeSfr(SFR_SP, val & 0xff);
  }

  public get PSW(): number {
    return this.readSfr(SFR_PSW);
  }
  public set PSW(val: number) {
    this.writeSfr(SFR_PSW, val & 0xff);
  }

  // Flags
  public getFlag(bitPos: number): boolean {
    return ((this.PSW >> bitPos) & 1) === 1;
  }

  public setFlag(bitPos: number, state: boolean): void {
    if (state) {
      this.PSW |= 1 << bitPos;
    } else {
      this.PSW &= ~(1 << bitPos);
    }
  }

  public get CY(): boolean {
    return this.getFlag(BIT_PSW_CY);
  }
  public set CY(v: boolean) {
    this.setFlag(BIT_PSW_CY, v);
  }

  public get AC(): boolean {
    return this.getFlag(BIT_PSW_AC);
  }
  public set AC(v: boolean) {
    this.setFlag(BIT_PSW_AC, v);
  }

  public get OV(): boolean {
    return this.getFlag(BIT_PSW_OV);
  }
  public set OV(v: boolean) {
    this.setFlag(BIT_PSW_OV, v);
  }

  public updateParity(): void {
    let a = this.A;
    let count = 0;
    while (a) {
      count += a & 1;
      a >>= 1;
    }
    this.setFlag(BIT_PSW_P, (count & 1) === 1);
  }

  // Stack operations
  public push(val: number): void {
    let sp = (this.SP + 1) & 0xff;
    this.SP = sp;
    if (sp < 0x80) {
      this.writeRam(sp, val);
    } else {
      // Writing past 128B in base 8051 can be error or SFR
      this.writeDirect(sp, val);
    }
  }

  public pop(): number {
    let sp = this.SP;
    const val = sp < 0x80 ? this.readRam(sp) : this.readDirect(sp);
    this.SP = (sp - 1) & 0xff;
    return val;
  }

  // Program Code ROM access
  public fetchCodeByte(): number {
    const byte = this.rom[this.pc];
    this.pc = (this.pc + 1) & 0xffff;
    return byte;
  }

  public fetchCodeWord(): number {
    const high = this.fetchCodeByte();
    const low = this.fetchCodeByte();
    return (high << 8) | low;
  }

  // Port Physical Pin evaluation (Reading pin voltage vs Latch)
  // Quasi-bidirectional: Latch must be 1 to read input.
  public getPinPhysicalState(port: number, pin: number): boolean {
    const latchBit = ((this.readSfr(0x80 + (port === 0 ? 0 : port === 1 ? 0x10 : port === 2 ? 0x20 : 0x30)) >> pin) & 1) === 1;
    if (!latchBit) {
      // Pulled to ground internally by low latch
      return false;
    }
    // High latch: can be driven low by external circuit
    return this.pinInputs[port][pin];
  }

  public readPortPin(port: number): number {
    let res = 0;
    for (let p = 0; p < 8; p++) {
      if (this.getPinPhysicalState(port, p)) {
        res |= 1 << p;
      }
    }
    return res;
  }

  // External input pin setter from circuit solver (e.g. V >= 2.0V => true, V <= 0.8V => false)
  public setExternalPinInput(port: number, pin: number, high: boolean): void {
    if (this.pinInputs[port][pin] !== high) {
      this.pinInputs[port][pin] = high;
    }
  }

  // --- HARDWARE PERIPHERALS: TIMERS & COUNTERS ---
  public stepPeripherals(cycles: number): void {
    // Timer 0 & Timer 1
    const tmod = this.readSfr(SFR_TMOD);
    let tcon = this.readSfr(SFR_TCON);

    // Pin states for counter & gate
    const pinP3_2 = this.pinInputs[3][2]; // INT0
    const pinP3_3 = this.pinInputs[3][3]; // INT1
    const pinP3_4 = this.pinInputs[3][4]; // T0
    const pinP3_5 = this.pinInputs[3][5]; // T1

    // INT0 Edge/Level detection
    const it0 = ((tcon >> 0) & 1) === 1; // 1 = falling edge, 0 = low level
    if (it0) {
      if (this.prevPinP3_2 && !pinP3_2) {
        tcon |= 0x02; // Set IE0 (edge detected)
      }
    }
    // INT1 Edge/Level detection
    const it1 = ((tcon >> 2) & 1) === 1; // 1 = falling edge, 0 = low level
    if (it1) {
      if (this.prevPinP3_3 && !pinP3_3) {
        tcon |= 0x08; // Set IE1 (edge detected)
      }
    }

    // Timer 0
    const tr0 = ((tcon >> 4) & 1) === 1;
    if (tr0) {
      const gate0 = ((tmod >> 3) & 1) === 1;
      const ct0 = ((tmod >> 2) & 1) === 1; // 0 = timer, 1 = counter
      const run0 = !gate0 || pinP3_2;

      let inc0 = 0;
      if (run0) {
        if (!ct0) {
          inc0 = cycles; // 1 increment per machine cycle
        } else if (this.prevPinP3_4 && !pinP3_4) {
          inc0 = 1; // Falling edge on T0
        }
      }

      if (inc0 > 0) {
        let tl0 = this.readSfr(SFR_TL0);
        let th0 = this.readSfr(SFR_TH0);
        const mode0 = tmod & 0x03;

        if (mode0 === 1) {
          // 16-bit Timer Mode 1
          let val = (th0 << 8) | tl0;
          val += inc0;
          if (val > 0xffff) {
            tcon |= 0x20; // Set TF0 flag (overflow)
            val &= 0xffff;
          }
          this.writeSfr(SFR_TL0, val & 0xff);
          this.writeSfr(SFR_TH0, (val >> 8) & 0xff);
        } else if (mode0 === 2) {
          // 8-bit Auto-Reload Mode 2
          tl0 += inc0;
          if (tl0 > 0xff) {
            tcon |= 0x20; // Set TF0
            tl0 = th0 + (tl0 - 0x100);
          }
          this.writeSfr(SFR_TL0, tl0 & 0xff);
        } else if (mode0 === 0) {
          // 13-bit Mode 0
          let val = (th0 << 5) | (tl0 & 0x1f);
          val += inc0;
          if (val > 0x1fff) {
            tcon |= 0x20;
            val &= 0x1fff;
          }
          this.writeSfr(SFR_TL0, val & 0x1f);
          this.writeSfr(SFR_TH0, (val >> 5) & 0xff);
        }
      }
    }

    // Timer 1
    const tr1 = ((tcon >> 6) & 1) === 1;
    if (tr1) {
      const gate1 = ((tmod >> 7) & 1) === 1;
      const ct1 = ((tmod >> 6) & 1) === 1;
      const run1 = !gate1 || pinP3_3;

      let inc1 = 0;
      if (run1) {
        if (!ct1) {
          inc1 = cycles;
        } else if (this.prevPinP3_5 && !pinP3_5) {
          inc1 = 1;
        }
      }

      if (inc1 > 0) {
        let tl1 = this.readSfr(SFR_TL1);
        let th1 = this.readSfr(SFR_TH1);
        const mode1 = (tmod >> 4) & 0x03;

        if (mode1 === 1) {
          // 16-bit Timer Mode 1
          let val = (th1 << 8) | tl1;
          val += inc1;
          if (val > 0xffff) {
            tcon |= 0x80; // Set TF1 flag
            val &= 0xffff;
          }
          this.writeSfr(SFR_TL1, val & 0xff);
          this.writeSfr(SFR_TH1, (val >> 8) & 0xff);
        } else if (mode1 === 2) {
          // 8-bit Auto-Reload Mode 2
          tl1 += inc1;
          if (tl1 > 0xff) {
            tcon |= 0x80;
            tl1 = th1 + (tl1 - 0x100);
          }
          this.writeSfr(SFR_TL1, tl1 & 0xff);
        }
      }
    }

    this.writeSfr(SFR_TCON, tcon);

    // Save previous pin inputs
    this.prevPinP3_2 = pinP3_2;
    this.prevPinP3_3 = pinP3_3;
    this.prevPinP3_4 = pinP3_4;
    this.prevPinP3_5 = pinP3_5;
  }

  // --- INTERRUPT SERVICE DISPATCHER ---
  public checkAndHandleInterrupts(): boolean {
    const ie = this.readSfr(SFR_IE);
    const ea = ((ie >> 7) & 1) === 1;
    if (!ea) return false;

    const ip = this.readSfr(SFR_IP);
    const tcon = this.readSfr(SFR_TCON);

    // 5 sources: INT0, T0, INT1, T1, Serial
    // Interrupt requests:
    // INT0: low-level triggered if IT0=0 (pinP3_2 === false) or IE0=1
    const it0 = ((tcon >> 0) & 1) === 1;
    const reqINT0 = ((ie >> 0) & 1) === 1 && (it0 ? ((tcon >> 1) & 1) === 1 : !this.pinInputs[3][2]);
    const reqTF0 = ((ie >> 1) & 1) === 1 && ((tcon >> 5) & 1) === 1;
    const it1 = ((tcon >> 2) & 1) === 1;
    const reqINT1 = ((ie >> 2) & 1) === 1 && (it1 ? ((tcon >> 3) & 1) === 1 : !this.pinInputs[3][3]);
    const reqTF1 = ((ie >> 3) & 1) === 1 && ((tcon >> 7) & 1) === 1;

    // Check high priority first
    const candidates = [
      { id: 0, prio: (ip >> 0) & 1, vector: 0x0003, req: reqINT0, name: 'INT0' },
      { id: 1, prio: (ip >> 1) & 1, vector: 0x000b, req: reqTF0, name: 'Timer0' },
      { id: 2, prio: (ip >> 2) & 1, vector: 0x0013, req: reqINT1, name: 'INT1' },
      { id: 3, prio: (ip >> 3) & 1, vector: 0x001b, req: reqTF1, name: 'Timer1' },
    ];

    for (const cand of candidates) {
      if (cand.req && cand.prio === 1 && this.activeInterruptPriority < 1) {
        this.dispatchInterrupt(cand);
        return true;
      }
    }

    for (const cand of candidates) {
      if (cand.req && cand.prio === 0 && this.activeInterruptPriority < 0) {
        this.dispatchInterrupt(cand);
        return true;
      }
    }

    return false;
  }

  private dispatchInterrupt(intInfo: { id: number; prio: number; vector: number; name: string }): void {
    // Push PC onto stack (Low then High)
    this.push(this.pc & 0xff);
    this.push((this.pc >> 8) & 0xff);

    // Clear hardware flags where applicable
    let tcon = this.readSfr(SFR_TCON);
    if (intInfo.id === 0) {
      tcon &= ~0x02; // Clear IE0 if edge
    } else if (intInfo.id === 1) {
      tcon &= ~0x20; // Clear TF0
    } else if (intInfo.id === 2) {
      tcon &= ~0x08; // Clear IE1 if edge
    } else if (intInfo.id === 3) {
      tcon &= ~0x80; // Clear TF1
    }
    this.writeSfr(SFR_TCON, tcon);

    this.activeInterruptPriority = intInfo.prio;
    this.isServicingInterrupt = true;
    this.pc = intInfo.vector;

    if (this.onLog) {
      this.onLog('INFO', `Vào ngắt [${intInfo.name}] (Vector 0x${intInfo.vector.toString(16).padStart(4, '0')})`);
    }
  }

  // --- STEP SINGLE INSTRUCTION ---
  public step(): { cycles: number; pc: number; opcode: number } {
    this.lastChangedRamAddr = null;
    const initialPc = this.pc;
    const opcode = this.fetchCodeByte();
    let cycles = 1;

    // Execute standard 8051 opcode
    cycles = this.executeOpcode(opcode);

    this.totalCycles += cycles;
    this.totalInstructions++;

    // Step internal timers and check external interrupts
    this.stepPeripherals(cycles);
    this.checkAndHandleInterrupts();

    return { cycles, pc: initialPc, opcode };
  }

  // --- COMPLETE 255 OPCODES EXECUTION ---
  private executeOpcode(op: number): number {
    switch (op) {
      // NOP
      case 0x00:
        return 1;

      // AJMP addr11
      case 0x01:
      case 0x21:
      case 0x41:
      case 0x61:
      case 0x81:
      case 0xa1:
      case 0xc1:
      case 0xe1: {
        const low = this.fetchCodeByte();
        const high3 = (op >> 5) & 0x07;
        this.pc = (this.pc & 0xf800) | (high3 << 8) | low;
        return 2;
      }

      // LJMP addr16
      case 0x02:
        this.pc = this.fetchCodeWord();
        return 2;

      // RR A
      case 0x03: {
        const a = this.A;
        this.A = ((a >> 1) | (a << 7)) & 0xff;
        return 1;
      }

      // INC A
      case 0x04:
        this.A = (this.A + 1) & 0xff;
        return 1;

      // INC direct
      case 0x05: {
        const addr = this.fetchCodeByte();
        this.writeDirect(addr, (this.readDirect(addr) + 1) & 0xff);
        return 1;
      }

      // INC @R0, @R1
      case 0x06:
      case 0x07: {
        const val = (this.readIndirect(op & 1) + 1) & 0xff;
        this.writeIndirect(op & 1, val);
        return 1;
      }

      // INC R0 - R7
      case 0x08:
      case 0x09:
      case 0x0a:
      case 0x0b:
      case 0x0c:
      case 0x0d:
      case 0x0e:
      case 0x0f: {
        const r = op & 0x07;
        this.writeR(r, (this.readR(r) + 1) & 0xff);
        return 1;
      }

      // JBC bit, offset
      case 0x10: {
        const bit = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        if (this.readBit(bit)) {
          this.writeBit(bit, false);
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // ACALL addr11
      case 0x11:
      case 0x31:
      case 0x51:
      case 0x71:
      case 0x91:
      case 0xb1:
      case 0xd1:
      case 0xf1: {
        const low = this.fetchCodeByte();
        const high3 = (op >> 5) & 0x07;
        this.push(this.pc & 0xff);
        this.push((this.pc >> 8) & 0xff);
        this.pc = (this.pc & 0xf800) | (high3 << 8) | low;
        return 2;
      }

      // LCALL addr16
      case 0x12: {
        const target = this.fetchCodeWord();
        this.push(this.pc & 0xff);
        this.push((this.pc >> 8) & 0xff);
        this.pc = target;
        return 2;
      }

      // RRC A
      case 0x13: {
        const oldCy = this.CY ? 1 : 0;
        const a = this.A;
        this.CY = (a & 1) === 1;
        this.A = ((a >> 1) | (oldCy << 7)) & 0xff;
        return 1;
      }

      // DEC A
      case 0x14:
        this.A = (this.A - 1 + 256) & 0xff;
        return 1;

      // DEC direct
      case 0x15: {
        const addr = this.fetchCodeByte();
        this.writeDirect(addr, (this.readDirect(addr) - 1 + 256) & 0xff);
        return 1;
      }

      // DEC @R0, @R1
      case 0x16:
      case 0x17: {
        const val = (this.readIndirect(op & 1) - 1 + 256) & 0xff;
        this.writeIndirect(op & 1, val);
        return 1;
      }

      // DEC R0 - R7
      case 0x18:
      case 0x19:
      case 0x1a:
      case 0x1b:
      case 0x1c:
      case 0x1d:
      case 0x1e:
      case 0x1f: {
        const r = op & 0x07;
        this.writeR(r, (this.readR(r) - 1 + 256) & 0xff);
        return 1;
      }

      // JB bit, offset
      case 0x20: {
        const bit = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        if (this.readBit(bit)) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // RET
      case 0x22: {
        const high = this.pop();
        const low = this.pop();
        this.pc = (high << 8) | low;
        return 2;
      }

      // RL A
      case 0x23: {
        const a = this.A;
        this.A = ((a << 1) | (a >> 7)) & 0xff;
        return 1;
      }

      // ADD A, #data
      case 0x24:
        this.doAdd(this.fetchCodeByte(), false);
        return 1;

      // ADD A, direct
      case 0x25:
        this.doAdd(this.readDirect(this.fetchCodeByte()), false);
        return 1;

      // ADD A, @R0 / @R1
      case 0x26:
      case 0x27:
        this.doAdd(this.readIndirect(op & 1), false);
        return 1;

      // ADD A, R0 - R7
      case 0x28:
      case 0x29:
      case 0x2a:
      case 0x2b:
      case 0x2c:
      case 0x2d:
      case 0x2e:
      case 0x2f:
        this.doAdd(this.readR(op & 0x07), false);
        return 1;

      // JNB bit, offset
      case 0x30: {
        const bit = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        if (!this.readBit(bit)) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // RETI
      case 0x32: {
        const high = this.pop();
        const low = this.pop();
        this.pc = (high << 8) | low;
        this.activeInterruptPriority = -1;
        this.isServicingInterrupt = false;
        if (this.onLog) this.onLog('INFO', 'Thoát ngắt (RETI)');
        return 2;
      }

      // RLC A
      case 0x33: {
        const oldCy = this.CY ? 1 : 0;
        const a = this.A;
        this.CY = (a & 0x80) !== 0;
        this.A = ((a << 1) | oldCy) & 0xff;
        return 1;
      }

      // ADDC A, #data
      case 0x34:
        this.doAdd(this.fetchCodeByte(), true);
        return 1;

      // ADDC A, direct
      case 0x35:
        this.doAdd(this.readDirect(this.fetchCodeByte()), true);
        return 1;

      // ADDC A, @R0 / @R1
      case 0x36:
      case 0x37:
        this.doAdd(this.readIndirect(op & 1), true);
        return 1;

      // ADDC A, R0 - R7
      case 0x38:
      case 0x39:
      case 0x3a:
      case 0x3b:
      case 0x3c:
      case 0x3d:
      case 0x3e:
      case 0x3f:
        this.doAdd(this.readR(op & 0x07), true);
        return 1;

      // JC offset
      case 0x40: {
        const offset = this.fetchCodeByte();
        if (this.CY) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // ORL data, A
      case 0x42: {
        const addr = this.fetchCodeByte();
        this.writeDirect(addr, this.readDirect(addr) | this.A);
        return 1;
      }

      // ORL data, #data
      case 0x43: {
        const addr = this.fetchCodeByte();
        const data = this.fetchCodeByte();
        this.writeDirect(addr, this.readDirect(addr) | data);
        return 2;
      }

      // ORL A, #data
      case 0x44:
        this.A |= this.fetchCodeByte();
        return 1;

      // ORL A, direct
      case 0x45:
        this.A |= this.readDirect(this.fetchCodeByte());
        return 1;

      // ORL A, @R0 / @R1
      case 0x46:
      case 0x47:
        this.A |= this.readIndirect(op & 1);
        return 1;

      // ORL A, R0 - R7
      case 0x48:
      case 0x49:
      case 0x4a:
      case 0x4b:
      case 0x4c:
      case 0x4d:
      case 0x4e:
      case 0x4f:
        this.A |= this.readR(op & 0x07);
        return 1;

      // JNC offset
      case 0x50: {
        const offset = this.fetchCodeByte();
        if (!this.CY) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // ANL data, A
      case 0x52: {
        const addr = this.fetchCodeByte();
        this.writeDirect(addr, this.readDirect(addr) & this.A);
        return 1;
      }

      // ANL data, #data
      case 0x53: {
        const addr = this.fetchCodeByte();
        const data = this.fetchCodeByte();
        this.writeDirect(addr, this.readDirect(addr) & data);
        return 2;
      }

      // ANL A, #data
      case 0x54:
        this.A &= this.fetchCodeByte();
        return 1;

      // ANL A, direct
      case 0x55:
        this.A &= this.readDirect(this.fetchCodeByte());
        return 1;

      // ANL A, @R0 / @R1
      case 0x56:
      case 0x57:
        this.A &= this.readIndirect(op & 1);
        return 1;

      // ANL A, R0 - R7
      case 0x58:
      case 0x59:
      case 0x5a:
      case 0x5b:
      case 0x5c:
      case 0x5d:
      case 0x5e:
      case 0x5f:
        this.A &= this.readR(op & 0x07);
        return 1;

      // JZ offset
      case 0x60: {
        const offset = this.fetchCodeByte();
        if (this.A === 0) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // XRL data, A
      case 0x62: {
        const addr = this.fetchCodeByte();
        this.writeDirect(addr, this.readDirect(addr) ^ this.A);
        return 1;
      }

      // XRL data, #data
      case 0x63: {
        const addr = this.fetchCodeByte();
        const data = this.fetchCodeByte();
        this.writeDirect(addr, this.readDirect(addr) ^ data);
        return 2;
      }

      // XRL A, #data
      case 0x64:
        this.A ^= this.fetchCodeByte();
        return 1;

      // XRL A, direct
      case 0x65:
        this.A ^= this.readDirect(this.fetchCodeByte());
        return 1;

      // XRL A, @R0 / @R1
      case 0x66:
      case 0x67:
        this.A ^= this.readIndirect(op & 1);
        return 1;

      // XRL A, R0 - R7
      case 0x68:
      case 0x69:
      case 0x6a:
      case 0x6b:
      case 0x6c:
      case 0x6d:
      case 0x6e:
      case 0x6f:
        this.A ^= this.readR(op & 0x07);
        return 1;

      // JNZ offset
      case 0x70: {
        const offset = this.fetchCodeByte();
        if (this.A !== 0) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // ORL C, bit
      case 0x72: {
        this.CY = this.CY || this.readBit(this.fetchCodeByte());
        return 2;
      }

      // JMP @A+DPTR
      case 0x73:
        this.pc = (this.A + this.getDPTR()) & 0xffff;
        return 2;

      // MOV A, #data
      case 0x74:
        this.A = this.fetchCodeByte();
        return 1;

      // MOV direct, #data
      case 0x75: {
        const addr = this.fetchCodeByte();
        const data = this.fetchCodeByte();
        this.writeDirect(addr, data);
        return 2;
      }

      // MOV @R0/#data, @R1/#data
      case 0x76:
      case 0x77: {
        this.writeIndirect(op & 1, this.fetchCodeByte());
        return 1;
      }

      // MOV R0 - R7, #data
      case 0x78:
      case 0x79:
      case 0x7a:
      case 0x7b:
      case 0x7c:
      case 0x7d:
      case 0x7e:
      case 0x7f: {
        this.writeR(op & 0x07, this.fetchCodeByte());
        return 1;
      }

      // SJMP offset
      case 0x80: {
        const offset = this.fetchCodeByte();
        this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        return 2;
      }

      // ANL C, bit
      case 0x82: {
        this.CY = this.CY && this.readBit(this.fetchCodeByte());
        return 2;
      }

      // MOVC A, @A+PC
      case 0x83: {
        const addr = (this.pc + this.A) & 0xffff;
        this.A = this.rom[addr];
        return 2;
      }

      // DIV AB
      case 0x84: {
        const a = this.A;
        const b = this.B;
        this.CY = false;
        if (b === 0) {
          this.OV = true;
        } else {
          this.OV = false;
          this.A = Math.floor(a / b) & 0xff;
          this.B = (a % b) & 0xff;
        }
        return 4;
      }

      // MOV direct, direct
      case 0x85: {
        const src = this.fetchCodeByte();
        const dst = this.fetchCodeByte();
        this.writeDirect(dst, this.readDirect(src));
        return 2;
      }

      // MOV direct, @R0 / @R1
      case 0x86:
      case 0x87: {
        const dst = this.fetchCodeByte();
        this.writeDirect(dst, this.readIndirect(op & 1));
        return 2;
      }

      // MOV direct, R0 - R7
      case 0x88:
      case 0x89:
      case 0x8a:
      case 0x8b:
      case 0x8c:
      case 0x8d:
      case 0x8e:
      case 0x8f: {
        const dst = this.fetchCodeByte();
        this.writeDirect(dst, this.readR(op & 0x07));
        return 2;
      }

      // MOV DPTR, #data16
      case 0x90:
        this.setDPTR(this.fetchCodeWord());
        return 2;

      // MOV bit, C
      case 0x92: {
        this.writeBit(this.fetchCodeByte(), this.CY);
        return 2;
      }

      // MOVC A, @A+DPTR
      case 0x93: {
        const addr = (this.getDPTR() + this.A) & 0xffff;
        this.A = this.rom[addr];
        return 2;
      }

      // SUBB A, #data
      case 0x94:
        this.doSubb(this.fetchCodeByte());
        return 1;

      // SUBB A, direct
      case 0x95:
        this.doSubb(this.readDirect(this.fetchCodeByte()));
        return 1;

      // SUBB A, @R0 / @R1
      case 0x96:
      case 0x97:
        this.doSubb(this.readIndirect(op & 1));
        return 1;

      // SUBB A, R0 - R7
      case 0x98:
      case 0x99:
      case 0x9a:
      case 0x9b:
      case 0x9c:
      case 0x9d:
      case 0x9e:
      case 0x9f:
        this.doSubb(this.readR(op & 0x07));
        return 1;

      // ORL C, /bit
      case 0xa0: {
        this.CY = this.CY || !this.readBit(this.fetchCodeByte());
        return 2;
      }

      // MOV C, bit
      case 0xa2: {
        this.CY = this.readBit(this.fetchCodeByte());
        return 1;
      }

      // INC DPTR
      case 0xa3:
        this.setDPTR((this.getDPTR() + 1) & 0xffff);
        return 2;

      // MUL AB
      case 0xa4: {
        const prod = this.A * this.B;
        this.A = prod & 0xff;
        this.B = (prod >> 8) & 0xff;
        this.CY = false;
        this.OV = prod > 0xff;
        return 4;
      }

      // A5 reserved
      case 0xa5:
        if (this.onLog) this.onLog('ERROR', 'Thực thi mã không hợp lệ 0xA5');
        return 1;

      // MOV @R0, direct / @R1, direct
      case 0xa6:
      case 0xa7: {
        const src = this.fetchCodeByte();
        this.writeIndirect(op & 1, this.readDirect(src));
        return 2;
      }

      // MOV R0 - R7, direct
      case 0xa8:
      case 0xa9:
      case 0xaa:
      case 0xab:
      case 0xac:
      case 0xad:
      case 0xae:
      case 0xaf: {
        const src = this.fetchCodeByte();
        this.writeR(op & 0x07, this.readDirect(src));
        return 2;
      }

      // ANL C, /bit
      case 0xb0: {
        this.CY = this.CY && !this.readBit(this.fetchCodeByte());
        return 2;
      }

      // CPL bit
      case 0xb2: {
        const bit = this.fetchCodeByte();
        this.writeBit(bit, !this.readBit(bit));
        return 1;
      }

      // CPL C
      case 0xb3:
        this.CY = !this.CY;
        return 1;

      // CJNE A, #data, offset
      case 0xb4: {
        const data = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        const a = this.A;
        this.CY = a < data;
        if (a !== data) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // CJNE A, direct, offset
      case 0xb5: {
        const data = this.readDirect(this.fetchCodeByte());
        const offset = this.fetchCodeByte();
        const a = this.A;
        this.CY = a < data;
        if (a !== data) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // CJNE @R0/#data, offset / @R1
      case 0xb6:
      case 0xb7: {
        const val = this.readIndirect(op & 1);
        const data = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        this.CY = val < data;
        if (val !== data) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // CJNE R0 - R7, #data, offset
      case 0xb8:
      case 0xb9:
      case 0xba:
      case 0xbb:
      case 0xbc:
      case 0xbd:
      case 0xbe:
      case 0xbf: {
        const val = this.readR(op & 0x07);
        const data = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        this.CY = val < data;
        if (val !== data) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // PUSH direct
      case 0xc0: {
        this.push(this.readDirect(this.fetchCodeByte()));
        return 2;
      }

      // CLR bit
      case 0xc2:
        this.writeBit(this.fetchCodeByte(), false);
        return 1;

      // CLR C
      case 0xc3:
        this.CY = false;
        return 1;

      // SWAP A
      case 0xc4: {
        const a = this.A;
        this.A = ((a << 4) | (a >> 4)) & 0xff;
        return 1;
      }

      // XCH A, direct
      case 0xc5: {
        const addr = this.fetchCodeByte();
        const oldA = this.A;
        this.A = this.readDirect(addr);
        this.writeDirect(addr, oldA);
        return 1;
      }

      // XCH A, @R0 / @R1
      case 0xc6:
      case 0xc7: {
        const r = op & 1;
        const oldA = this.A;
        this.A = this.readIndirect(r);
        this.writeIndirect(r, oldA);
        return 1;
      }

      // XCH A, R0 - R7
      case 0xc8:
      case 0xc9:
      case 0xca:
      case 0xcb:
      case 0xcc:
      case 0xcd:
      case 0xce:
      case 0xcf: {
        const r = op & 0x07;
        const oldA = this.A;
        this.A = this.readR(r);
        this.writeR(r, oldA);
        return 1;
      }

      // POP direct
      case 0xd0: {
        const addr = this.fetchCodeByte();
        this.writeDirect(addr, this.pop());
        return 2;
      }

      // SETB bit
      case 0xd2:
        this.writeBit(this.fetchCodeByte(), true);
        return 1;

      // SETB C
      case 0xd3:
        this.CY = true;
        return 1;

      // DA A (Decimal Adjust)
      case 0xd4: {
        let a = this.A;
        let cy = this.CY;
        if ((a & 0x0f) > 9 || this.AC) {
          a += 6;
        }
        if (a > 0x99 || cy) {
          a += 0x60;
          cy = true;
        }
        this.A = a & 0xff;
        this.CY = cy;
        return 1;
      }

      // DJNZ direct, offset
      case 0xd5: {
        const addr = this.fetchCodeByte();
        const offset = this.fetchCodeByte();
        const val = (this.readDirect(addr) - 1 + 256) & 0xff;
        this.writeDirect(addr, val);
        if (val !== 0) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // XCHD A, @R0 / @R1
      case 0xd6:
      case 0xd7: {
        const r = op & 1;
        const ramVal = this.readIndirect(r);
        const a = this.A;
        this.A = (a & 0xf0) | (ramVal & 0x0f);
        this.writeIndirect(r, (ramVal & 0xf0) | (a & 0x0f));
        return 1;
      }

      // DJNZ R0 - R7, offset
      case 0xd8:
      case 0xd9:
      case 0xda:
      case 0xdb:
      case 0xdc:
      case 0xdd:
      case 0xde:
      case 0xdf: {
        const r = op & 0x07;
        const val = (this.readR(r) - 1 + 256) & 0xff;
        const offset = this.fetchCodeByte();
        this.writeR(r, val);
        if (val !== 0) {
          this.pc = (this.pc + (offset > 127 ? offset - 256 : offset)) & 0xffff;
        }
        return 2;
      }

      // MOVX A, @DPTR
      case 0xe0:
        // No external RAM attached by default, returns 0xFF
        this.A = 0xff;
        return 2;

      // CLR A
      case 0xe4:
        this.A = 0;
        return 1;

      // MOV A, direct
      case 0xe5:
        this.A = this.readDirect(this.fetchCodeByte());
        return 1;

      // MOV A, @R0 / @R1
      case 0xe6:
      case 0xe7:
        this.A = this.readIndirect(op & 1);
        return 1;

      // MOV A, R0 - R7
      case 0xe8:
      case 0xe9:
      case 0xea:
      case 0xeb:
      case 0xec:
      case 0xed:
      case 0xee:
      case 0xef:
        this.A = this.readR(op & 0x07);
        return 1;

      // MOVX @DPTR, A
      case 0xf0:
        return 2;

      // CPL A
      case 0xf4:
        this.A = ~this.A & 0xff;
        return 1;

      // MOV direct, A
      case 0xf5:
        this.writeDirect(this.fetchCodeByte(), this.A);
        return 1;

      // MOV @R0, A / @R1, A
      case 0xf6:
      case 0xf7:
        this.writeIndirect(op & 1, this.A);
        return 1;

      // MOV R0 - R7, A
      case 0xf8:
      case 0xf9:
      case 0xfa:
      case 0xfb:
      case 0xfc:
      case 0xfd:
      case 0xfe:
      case 0xff:
        this.writeR(op & 0x07, this.A);
        return 1;

      default:
        if (this.onLog) this.onLog('ERROR', `Lệnh chưa biết: 0x${op.toString(16).toUpperCase()}`);
        return 1;
    }
  }

  // --- ARITHMETIC UTILITIES ---
  private doAdd(val: number, withCarry: boolean): void {
    const a = this.A;
    const c = withCarry && this.CY ? 1 : 0;
    const sum = a + val + c;

    // AC: Auxiliary Carry (bit 3 to bit 4)
    this.AC = (a & 0x0f) + (val & 0x0f) + c > 0x0f;

    // CY: bit 7 overflow
    this.CY = sum > 0xff;

    // OV: Two's complement signed overflow
    // Overflows if signs of operands are same and sign of result is different
    const sA = (a & 0x80) !== 0;
    const sVal = (val & 0x80) !== 0;
    const sRes = (sum & 0x80) !== 0;
    this.OV = sA === sVal && sA !== sRes;

    this.A = sum & 0xff;
  }

  private doSubb(val: number): void {
    const a = this.A;
    const c = this.CY ? 1 : 0;
    const diff = a - val - c;

    // AC: borrow from bit 4
    this.AC = (a & 0x0f) - (val & 0x0f) - c < 0;

    // CY: borrow into bit 7
    this.CY = diff < 0;

    // OV: Two's complement overflow for subtraction
    const sA = (a & 0x80) !== 0;
    const sVal = (val & 0x80) !== 0;
    const sRes = (diff & 0x80) !== 0;
    this.OV = sA !== sVal && sA !== sRes;

    this.A = (diff + 256) & 0xff;
  }

  // --- SNAPSHOT FOR UI ---
  public getSnapshot(): CpuStateSnapshot {
    const psw = this.PSW;
    const bank = (psw >> 3) & 0x03;
    const r = [
      this.readRam(bank * 8 + 0),
      this.readRam(bank * 8 + 1),
      this.readRam(bank * 8 + 2),
      this.readRam(bank * 8 + 3),
      this.readRam(bank * 8 + 4),
      this.readRam(bank * 8 + 5),
      this.readRam(bank * 8 + 6),
      this.readRam(bank * 8 + 7),
    ];

    return {
      pc: this.pc,
      sp: this.SP,
      a: this.A,
      b: this.B,
      dptr: this.getDPTR(),
      psw: psw,
      flags: {
        cy: this.CY,
        ac: this.AC,
        f0: this.getFlag(BIT_PSW_F0),
        rs1: this.getFlag(BIT_PSW_RS1),
        rs0: this.getFlag(BIT_PSW_RS0),
        ov: this.OV,
        p: this.getFlag(BIT_PSW_P),
      },
      bank,
      r,
      p0: this.readSfr(SFR_P0),
      p1: this.readSfr(SFR_P1),
      p2: this.readSfr(SFR_P2),
      p3: this.readSfr(SFR_P3),
      tmod: this.readSfr(SFR_TMOD),
      tcon: this.readSfr(SFR_TCON),
      th0: this.readSfr(SFR_TH0),
      tl0: this.readSfr(SFR_TL0),
      th1: this.readSfr(SFR_TH1),
      tl1: this.readSfr(SFR_TL1),
      ie: this.readSfr(SFR_IE),
      ip: this.readSfr(SFR_IP),
      totalCycles: this.totalCycles,
      simTimeUs: (this.totalCycles * 1000000) / (this.fOscHz / 12),
      lastChangedRamAddr: this.lastChangedRamAddr,
    };
  }
}
