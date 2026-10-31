/**
 * Left Component Palette
 * Displays categorized components ready to be placed into the schematic canvas.
 */

import React from 'react';
import { ComponentType } from '../types';

interface PaletteProps {
  onAddComponent: (type: ComponentType) => void;
}

interface PaletteItem {
  type: ComponentType;
  label: string;
  category: string;
  icon: string;
  desc: string;
}

export const Palette: React.FC<PaletteProps> = ({ onAddComponent }) => {
  const items: PaletteItem[] = [
    // MCU
    { type: 'mcu8051', label: 'Chip 8051', category: 'Vi điều khiển', icon: '🔲', desc: 'DIP-40 12MHz' },
    // Passive & Power
    { type: 'vcc', label: 'Nguồn Vcc', category: 'Nguồn & Mass', icon: '🔺', desc: '+5V (0-24V)' },
    { type: 'gnd', label: 'Ground (GND)', category: 'Nguồn & Mass', icon: '⏚', desc: '0V Mass chung' },
    { type: 'resistor', label: 'Điện trở', category: 'Thụ động', icon: '〰️', desc: '330 Ω / 1k / 10k' },
    { type: 'diode', label: 'Diode', category: 'Bán dẫn', icon: '▶|', desc: '1N4148 (Vf=0.7V)' },
    { type: 'npn', label: 'BJT NPN', category: 'Bán dẫn', icon: '⎇', desc: '2N2222 (beta 100)' },
    // Interactive & Output
    { type: 'button', label: 'Nút nhấn', category: 'Điều khiển', icon: '🔘', desc: 'Tự nhả (Push-button)' },
    { type: 'switch', label: 'Công tắc gạt', category: 'Điều khiển', icon: '🎚️', desc: 'Giữ trạng thái (SPST)' },
    { type: 'led', label: 'Đèn LED', category: 'Hiển thị', icon: '💡', desc: 'Đỏ / Xanh / Vàng' },
    { type: 'sevseg_ca', label: 'LED 7 đoạn (CA)', category: 'Hiển thị', icon: '8️⃣', desc: 'Anode chung (+5V)' },
    { type: 'sevseg_cc', label: 'LED 7 đoạn (CC)', category: 'Hiển thị', icon: '8️⃣', desc: 'Cathode chung (GND)' },
    { type: 'buzzer', label: 'Loa Buzzer', category: 'Hiển thị', icon: '🔔', desc: 'Báo động âm thanh' },
    // Meters
    { type: 'ammeter', label: 'Ampe kế', category: 'Đo lường', icon: '🅰️', desc: 'Đo dòng nối tiếp' },
    { type: 'voltmeter', label: 'Vôn kế', category: 'Đo lường', icon: 'Ⓥ', desc: 'Đo hiệu điện thế' },
  ];

  // Group by category
  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <div className="flex flex-col h-full bg-[#161b22] border-r border-slate-800 text-slate-300 font-mono text-xs w-56 shrink-0 overflow-y-auto select-none p-3 space-y-4">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        Bảng Linh Kiện
      </div>

      {categories.map((cat) => (
        <div key={cat} className="space-y-1.5">
          <div className="text-[10px] font-bold text-cyan-400/90 uppercase">{cat}</div>
          <div className="grid grid-cols-1 gap-1">
            {items
              .filter((i) => i.category === cat)
              .map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAddComponent(item.type)}
                  className="flex items-center gap-2 p-1.5 rounded bg-[#0d1117] hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left transition-colors group cursor-pointer"
                  title={`Thêm ${item.label} vào giữa vùng vẽ mạch`}
                >
                  <span className="text-base shrink-0 group-hover:scale-110 transition-transform">
                    {item.icon}
                  </span>
                  <div className="overflow-hidden">
                    <div className="font-semibold text-slate-200 group-hover:text-cyan-300 text-xs truncate">
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{item.desc}</div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};
