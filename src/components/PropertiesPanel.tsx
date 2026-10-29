/**
 * Right Component Properties Inspector
 * Allows editing parameters of selected component or wire in real-time.
 */

import React from 'react';
import { CircuitComponent, PortMode, Wire } from '../types';

interface PropertiesPanelProps {
  selectedComponent: CircuitComponent | null;
  selectedWire: Wire | null;
  onUpdateComponent: (comp: CircuitComponent) => void;
  onDeleteComponent: (id: string) => void;
  onUpdateWire: (wire: Wire) => void;
  onDeleteWire: (id: string) => void;
  burnedLeds: Set<string>;
  onResetLedBurn: (compId: string) => void;
  portMode: PortMode;
  onSetPortMode: (mode: PortMode) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedComponent,
  selectedWire,
  onUpdateComponent,
  onDeleteComponent,
  onUpdateWire,
  onDeleteWire,
  burnedLeds,
  onResetLedBurn,
  portMode,
  onSetPortMode,
}) => {
  if (selectedWire) {
    return (
      <div className="flex flex-col h-full bg-[#161b22] p-3 text-slate-300 font-mono text-xs space-y-4">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-800">
          Thuộc Tính Dây Dẫn (Wire)
        </div>

        <div>
          <label className="text-slate-400 block mb-1">Màu dây dẫn:</label>
          <div className="flex items-center gap-2">
            {['#38bdf8', '#ef4444', '#10b981', '#f59e0b', '#a855f7', '#64748b'].map((c) => (
              <button
                key={c}
                onClick={() => onUpdateWire({ ...selectedWire, color: c })}
                className="w-6 h-6 rounded-full border border-slate-700 transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={() => onDeleteWire(selectedWire.id)}
            className="w-full py-1.5 px-3 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 rounded text-rose-300 font-semibold transition-colors"
          >
            Xóa Dây (Delete)
          </button>
        </div>
      </div>
    );
  }

  if (!selectedComponent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 text-slate-500 font-mono text-xs select-none">
        <span className="text-2xl mb-2">🔍</span>
        <div>Chưa chọn linh kiện nào</div>
        <div className="text-[11px] text-slate-600 mt-1">
          Nhấp vào linh kiện hoặc dây trên mạch để chỉnh sửa thông số.
        </div>
      </div>
    );
  }

  const comp = selectedComponent;
  const isBurned = burnedLeds.has(comp.id);

  const handlePropChange = (key: string, val: any) => {
    onUpdateComponent({
      ...comp,
      props: {
        ...comp.props,
        [key]: val,
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#161b22] p-3 text-slate-300 font-mono text-xs space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <div className="font-bold text-slate-100 text-sm">{comp.name || comp.type}</div>
          <div className="text-[10px] text-slate-500 uppercase">{comp.type}</div>
        </div>
        <button
          onClick={() => {
            const newRot = (comp.rotation + 90) % 360;
            onUpdateComponent({ ...comp, rotation: newRot });
          }}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-300 text-xs"
          title="Xoay 90 độ (phím R)"
        >
          Xoay (R)
        </button>
      </div>

      {/* Component Name */}
      <div>
        <label className="text-slate-400 block mb-1">Tên nhãn:</label>
        <input
          type="text"
          value={comp.name}
          onChange={(e) => onUpdateComponent({ ...comp, name: e.target.value })}
          className="w-full bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-cyan-500"
        />
      </div>

      {/* Specific Properties based on Type */}
      {comp.type === 'mcu8051' && (
        <>
          <div>
            <label className="text-slate-400 block mb-1">Tần số thạch anh (Crystal):</label>
            <select
              value={comp.props.fOscHz || 12000000}
              onChange={(e) => handlePropChange('fOscHz', Number(e.target.value))}
              className="w-full bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
            >
              <option value={12000000}>12.0 MHz (1 µs / chu kỳ)</option>
              <option value={11059200}>11.0592 MHz (Chuẩn Baud UART)</option>
              <option value={24000000}>24.0 MHz (Tốc độ cao)</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Chế độ mô phỏng cổng I/O:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetPortMode('easy')}
                className={`p-1.5 rounded border text-left text-[11px] ${
                  portMode === 'easy'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-[#0d1117] border-slate-800 text-slate-400'
                }`}
              >
                <div>Dễ (Mặc định)</div>
                <div className="text-[9px] text-slate-500 font-normal">LED sáng trực tiếp qua R</div>
              </button>
              <button
                onClick={() => onSetPortMode('realistic')}
                className={`p-1.5 rounded border text-left text-[11px] ${
                  portMode === 'realistic'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-[#0d1117] border-slate-800 text-slate-400'
                }`}
              >
                <div>Thực tế</div>
                <div className="text-[9px] text-slate-500 font-normal">P0 open-drain, pull-up 30k</div>
              </button>
            </div>
          </div>
        </>
      )}

      {comp.type === 'resistor' && (
        <div>
          <label className="text-slate-400 block mb-1">Giá trị điện trở (Ω):</label>
          <input
            type="number"
            min="1"
            value={comp.props.resistance || 330}
            onChange={(e) => handlePropChange('resistance', Number(e.target.value))}
            className="w-full bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none focus:border-cyan-500 font-mono"
          />
          <div className="flex gap-1 mt-2">
            {[220, 330, 470, 1000, 4700, 10000].map((preset) => (
              <button
                key={preset}
                onClick={() => handlePropChange('resistance', preset)}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-400"
              >
                {preset >= 1000 ? `${preset / 1000}k` : `${preset}R`}
              </button>
            ))}
          </div>
        </div>
      )}

      {comp.type === 'led' && (
        <>
          <div>
            <label className="text-slate-400 block mb-1">Màu sắc phát sáng:</label>
            <div className="flex gap-2">
              {[
                { name: 'red', bg: '#ef4444', label: 'Đỏ' },
                { name: 'green', bg: '#22c55e', label: 'Xanh lá' },
                { name: 'blue', bg: '#3b82f6', label: 'Xanh dương' },
                { name: 'yellow', bg: '#eab308', label: 'Vàng' },
              ].map((c) => (
                <button
                  key={c.name}
                  onClick={() => handlePropChange('color', c.name)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                    comp.props.color === c.name ? 'border-white scale-105' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.bg }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Điện áp thuận Vf (V):</label>
            <input
              type="number"
              step="0.1"
              value={comp.props.vf || 2.0}
              onChange={(e) => handlePropChange('vf', Number(e.target.value))}
              className="w-full bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
            />
          </div>

          {isBurned && (
            <div className="p-2 bg-rose-950/80 border border-rose-700 rounded text-rose-300 space-y-1.5">
              <div className="font-bold">⚠️ LED ĐÃ BỊ CHÁY DO QUÁ DÒNG!</div>
              <button
                onClick={() => onResetLedBurn(comp.id)}
                className="w-full py-1 bg-rose-600 hover:bg-rose-500 rounded text-white font-bold transition-colors"
              >
                Thay Đèn LED Mới
              </button>
            </div>
          )}
        </>
      )}

      {comp.type === 'vcc' && (
        <div>
          <label className="text-slate-400 block mb-1">Điện áp nguồn Vcc (V):</label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={comp.props.voltage || 5.0}
            onChange={(e) => handlePropChange('voltage', Number(e.target.value))}
            className="w-full bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
          />
        </div>
      )}

      {comp.type === 'npn' && (
        <>
          <div>
            <label className="text-slate-400 block mb-1">Hệ số khuếch đại dòng (hFE / beta):</label>
            <input
              type="number"
              min="10"
              max="500"
              value={comp.props.beta || 100}
              onChange={(e) => handlePropChange('beta', Number(e.target.value))}
              className="w-full bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Vùng hoạt động hiện tại:</label>
            <div className="p-1.5 bg-[#0d1117] border border-slate-800 rounded font-semibold text-cyan-300">
              {comp.props.state || 'Ngắt (Cutoff)'}
            </div>
          </div>
        </>
      )}

      <div className="pt-4 border-t border-slate-800">
        <button
          onClick={() => onDeleteComponent(comp.id)}
          className="w-full py-1.5 px-3 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 rounded text-rose-300 font-semibold transition-colors"
        >
          Xóa Linh Kiện (Delete)
        </button>
      </div>
    </div>
  );
};
