/**
 * Types & Data Models for 8051 Simulator & Schematic Circuit Engine
 */

export type PortMode = 'easy' | 'realistic';

export interface PinState {
  id: string;
  name: string;
  label?: string;
  relX: number; // relative to component top-left in canvas coordinates
  relY: number;
  dir?: 'input' | 'output' | 'bidir' | 'passive';
  // Electrical node mapped by solver
  nodeId?: number;
  voltage?: number;
  current?: number;
}

export type ComponentType =
  | 'mcu8051'
  | 'led'
  | 'resistor'
  | 'npn'
  | 'diode'
  | 'vcc'
  | 'gnd'
  | 'button'
  | 'switch'
  | 'ammeter'
  | 'voltmeter'
  | 'sevseg_ca'
  | 'sevseg_cc'
  | 'buzzer';

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: number; // 0, 90, 180, 270
  flipped?: boolean;
  name: string;
  props: Record<string, any>;
  pins: PinState[];
}

export interface WireJunction {
  id: string;
  x: number;
  y: number;
  connectedWireIds: string[];
}

export interface Wire {
  id: string;
  points: { x: number; y: number }[];
  color?: string;
  fromPin?: { compId: string; pinId: string };
  toPin?: { compId: string; pinId: string };
}

export type LogLevel = 'INFO' | 'OK' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  time: number; // simulation time in microseconds
  level: LogLevel;
  message: string;
}

export interface AssembleError {
  line: number;
  rawText: string;
  message: string;
  hint?: string;
}

export interface ListingItem {
  address: number;
  bytes: number[];
  lineNum: number;
  source: string;
}

export interface AssembleResult {
  success: boolean;
  errors: AssembleError[];
  warnings: string[];
  hexOutput: string;
  codeSize: number;
  symbolCount: number;
  listing: ListingItem[];
  programMemory: Uint8Array;
  addressToLineMap: Map<number, number>;
  lineToAddressMap: Map<number, number>;
}

export interface CpuStateSnapshot {
  pc: number;
  sp: number;
  a: number;
  b: number;
  dptr: number;
  psw: number;
  flags: {
    cy: boolean;
    ac: boolean;
    f0: boolean;
    rs1: boolean;
    rs0: boolean;
    ov: boolean;
    p: boolean;
  };
  bank: number;
  r: number[]; // R0-R7 in current bank
  p0: number;
  p1: number;
  p2: number;
  p3: number;
  tmod: number;
  tcon: number;
  th0: number;
  tl0: number;
  th1: number;
  tl1: number;
  ie: number;
  ip: number;
  totalCycles: number;
  simTimeUs: number;
  lastChangedRamAddr: number | null;
}

export interface PrebuiltExample {
  id: string;
  title: string;
  category: string;
  description: string;
  sourceCode: string;
  circuit: {
    components: CircuitComponent[];
    wires: Wire[];
  };
}
