/**
 * 8051 Instruction Set Reference Cheat Sheet & Shortcuts Modal
 */

import React, { useState } from 'react';

interface CheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheatSheetModal: React.FC<CheatSheetModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'instructions' | 'shortcuts' | 'sfr'>('instructions');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col font-mono text-xs overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0d1117]">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-slate-100">Tra Cứu Nhanh 8051 &amp; Phím Tắt</span>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('instructions')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'instructions' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tập Lệnh 8051
              </button>
              <button
                onClick={() => setActiveTab('sfr')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'sfr' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bảng SFR &amp; Bit
              </button>
              <button
                onClick={() => setActiveTab('shortcuts')}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  activeTab === 'shortcuts' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Phím Tắt Vẽ Mạch
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 text-sm">
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 text-slate-300 space-y-4">
          {activeTab === 'instructions' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-cyan-400 text-sm mb-2">1. Nhóm Lệnh Chuyển Dữ Liệu (Data Transfer)</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">MOV destination, source</div>
                    <div>Chuyển byte dữ liệu: MOV A, #data | MOV Rn, direct | MOV direct, A</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">MOVC A, @A+DPTR / @A+PC</div>
                    <div>Đọc dữ liệu từ bộ nhớ mã ROM (Look-up Table).</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">PUSH direct / POP direct</div>
                    <div>Đẩy vào / Lấy ra khỏi ngăn xếp Stack (SP tăng/giảm).</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">XCH A, operand / XCHD A, @Ri</div>
                    <div>Hoán đổi giá trị A với byte bộ nhớ / hoán đổi 4-bit thấp.</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-cyan-400 text-sm mb-2">2. Nhóm Lệnh Số Học (Arithmetic)</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">ADD / ADDC A, operand</div>
                    <div>Cộng không nhớ / Có nhớ CY vào thanh ghi A. Cập nhật CY, AC, OV.</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">SUBB A, operand</div>
                    <div>Trừ có mượn CY: A = A - operand - CY. Cập nhật CY, AC, OV.</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">INC operand / DEC operand</div>
                    <div>Tăng / Giảm 1 đơn vị (không làm ảnh hưởng cờ CY).</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">MUL AB / DIV AB</div>
                    <div>Nhân: A*B (High vào B, Low vào A) | Chia: A/B (Thương vào A, Dư vào B).</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-cyan-400 text-sm mb-2">3. Nhóm Lệnh Logic &amp; Thao Tác Bit</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">ANL / ORL / XRL destination, source</div>
                    <div>Phép AND, OR, XOR bit mức byte hoặc bit đơn.</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">CLR bit / SETB bit / CPL bit</div>
                    <div>Xóa về 0 / Đặt lên 1 / Đảo bit (Ví dụ: SETB P1.0 | CPL C).</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">RL A / RLC A / RR A / RRC A / SWAP A</div>
                    <div>Dịch vòng trái/phải không nhớ hoặc qua cờ CY | Đổi 2 nibble.</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-cyan-400 text-sm mb-2">4. Nhóm Lệnh Rẽ Nhánh &amp; Điều Khiển</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">SJMP rel / LJMP addr16 / AJMP addr11</div>
                    <div>Nhảy ngắn tương đối (-128..+127) | Nhảy tuyệt đối 64KB | Nhảy trang 2KB.</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">LCALL addr16 / ACALL addr11 / RET / RETI</div>
                    <div>Gọi chương trình con / Gọi ngắt / Trở về / Trở về từ ngắt.</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">JZ rel / JNZ rel / JC rel / JNC rel</div>
                    <div>Nhảy nếu A = 0 / A != 0 / CY = 1 / CY = 0.</div>
                  </div>
                  <div className="bg-[#0d1117] p-2 rounded border border-slate-800">
                    <div className="text-amber-300 font-bold">CJNE op1, op2, rel / DJNZ op, rel</div>
                    <div>So sánh và nhảy nếu khác nhau | Giảm 1 và nhảy nếu khác 0.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sfr' && (
            <div className="space-y-3 text-[11px]">
              <div className="font-semibold text-cyan-400 mb-1">Bảng Địa Chỉ Thanh Ghi Chức Năng Đặc Biệt (SFR)</div>
              <table className="w-full text-left border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-[#0d1117] text-slate-400">
                    <th className="p-1.5 border border-slate-800">Tên</th>
                    <th className="p-1.5 border border-slate-800">Địa Chỉ</th>
                    <th className="p-1.5 border border-slate-800">Định Địa Chỉ Bit</th>
                    <th className="p-1.5 border border-slate-800">Ý Nghĩa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1.5 border border-slate-800 text-amber-300 font-bold">ACC (A)</td>
                    <td className="p-1.5 border border-slate-800">0E0H</td>
                    <td className="p-1.5 border border-slate-800 text-emerald-400">Có (ACC.0 - ACC.7)</td>
                    <td className="p-1.5 border border-slate-800">Thanh ghi tích lũy</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border border-slate-800 text-amber-300 font-bold">B</td>
                    <td className="p-1.5 border border-slate-800">0F0H</td>
                    <td className="p-1.5 border border-slate-800 text-emerald-400">Có (B.0 - B.7)</td>
                    <td className="p-1.5 border border-slate-800">Thanh ghi phụ cho MUL/DIV</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border border-slate-800 text-cyan-300 font-bold">P0, P1, P2, P3</td>
                    <td className="p-1.5 border border-slate-800">80H, 90H, A0H, B0H</td>
                    <td className="p-1.5 border border-slate-800 text-emerald-400">Có (P1.0 - P1.7...)</td>
                    <td className="p-1.5 border border-slate-800">4 Cổng vào ra I/O Ports</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border border-slate-800 text-cyan-300 font-bold">PSW</td>
                    <td className="p-1.5 border border-slate-800">0D0H</td>
                    <td className="p-1.5 border border-slate-800 text-emerald-400">Có (CY, AC, F0, RS1, RS0, OV, P)</td>
                    <td className="p-1.5 border border-slate-800">Từ trạng thái chương trình</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border border-slate-800 text-slate-300 font-bold">TCON / TMOD</td>
                    <td className="p-1.5 border border-slate-800">88H / 89H</td>
                    <td className="p-1.5 border border-slate-800">TCON có (TR0, TF0...), TMOD không</td>
                    <td className="p-1.5 border border-slate-800">Điều khiển &amp; Chế độ Timer 0/1</td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border border-slate-800 text-slate-300 font-bold">IE / IP</td>
                    <td className="p-1.5 border border-slate-800">0A8H / 0B8H</td>
                    <td className="p-1.5 border border-slate-800 text-emerald-400">Có (EA, ET0, EX0...)</td>
                    <td className="p-1.5 border border-slate-800">Cho phép &amp; Ưu tiên ngắt</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-3 text-[11px]">
              <div className="font-semibold text-cyan-400 mb-1">Thao Tác Đi Dây &amp; Bản Vẽ (SimulIDE Style)</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0d1117] p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">Đi Dây (Wiring)</div>
                  <div>• <b>Bắt đầu dây:</b> Nhấp chuột trái vào chân linh kiện (vòng tròn pin).</div>
                  <div>• <b>Gấp khúc vuông góc:</b> Nhấp chuột trái vào khoảng trống bất kỳ trên canvas.</div>
                  <div>• <b>Kết thúc dây:</b> Nhấp chuột trái vào chân linh kiện đích hoặc dây khác.</div>
                  <div>• <b>Hủy đi dây:</b> Nhấn phím <b>Escape</b>.</div>
                </div>

                <div className="bg-[#0d1117] p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">Thao Tác Linh Kiện</div>
                  <div>• <b>Xoay linh kiện 90°:</b> Nhấn phím <b>R</b> khi linh kiện đang được chọn.</div>
                  <div>• <b>Xóa linh kiện / Dây:</b> Phím <b>Delete</b> hoặc <b>Backspace</b>.</div>
                  <div>• <b>Kéo di chuyển:</b> Giữ chuột trái trên thân linh kiện rồi kéo; dây tự bám theo.</div>
                  <div>• <b>Tương tác nút bấm:</b> Nhấp chuột trực tiếp lên nút nhấn hoặc công tắc.</div>
                </div>

                <div className="bg-[#0d1117] p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">Góc Nhìn &amp; Zoom</div>
                  <div>• <b>Cuộn thu phóng (Zoom):</b> Lăn con lăn chuột (Mouse wheel).</div>
                  <div>• <b>Di chuyển vùng nhìn (Pan):</b> Giữ chuột giữa (Scroll button) hoặc Alt + Kéo.</div>
                  <div>• <b>Về tỷ lệ 100%:</b> Nút [1:1] ở góc trên bên phải canvas.</div>
                </div>

                <div className="bg-[#0d1117] p-3 rounded border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">Soạn Thảo Mã &amp; Debug</div>
                  <div>• <b>Đặt Điểm Dừng (Breakpoint):</b> Nhấp vào số dòng ở lề trái editor.</div>
                  <div>• <b>Phím Tab:</b> Tự động thụt lề 4 khoảng trắng.</div>
                  <div>• <b>Dòng đang thực thi:</b> Nổi bật vạch vàng kim chỉ thị vị trí con trỏ PC.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#0d1117] border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 transition-colors font-medium text-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
