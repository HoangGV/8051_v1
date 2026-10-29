/**
 * Modified Nodal Analysis (MNA) DC Circuit Solver with Newton-Raphson
 * Handles resistors, diodes, LEDs (with burn-out protection & glow),
 * NPN BJTs, MCU Thevenin pin models, switches, buttons, and meters.
 */

import { CircuitComponent, PinState, PortMode, Wire } from '../types';
import { Cpu8051 } from './cpu8051';

export interface SolverResult {
  nodeVoltages: number[]; // Index corresponds to node ID (Node 0 is always 0V GND)
  componentCurrents: Map<string, number>; // Component ID -> primary current (A)
  pinVoltages: Map<string, number>; // "compId:pinId" -> Voltage (V)
  warnings: string[];
  burnedLeds: Set<string>; // Set of component IDs for burnt LEDs
}

export class CircuitSolver {
  private gmin = 1e-9; // Small conductance to ground to avoid singular matrices

  /**
   * Union-Find to group connected pins and wires into electrical nodes (Nets)
   */
  public buildNetlist(
    components: CircuitComponent[],
    wires: Wire[]
  ): {
    nodeCount: number;
    pinToNode: Map<string, number>; // "compId:pinId" -> node index
    groundNode: number;
  } {
    // Key format: "compId:pinId" or "wire:pointX:pointY"
    const parent = new Map<string, string>();

    const find = (i: string): string => {
      if (!parent.has(i)) parent.set(i, i);
      let root = i;
      while (root !== parent.get(root)) {
        root = parent.get(root)!;
      }
      let curr = i;
      while (curr !== root) {
        const next = parent.get(curr)!;
        parent.set(curr, root);
        curr = next;
      }
      return root;
    };

    const union = (i: string, j: string) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent.set(rootI, rootJ);
      }
    };

    // Index all component pins with world coordinates
    const pinCoordMap = new Map<string, string>(); // "roundX,roundY" -> "compId:pinId"

    for (const comp of components) {
      for (const pin of comp.pins) {
        const pinKey = `${comp.id}:${pin.id}`;
        const wx = Math.round(comp.x + pin.relX);
        const wy = Math.round(comp.y + pin.relY);
        pinCoordMap.set(`${wx},${wy}`, pinKey);
        find(pinKey);
      }
    }

    // Connect wires to pins and junctions
    for (const wire of wires) {
      if (!wire.points || wire.points.length < 2) continue;

      const pStart = `${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`;
      const pEnd = `${Math.round(wire.points[wire.points.length - 1].x)},${Math.round(wire.points[wire.points.length - 1].y)}`;

      const startKey = wire.fromPin ? `${wire.fromPin.compId}:${wire.fromPin.pinId}` : pinCoordMap.get(pStart) || `pt:${pStart}`;
      const endKey = wire.toPin ? `${wire.toPin.compId}:${wire.toPin.pinId}` : pinCoordMap.get(pEnd) || `pt:${pEnd}`;

      union(startKey, endKey);

      // Connect any intermediate wire points to the same root
      for (let i = 1; i < wire.points.length - 1; i++) {
        const midPt = `pt:${Math.round(wire.points[i].x)},${Math.round(wire.points[i].y)}`;
        union(startKey, midPt);
      }
    }

    // Map GND component pins to root GND
    const gndKey = '__GND_GLOBAL__';
    for (const comp of components) {
      if (comp.type === 'gnd') {
        const pinKey = `${comp.id}:${comp.pins[0].id}`;
        union(pinKey, gndKey);
      }
    }

    // Assign consecutive integer IDs to each unique net root
    // Node 0 is always reserved for GND
    const rootToNodeId = new Map<string, number>();
    const gndRoot = find(gndKey);
    rootToNodeId.set(gndRoot, 0);

    let nextNodeId = 1;
    const pinToNode = new Map<string, number>();

    for (const comp of components) {
      for (const pin of comp.pins) {
        const pinKey = `${comp.id}:${pin.id}`;
        const root = find(pinKey);
        if (!rootToNodeId.has(root)) {
          rootToNodeId.set(root, nextNodeId++);
        }
        pinToNode.set(pinKey, rootToNodeId.get(root)!);
      }
    }

    return {
      nodeCount: nextNodeId,
      pinToNode,
      groundNode: 0,
    };
  }

  /**
   * Solve DC Operating Point using Newton-Raphson Iterative MNA
   */
  public solve(
    components: CircuitComponent[],
    wires: Wire[],
    cpu: Cpu8051,
    portMode: PortMode = 'easy',
    burnedLeds: Set<string> = new Set()
  ): SolverResult {
    const { nodeCount, pinToNode } = this.buildNetlist(components, wires);

    const warnings: string[] = [];
    const componentCurrents = new Map<string, number>();
    const pinVoltages = new Map<string, number>();

    // Initial node voltages: 0V
    let V = new Array(nodeCount).fill(0);

    // Identify voltage sources and ammeters that require extra MNA rows
    const vSources: Array<{
      id: string;
      nodePos: number;
      nodeNeg: number;
      voltage: number;
    }> = [];

    // 1. Gather fixed ideal/independent voltage sources
    for (const comp of components) {
      if (comp.type === 'vcc') {
        const vVal = typeof comp.props.voltage === 'number' ? comp.props.voltage : 5.0;
        const nPos = pinToNode.get(`${comp.id}:pin1`) ?? 0;
        vSources.push({ id: comp.id, nodePos: nPos, nodeNeg: 0, voltage: vVal });
      } else if (comp.type === 'ammeter') {
        // Ammeter has 0V voltage source in MNA to monitor branch current
        const nPos = pinToNode.get(`${comp.id}:p`) ?? 0;
        const nNeg = pinToNode.get(`${comp.id}:n`) ?? 0;
        vSources.push({ id: comp.id, nodePos: nPos, nodeNeg: nNeg, voltage: 0.0 });
      }
    }

    const numVs = vSources.length;
    const matrixSize = nodeCount - 1 + numVs; // exclude ground node 0

    // Newton-Raphson loop for non-linear components (LED, Diode, BJT)
    const maxIterations = 18;
    const vTol = 1e-4;

    for (let iter = 0; iter < maxIterations; iter++) {
      if (matrixSize <= 0) break;

      // Allocate G matrix and I vector
      const A: number[][] = Array.from({ length: matrixSize }, () => new Array(matrixSize).fill(0));
      const Z: number[] = new Array(matrixSize).fill(0);

      // Add gmin to all nodes to GND
      for (let n = 1; n < nodeCount; n++) {
        A[n - 1][n - 1] += this.gmin;
      }

      // Helper to stamp conductance G between node1 and node2
      const stampConductance = (n1: number, n2: number, g: number) => {
        if (n1 > 0) A[n1 - 1][n1 - 1] += g;
        if (n2 > 0) A[n2 - 1][n2 - 1] += g;
        if (n1 > 0 && n2 > 0) {
          A[n1 - 1][n2 - 1] -= g;
          A[n2 - 1][n1 - 1] -= g;
        }
      };

      // Helper to stamp current source I flowing from n1 into n2
      const stampCurrent = (nFrom: number, nTo: number, iVal: number) => {
        if (nFrom > 0) Z[nFrom - 1] -= iVal;
        if (nTo > 0) Z[nTo - 1] += iVal;
      };

      // 2. Stamp Linear & Non-linear Components
      for (const comp of components) {
        if (comp.type === 'resistor') {
          const rVal = Math.max(0.1, Number(comp.props.resistance) || 330);
          const g = 1 / rVal;
          const n1 = pinToNode.get(`${comp.id}:pin1`) ?? 0;
          const n2 = pinToNode.get(`${comp.id}:pin2`) ?? 0;
          stampConductance(n1, n2, g);
          const vDrop = V[n1] - V[n2];
          componentCurrents.set(comp.id, Math.abs(vDrop) * g);
        } else if (comp.type === 'button') {
          // Closed when pressed
          const isPressed = Boolean(comp.props.pressed);
          const r = isPressed ? 0.05 : 1e8;
          const n1 = pinToNode.get(`${comp.id}:pin1`) ?? 0;
          const n2 = pinToNode.get(`${comp.id}:pin2`) ?? 0;
          stampConductance(n1, n2, 1 / r);
        } else if (comp.type === 'switch') {
          const isOn = Boolean(comp.props.closed);
          const r = isOn ? 0.05 : 1e8;
          const n1 = pinToNode.get(`${comp.id}:pin1`) ?? 0;
          const n2 = pinToNode.get(`${comp.id}:pin2`) ?? 0;
          stampConductance(n1, n2, 1 / r);
        } else if (comp.type === 'voltmeter') {
          // Voltmeter has 10 MΩ internal resistance
          const n1 = pinToNode.get(`${comp.id}:p`) ?? 0;
          const n2 = pinToNode.get(`${comp.id}:n`) ?? 0;
          stampConductance(n1, n2, 1e-7);
        } else if (comp.type === 'buzzer') {
          // Buzzer conducts ~10mA when forward voltage > 2.5V
          const n1 = pinToNode.get(`${comp.id}:pos`) ?? 0;
          const n2 = pinToNode.get(`${comp.id}:neg`) ?? 0;
          const vDrop = V[n1] - V[n2];
          if (vDrop > 2.0) {
            stampConductance(n1, n2, 1 / 300);
            componentCurrents.set(comp.id, Math.max(0, (vDrop - 1.5) / 300));
          } else {
            stampConductance(n1, n2, 1e-7);
            componentCurrents.set(comp.id, 0);
          }
        } else if (comp.type === 'diode') {
          // Diode: Vf ~ 0.7V, dynamic conductance
          const nA = pinToNode.get(`${comp.id}:a`) ?? 0;
          const nK = pinToNode.get(`${comp.id}:k`) ?? 0;
          const vD = V[nA] - V[nK];
          const vf = Number(comp.props.vf) || 0.7;
          if (vD > vf) {
            const rd = 10;
            const gd = 1 / rd;
            stampConductance(nA, nK, gd);
            stampCurrent(nA, nK, -vf * gd);
            componentCurrents.set(comp.id, Math.max(0, (vD - vf) / rd));
          } else {
            stampConductance(nA, nK, 1e-9);
            componentCurrents.set(comp.id, 0);
          }
        } else if (comp.type === 'led') {
          const nA = pinToNode.get(`${comp.id}:anode`) ?? 0;
          const nK = pinToNode.get(`${comp.id}:cathode`) ?? 0;
          const vD = V[nA] - V[nK];
          const vf = Number(comp.props.vf) || 2.0;
          const maxI = Number(comp.props.maxCurrent) || 0.03; // 30mA

          if (burnedLeds.has(comp.id)) {
            // Burnt LED is open circuit
            stampConductance(nA, nK, 1e-9);
            componentCurrents.set(comp.id, 0);
          } else if (vD > vf) {
            const rd = 15;
            const gd = 1 / rd;
            stampConductance(nA, nK, gd);
            stampCurrent(nA, nK, -vf * gd);
            const iLed = (vD - vf) / rd;
            componentCurrents.set(comp.id, iLed);

            // Check for overcurrent burn-out
            if (iLed > maxI * 1.5 && iter === maxIterations - 1) {
              burnedLeds.add(comp.id);
              warnings.push(`CẢNH BÁO: Đèn LED ${comp.name || comp.id} bị cháy do quá dòng (${(iLed * 1000).toFixed(1)} mA > ${(maxI * 1000).toFixed(0)} mA)!`);
            }
          } else {
            stampConductance(nA, nK, 1e-9);
            componentCurrents.set(comp.id, 0);
          }
        } else if (comp.type === 'sevseg_ca' || comp.type === 'sevseg_cc') {
          // 7-segment display segments (a-g, dp)
          const isCA = comp.type === 'sevseg_ca';
          const nCommon = pinToNode.get(`${comp.id}:com`) ?? 0;
          const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
          const vf = 2.0;
          const rd = 15;
          const gd = 1 / rd;

          for (const seg of segments) {
            const nSeg = pinToNode.get(`${comp.id}:${seg}`) ?? 0;
            const nA = isCA ? nCommon : nSeg;
            const nK = isCA ? nSeg : nCommon;
            const vD = V[nA] - V[nK];

            if (vD > vf) {
              stampConductance(nA, nK, gd);
              stampCurrent(nA, nK, -vf * gd);
            } else {
              stampConductance(nA, nK, 1e-9);
            }
          }
        } else if (comp.type === 'npn') {
          // BJT NPN Transistor
          const nB = pinToNode.get(`${comp.id}:b`) ?? 0;
          const nC = pinToNode.get(`${comp.id}:c`) ?? 0;
          const nE = pinToNode.get(`${comp.id}:e`) ?? 0;

          const vBe = V[nB] - V[nE];
          const vCe = V[nC] - V[nE];
          const beta = Number(comp.props.beta) || 100;
          const vBeOn = 0.7;
          const vCeSat = 0.2;

          if (vBe > vBeOn) {
            // Base-emitter conducts
            const rBe = 200;
            const gBe = 1 / rBe;
            stampConductance(nB, nE, gBe);
            stampCurrent(nB, nE, -vBeOn * gBe);
            const ib = (vBe - vBeOn) / rBe;

            if (vCe <= vCeSat) {
              // Saturation mode: C-E acts as low resistance
              const rSat = 10;
              stampConductance(nC, nE, 1 / rSat);
              comp.props.state = 'Bão hòa (Saturation)';
              componentCurrents.set(comp.id, Math.max(0, (vCe - vCeSat) / rSat));
            } else {
              // Active linear mode: Ic = beta * Ib
              const ic = Math.max(0, beta * ib);
              stampCurrent(nC, nE, -ic);
              comp.props.state = 'Khuếch đại (Active)';
              componentCurrents.set(comp.id, ic);
            }
          } else {
            // Cutoff mode
            stampConductance(nB, nE, 1e-8);
            stampConductance(nC, nE, 1e-8);
            comp.props.state = 'Ngắt (Cutoff)';
            componentCurrents.set(comp.id, 0);
          }
        } else if (comp.type === 'mcu8051') {
          // 8051 MCU pins: P0.0-P0.7, P1.0-P1.7, P3.2, P3.3, P3.4, P3.5, RST
          const vChip = Number(comp.props.voltage) || 5.0;

          // Process Port 0
          for (let pin = 0; pin < 8; pin++) {
            const pinKey = `${comp.id}:p0_${pin}`;
            const node = pinToNode.get(pinKey) ?? 0;
            const bitVal = ((cpu.readSfr(0x80) >> pin) & 1) === 1;

            if (portMode === 'easy') {
              const r = 50; // ~50 ohm driver
              const vOut = bitVal ? vChip : 0.0;
              stampConductance(node, 0, 1 / r);
              stampCurrent(0, node, vOut / r);
            } else {
              // Realistic Open-Drain for P0
              if (bitVal) {
                // High-Z open drain: requires external pull-up
                stampConductance(node, 0, 1e-9);
              } else {
                // Driven Low
                const r = 100;
                stampConductance(node, 0, 1 / r);
              }
            }
          }

          // Process Port 1
          for (let pin = 0; pin < 8; pin++) {
            const pinKey = `${comp.id}:p1_${pin}`;
            const node = pinToNode.get(pinKey) ?? 0;
            const bitVal = ((cpu.readSfr(0x90) >> pin) & 1) === 1;

            if (portMode === 'easy') {
              const r = 50;
              const vOut = bitVal ? vChip : 0.0;
              stampConductance(node, 0, 1 / r);
              stampCurrent(0, node, vOut / r);
            } else {
              // Realistic Quasi-bidirectional: 30k weak pullup on 1, 100 ohm pull down on 0
              if (bitVal) {
                const rPullUp = 30000;
                stampConductance(node, 0, 1 / rPullUp);
                stampCurrent(0, node, vChip / rPullUp);
              } else {
                const rPullDown = 100;
                stampConductance(node, 0, 1 / rPullDown);
              }
            }
          }

          // Process P3.2 - P3.5 pins
          const p3Pins = [2, 3, 4, 5];
          for (const p of p3Pins) {
            const pinKey = `${comp.id}:p3_${p}`;
            const node = pinToNode.get(pinKey) ?? 0;
            const bitVal = ((cpu.readSfr(0xb0) >> p) & 1) === 1;

            if (portMode === 'easy') {
              const r = 50;
              const vOut = bitVal ? vChip : 0.0;
              stampConductance(node, 0, 1 / r);
              stampCurrent(0, node, vOut / r);
            } else {
              if (bitVal) {
                const rPullUp = 30000;
                stampConductance(node, 0, 1 / rPullUp);
                stampCurrent(0, node, vChip / rPullUp);
              } else {
                const rPullDown = 100;
                stampConductance(node, 0, 1 / rPullDown);
              }
            }
          }

          // Process RST Pin (pull-down by default)
          const rstNode = pinToNode.get(`${comp.id}:rst`) ?? 0;
          stampConductance(rstNode, 0, 1 / 10000);
        }
      }

      // 3. Stamp Independent Voltage Sources into MNA Matrix
      for (let vIdx = 0; vIdx < numVs; vIdx++) {
        const vs = vSources[vIdx];
        const row = nodeCount - 1 + vIdx;
        const nPos = vs.nodePos;
        const nNeg = vs.nodeNeg;

        if (nPos > 0) {
          A[row][nPos - 1] = 1;
          A[nPos - 1][row] = 1;
        }
        if (nNeg > 0) {
          A[row][nNeg - 1] = -1;
          A[nNeg - 1][row] = -1;
        }
        Z[row] = vs.voltage;
      }

      // 4. Solve Linear System A * X = Z using Gaussian Elimination
      const X = this.solveGaussian(A, Z);
      if (!X) {
        warnings.push('Cảnh báo: Ma trận mạch suy biến (ngắn mạch hoặc nút nổi)!');
        break;
      }

      // Check convergence
      let maxDiff = 0;
      for (let n = 1; n < nodeCount; n++) {
        const diff = Math.abs(V[n] - X[n - 1]);
        if (diff > maxDiff) maxDiff = diff;
        V[n] = X[n - 1];
      }

      // Record ammeter currents from MNA extra variables
      for (let vIdx = 0; vIdx < numVs; vIdx++) {
        const vs = vSources[vIdx];
        if (vs.voltage === 0) {
          // Ammeter
          const currentA = X[nodeCount - 1 + vIdx];
          componentCurrents.set(vs.id, currentA);
        }
      }

      if (maxDiff < vTol) {
        break; // Converged
      }
    }

    // 5. Update MCU Input Pin Levels & Pin Voltages
    for (const comp of components) {
      for (const pin of comp.pins) {
        const pinKey = `${comp.id}:${pin.id}`;
        const node = pinToNode.get(pinKey) ?? 0;
        const volt = V[node];
        pinVoltages.set(pinKey, volt);
        pin.voltage = volt;

        if (comp.type === 'mcu8051') {
          // Update digital input state based on voltage threshold
          // >= 2.0V -> High, <= 0.8V -> Low
          const isHigh = volt >= 1.5;
          if (pin.id.startsWith('p0_')) {
            const pNum = parseInt(pin.id.replace('p0_', ''), 10);
            cpu.setExternalPinInput(0, pNum, isHigh);
          } else if (pin.id.startsWith('p1_')) {
            const pNum = parseInt(pin.id.replace('p1_', ''), 10);
            cpu.setExternalPinInput(1, pNum, isHigh);
          } else if (pin.id.startsWith('p3_')) {
            const pNum = parseInt(pin.id.replace('p3_', ''), 10);
            cpu.setExternalPinInput(3, pNum, isHigh);
          } else if (pin.id === 'rst') {
            if (volt > 2.5) {
              cpu.reset();
              warnings.push('Chip 8051 được Reset qua chân RST!');
            }
          }
        }
      }
    }

    return {
      nodeVoltages: V,
      componentCurrents,
      pinVoltages,
      warnings,
      burnedLeds,
    };
  }

  /**
   * Gaussian Elimination with Partial Pivoting
   */
  private solveGaussian(A: number[][], b: number[]): number[] | null {
    const n = b.length;
    // Clone matrix to avoid mutating
    const M = A.map((row) => [...row]);
    const x = [...b];

    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxEl = Math.abs(M[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > maxEl) {
          maxEl = Math.abs(M[k][i]);
          maxRow = k;
        }
      }

      if (maxEl < 1e-12) {
        return null; // Singular matrix
      }

      // Swap rows
      if (maxRow !== i) {
        const tmpRow = M[i];
        M[i] = M[maxRow];
        M[maxRow] = tmpRow;

        const tmpB = x[i];
        x[i] = x[maxRow];
        x[maxRow] = tmpB;
      }

      // Eliminate below
      for (let k = i + 1; k < n; k++) {
        const c = M[k][i] / M[i][i];
        for (let j = i; j < n; j++) {
          M[k][j] -= c * M[i][j];
        }
        x[k] -= c * x[i];
      }
    }

    // Back substitution
    const res = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += M[i][j] * res[j];
      }
      res[i] = (x[i] - sum) / M[i][i];
    }

    return res;
  }
}
