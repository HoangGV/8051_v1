/**
 * 128-Byte Internal RAM Hex Viewer & Live Editor
 * Highlights recently modified memory cells and allows direct in-place editing.
 */

import React, { useState } from 'react';

interface RamPanelProps {
  ram: Uint8Array;
  lastChangedAddr: number | null;
  onEditByte: (addr: number, val: number) => void;
}

export const RamPanel: React.FC<RamPanelProps> = ({ ram, lastChangedAddr, onEditByte }) => {
  const [editingAddr, setEditingAddr] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const toHex2 = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();

  const handleStartEdit = (addr: number) => {
    setEditingAddr(addr);
    setEditValue(toHex2(ram[addr]));
  };

  const handleCommitEdit = (addr: number) => {
    const parsed = parseInt(editValue, 16);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 255) {
      onEditByte(addr, parsed);
    }
    setEditingAddr(null);
  };

  // Render 8 rows of 16 bytes = 128 bytes (00H - 7FH)
  const rows = [];
  for (let r = 0; r < 8; r++) {
    const baseAddr = r * 16;
    const bytesInRow = [];
    for (let c = 0; c < 16; c++) {
      const addr = baseAddr + c;
      const val = ram[addr] || 0;
      const isChanged = lastChangedAddr === addr;
      const isEditing = editingAddr === addr;

      // Color coding regions:
      // 00H-1FH: 4 Register Banks
      // 20H-2FH: Bit Addressable
      // 30H-7FH: General Purpose RAM
      let regionBg = '';
      if (addr < 0x20) regionBg = 'text-amber-300';
      else if (addr < 0x30) regionBg = 'text-cyan-300';
      else regionBg = 'text-slate-300';

      bytesInRow.push(
        <div
          key={c}
          onClick={() => handleStartEdit(addr)}
          className={`relative text-center py-1 cursor-pointer select-none rounded hover:bg-slate-700 transition-colors ${
            isChanged
              ? 'bg-amber-500/30 text-amber-300 font-bold'
              : regionBg
          }`}
        >
          {isEditing ? (
            <input
              type="text"
              autoFocus
              maxLength={2}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.toUpperCase())}
              onBlur={() => handleCommitEdit(addr)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitEdit(addr);
                else if (e.key === 'Escape') setEditingAddr(null);
              }}
              className="w-full text-center bg-cyan-900 text-white outline-none font-bold rounded"
            />
          ) : (
            toHex2(val)
          )}
        </div>
      );
    }

    rows.push(
      <div key={r} className="grid grid-cols-[48px_repeat(16,1fr)] gap-1 text-center py-0.5 items-center">
        <span className="text-[11px] font-semibold text-slate-500 text-right pr-2">
          {toHex2(baseAddr)}H:
        </span>
        {bytesInRow}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 font-mono text-xs overflow-y-auto p-3">
      {/* Legend */}
      <div className="flex items-center justify-between text-[11px] mb-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/50" />
            <span className="text-amber-300">00H-1FH (Bank R0-R7)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-cyan-500/20 border border-cyan-500/50" />
            <span className="text-cyan-300">20H-2FH (Bit RAM)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-slate-700/40 border border-slate-600/50" />
            <span className="text-slate-400">30H-7FH (Đa dụng)</span>
          </span>
        </div>
        <span className="text-slate-500 italic">Nhấp đúp vào ô để sửa giá trị</span>
      </div>

      {/* Header columns: 00 01 02 ... 0F */}
      <div className="grid grid-cols-[48px_repeat(16,1fr)] gap-1 text-center font-bold text-slate-500 pb-1 border-b border-slate-800 text-[11px]">
        <span>Addr</span>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i}>+{toHex2(i)}</span>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 py-1 space-y-0.5">{rows}</div>
    </div>
  );
};
