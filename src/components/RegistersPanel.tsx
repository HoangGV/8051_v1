/**
 * CPU Registers & Status Panel
 * Live display of A, B, R0-R7 (current bank), PSW flags (CY, AC, F0, RS1, RS0, OV, P),
 * SP, DPTR, PC, total cycles, and simulation time.
 */

import React from 'react';
import { CpuStateSnapshot } from '../types';

interface RegistersPanelProps {
  cpuState: CpuStateSnapshot;
}

export const RegistersPanel: React.FC<RegistersPanelProps> = ({ cpuState }) => {
  const toHex2 = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  const toHex4 = (v: number) => v.toString(16).padStart(4, '0').toUpperCase();

  const { flags } = cpuState;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 font-mono text-xs overflow-y-auto p-3 space-y-4">
      {/* 1. Core Working Registers */}
      <div>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Thanh Ghi Chính &amp; Con Trỏ
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-[#161b22] border border-slate-800 rounded p-1.5 text-center">
            <span className="text-[10px] text-slate-500 block">A (ACC)</span>
            <span className="font-bold text-amber-300 text-sm">0x{toHex2(cpuState.a)}</span>
            <span className="text-[10px] text-slate-500 block font-normal">({cpuState.a})</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-1.5 text-center">
            <span className="text-[10px] text-slate-500 block">B</span>
            <span className="font-bold text-amber-300 text-sm">0x{toHex2(cpuState.b)}</span>
            <span className="text-[10px] text-slate-500 block font-normal">({cpuState.b})</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-1.5 text-center">
            <span className="text-[10px] text-slate-500 block">DPTR</span>
            <span className="font-bold text-cyan-300 text-sm">0x{toHex4(cpuState.dptr)}</span>
            <span className="text-[10px] text-slate-500 block font-normal">
              [{toHex2(cpuState.dptr >> 8)}:{toHex2(cpuState.dptr & 0xff)}]
            </span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-1.5 text-center">
            <span className="text-[10px] text-slate-500 block">PC</span>
            <span className="font-bold text-emerald-400 text-sm">0x{toHex4(cpuState.pc)}</span>
            <span className="text-[10px] text-slate-500 block font-normal">SP: 0x{toHex2(cpuState.sp)}</span>
          </div>
        </div>
      </div>

      {/* 2. Program Status Word (PSW) Flags */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Thanh Ghi Cờ Trạng Thái (PSW: 0x{toHex2(cpuState.psw)})
          </span>
          <span className="text-[10px] text-cyan-400">Bank {cpuState.bank}</span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {[
            { name: 'CY', active: flags.cy, title: 'Carry Flag' },
            { name: 'AC', active: flags.ac, title: 'Auxiliary Carry Flag' },
            { name: 'F0', active: flags.f0, title: 'User Flag 0' },
            { name: 'RS1', active: flags.rs1, title: 'Register Bank Select 1' },
            { name: 'RS0', active: flags.rs0, title: 'Register Bank Select 0' },
            { name: 'OV', active: flags.ov, title: 'Overflow Flag' },
            { name: 'P', active: flags.p, title: 'Parity Flag (ACC)' },
          ].map((f) => (
            <div
              key={f.name}
              title={f.title}
              className={`py-1 rounded border text-[11px] transition-colors ${
                f.active
                  ? 'bg-cyan-950 border-cyan-500/80 text-cyan-300 font-bold'
                  : 'bg-[#161b22] border-slate-800 text-slate-500'
              }`}
            >
              <div>{f.name}</div>
              <div className="text-[10px]">{f.active ? '1' : '0'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Register Bank R0 - R7 */}
      <div>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Thanh Ghi Bank {cpuState.bank} (R0 - R7)
        </div>
        <div className="grid grid-cols-8 gap-1.5 text-center">
          {cpuState.r.map((val, idx) => (
            <div key={idx} className="bg-[#161b22] border border-slate-800 rounded p-1">
              <span className="text-[10px] text-slate-500 block">R{idx}</span>
              <span className="font-semibold text-amber-200">0x{toHex2(val)}</span>
              <span className="text-[9px] text-slate-500 block">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Execution Telemetry */}
      <div className="pt-2 border-t border-slate-800/80 text-slate-400 text-[11px] space-y-1">
        <div className="flex justify-between">
          <span>Tổng số chu kỳ máy (Cycles):</span>
          <span className="font-bold text-slate-200 tabular-nums">{cpuState.totalCycles.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Thời gian mô phỏng:</span>
          <span className="font-bold text-cyan-300 tabular-nums">
            {cpuState.simTimeUs < 1000
              ? `${cpuState.simTimeUs.toFixed(0)} µs`
              : cpuState.simTimeUs < 1000000
              ? `${(cpuState.simTimeUs / 1000).toFixed(2)} ms`
              : `${(cpuState.simTimeUs / 1000000).toFixed(3)} s`}
          </span>
        </div>
      </div>
    </div>
  );
};
