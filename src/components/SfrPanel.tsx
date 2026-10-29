/**
 * Special Function Registers (SFR) & Ports Monitor
 * Displays P0-P3 with visual pin bit indicators (0/1),
 * Timer registers (TMOD, TCON, TH0, TL0, TH1, TL1), and Interrupt registers (IE, IP).
 */

import React from 'react';
import { CpuStateSnapshot } from '../types';

interface SfrPanelProps {
  cpuState: CpuStateSnapshot;
}

export const SfrPanel: React.FC<SfrPanelProps> = ({ cpuState }) => {
  const toHex2 = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  const toBin8 = (v: number) => v.toString(2).padStart(8, '0');

  const ports = [
    { name: 'P0', addr: 0x80, val: cpuState.p0 },
    { name: 'P1', addr: 0x90, val: cpuState.p1 },
    { name: 'P2', addr: 0xa0, val: cpuState.p2 },
    { name: 'P3', addr: 0xb0, val: cpuState.p3 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 font-mono text-xs overflow-y-auto p-3 space-y-4">
      {/* 1. I/O Ports P0 - P3 Bit Visualizers */}
      <div>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Các Cổng Vào / Ra (I/O Ports)
        </div>

        <div className="grid grid-cols-2 gap-3">
          {ports.map((port) => (
            <div key={port.name} className="bg-[#161b22] border border-slate-800 rounded p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-cyan-400">
                  {port.name} <span className="text-[10px] text-slate-500 font-normal">({toHex2(port.addr)}H)</span>
                </span>
                <span className="font-semibold text-amber-300">
                  0x{toHex2(port.val)} <span className="text-slate-500 font-normal">({port.val})</span>
                </span>
              </div>

              {/* 8-bit visual boxes (bit 7 down to bit 0) */}
              <div className="grid grid-cols-8 gap-1 text-center">
                {Array.from({ length: 8 }, (_, i) => {
                  const bitIdx = 7 - i;
                  const bitVal = ((port.val >> bitIdx) & 1) === 1;
                  return (
                    <div
                      key={bitIdx}
                      title={`${port.name}.${bitIdx}`}
                      className={`py-0.5 rounded text-[10px] ${
                        bitVal ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-bold' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      <div>.{bitIdx}</div>
                      <div>{bitVal ? '1' : '0'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Timers & Interrupt Registers */}
      <div>
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Timer &amp; Quản Lý Ngắt
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="bg-[#161b22] border border-slate-800 rounded p-2 text-center">
            <span className="text-[10px] text-slate-500 block">TMOD (89H)</span>
            <span className="font-bold text-amber-300">0x{toHex2(cpuState.tmod)}</span>
            <span className="text-[9px] text-slate-500 block mt-1">{toBin8(cpuState.tmod)}B</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-2 text-center">
            <span className="text-[10px] text-slate-500 block">TCON (88H)</span>
            <span className="font-bold text-amber-300">0x{toHex2(cpuState.tcon)}</span>
            <span className="text-[9px] text-slate-500 block mt-1">{toBin8(cpuState.tcon)}B</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-2 text-center">
            <span className="text-[10px] text-slate-500 block">Timer 0 (TH0:TL0)</span>
            <span className="font-bold text-cyan-300">
              0x{toHex2(cpuState.th0)}:{toHex2(cpuState.tl0)}
            </span>
            <span className="text-[9px] text-slate-500 block mt-1">{(cpuState.th0 << 8) | cpuState.tl0}</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-2 text-center">
            <span className="text-[10px] text-slate-500 block">Timer 1 (TH1:TL1)</span>
            <span className="font-bold text-cyan-300">
              0x{toHex2(cpuState.th1)}:{toHex2(cpuState.tl1)}
            </span>
            <span className="text-[9px] text-slate-500 block mt-1">{(cpuState.th1 << 8) | cpuState.tl1}</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-2 text-center">
            <span className="text-[10px] text-slate-500 block">IE (A8H - Enable)</span>
            <span className="font-bold text-emerald-400">0x{toHex2(cpuState.ie)}</span>
            <span className="text-[9px] text-slate-500 block mt-1">EA: {(cpuState.ie >> 7) & 1}</span>
          </div>

          <div className="bg-[#161b22] border border-slate-800 rounded p-2 text-center">
            <span className="text-[10px] text-slate-500 block">IP (B8H - Priority)</span>
            <span className="font-bold text-emerald-400">0x{toHex2(cpuState.ip)}</span>
            <span className="text-[9px] text-slate-500 block mt-1">{toBin8(cpuState.ip)}B</span>
          </div>
        </div>
      </div>
    </div>
  );
};
