# Trình Mô Phỏng Vi Điều Khiển 8051 & Mạch Điện Tử Trực Quan (SimulIDE Web)

Ứng dụng web tĩnh (Zero-Backend) hoàn chỉnh mô phỏng tập lệnh vi điều khiển Intel 8051 với trình biên dịch Assembly hai lượt, bộ giải mạch điện tử MNA (Modified Nodal Analysis) tương tác thời gian thực, và không gian vẽ mạch/đi dây trực quan theo phong cách SimulIDE.

### User Review & Critical Decisions

> [!IMPORTANT]
> **Các quyết định kiến trúc đã thống nhất với người dùng:**
> - **Linh kiện mở rộng**: Bổ sung ngay LED 7 đoạn (Anode chung & Cathode chung) và Loa chip Buzzer vào palette linh kiện bên cạnh 11 linh kiện chuẩn (Chip 8051, LED, Điện trở, BJT NPN, Diode, Nguồn Vcc, Ground, Nút nhấn, Công tắc gạt, Ampe kế, Vôn kế).
> - **Trình soạn thảo mã nguồn Assembly**: Tự lập trình bộ editor nhẹ tích hợp, hỗ trợ đánh số dòng, tô màu cú pháp (syntax highlighting), ghim điểm dừng (breakpoint gutter), và tô sáng dòng lệnh đang thực thi trực tiếp – 100% độc lập, không phụ thuộc kết nối CDN bên ngoài.
> - **Chế độ cổng I/O mặc định**: Chế độ "Dễ" (Easy Mode) kích hoạt mặc định để người học kết nối LED trực tiếp qua điện trở là sáng ngay, đồng thời có nút chuyển sang chế độ "Thực tế" (Realistic Mode: P0 open-drain hi-Z, P1/P3 weak pull-up ~30kΩ) trong bảng thuộc tính chip.
> - **Chạy thuần Web Tĩnh (Static Web)**: 100% client-side, tương thích hoàn toàn khi mở trực tiếp hay deploy lên Vercel / GitHub Pages mà không cần cấu hình build phức tạp.

---

### 1. Overview & Core Concept

- **Mục tiêu**: Cung cấp môi trường thực hành lập trình hợp ngữ 8051 (Assembly 8051) trực quan nhất cho sinh viên, kỹ sư điện tử và người tự học mà không cần cài đặt phần mềm nặng như Keil C hay Proteus.
- **Trải nghiệm cốt lõi**:
  1. Kéo thả chip 8051 DIP-40 và linh kiện (LED, nút bấm, điện trở, transistor, nguồn, ampe/vôn kế) vào bảng mạch.
  2. Đi dây (wiring) mượt mà với tính năng tự bẻ góc vuông (Manhattan routing), tạo điểm nối ngã ba (junction dot), đổi màu dây, và làm sáng toàn bộ mạng điện (net highlighting).
  3. Soạn thảo mã Assembly với gợi ý chỉ thị (ORG, EQU, END...) và tập lệnh 8051.
  4. Bấm **Assemble** để biên dịch 2 lượt (two-pass), xem bảng Listing và mã máy Hex.
  5. Bấm **Run** hoặc **Step** để quan sát từng lệnh chạy, chu kỳ máy, thanh ghi A, B, R0-R7, PSW, RAM nội 128-byte và trạng thái đèn LED, dòng điện ampe kế biến đổi tức thì.

---

### 2. User Experience & Visual Design

#### Bố cục giao diện Dark Theme chuyên nghiệp (1440px Baseline)
- **Top Bar**:
  - Trái: Nhãn hệ thống `8051 Circuit Simulator`.
  - Giữa: Bộ nút điều khiển mô phỏng (`Assemble`, `Run`, `Pause`, `Step`, `Step Over`, `Reset`), chọn tốc độ (`0.01x`, `0.1x`, `1x Thật`, `10x`, `Tối đa`), nạp 8 bài tập mẫu (`Examples`).
  - Phải: Nút `Lưu Project`, `Tải Project JSON`, `Tải mã .HEX`, `Phím tắt & Tra cứu`.
- **Khu vực Trái (Palette Linh Kiện)**:
  - Danh mục linh kiện trực quan: Vi điều khiển (8051), Thụ động & Nguồn (Vcc, GND, Resistor, Diode), Bán dẫn (NPN BJT), Tương tác & Hiển thị (Button, Switch, LED, LED 7 đoạn, Buzzer), Thiết bị đo (Voltmeter, Ammeter).
  - Kéo thả mượt mà vào Canvas, kèm phím xoay `R`, lật, xóa `Del`.
- **Khu vực Giữa (Schematic Canvas - SVG Engine)**:
  - Lưới tọa độ vô hạn (Infinite Grid), zoom bằng chuột lăn (`Wheel`), pan bằng kéo chuột giữa hoặc `Space + Drag`.
  - Dây dẫn kiểu SimulIDE: click chân bắt đầu, click gấp khúc, click chân kết thúc; junction dots màu xanh/đỏ; hiển thị tooltip điện áp/dòng điện khi rê chuột.
- **Khu vực Phải (Split Tabs: Editor Assembly & Bảng Thuộc Tính)**:
  - **Tab 1 - Assembly Editor**: Đánh số dòng, click vào lề để đặt Breakpoint, tô màu chỉ thị/nhãn/toán hạng, highlight dòng sắp thực thi (màu vàng kim), báo dòng lỗi cú pháp (màu đỏ).
  - **Tab 2 - Component Inspector**: Thay đổi giá trị điện trở ($\Omega, k\Omega, M\Omega$), điện áp thuận $V_f$ của LED, màu phát sáng, thông số $h_{FE}, V_{be}, V_{ce}$ của BJT, tần số thạch anh chip (12 MHz, 11.0592 MHz, 24 MHz), chế độ cổng Dễ/Thực tế.
- **Khu vực Dưới (Console & Status Monitors)**:
  - **Console Log**: 4 cấp độ `[INFO]`, `[OK]`, `[CẢNH BÁO]`, `[LỖI]` kèm mốc thời gian $\mu s/ms/s$.
  - **Panels**: Bảng thanh ghi (A, B, R0-R7, DPTR, SP, PC, PSW các cờ CY, AC, OV, P), Bảng 128 Byte RAM nội (Hex Grid tương tác, nhấp nháy ô nhớ vừa thay đổi), Bảng SFR & Cổng P0-P3, Bảng Timer T0/T1 & Cấu hình Ngắt IE/IP.

---

### 3. Key Product Decisions & Trade-Offs

- **Quyết định 1: Lõi CPU 8051 thuần JavaScript không qua WebAssembly**
  - *Lý do*: Đảm bảo khả năng chạy tức thì trên mọi trình duyệt, dễ dàng step từng lệnh, bắt lỗi runtime chính xác, và cập nhật phản hồi UI với độ trễ $<1\text{ms}$. Triển khai toàn bộ 111 lệnh chuẩn (255 opcode), quản lý cờ PSW tự động (chẵn lẻ Parity theo A), 4 Bank thanh ghi, 2 Timer đa chế độ và hệ thống ngắt vector ưu tiên.
- **Quyết định 2: Bộ giải mạch MNA (Modified Nodal Analysis) kết hợp Newton-Raphson theo sự kiện**
  - *Lý do*: Nếu giải toàn bộ ma trận nút điện ở mỗi chu kỳ máy (1 $\mu s$), trình duyệt sẽ bị giật lag. Bằng cách sử dụng cơ chế *Event-Driven Circuit Solver*, mạch chỉ giải lại khi: chân xuất MCU thay đổi giá trị logic, nút bấm/công tắc được nhấn, hoặc thông số linh kiện bị sửa đổi. Đối với linh kiện phi tuyến (LED, Diode, BJT), thuật toán lặp Newton-Raphson với giới hạn 15 bước lặp đảm bảo hội tụ nhanh chóng và mượt mà.
- **Quyết định 3: Đi dây SVG trực tiếp với thuật toán Union-Find gom Net**
  - *Lý do*: Cho phép người dùng kéo đoạn dây, click junction ngã ba, chọn màu dây, xóa từng nhánh hoặc cả mạng, đồng thời bộ giải mạch chỉ cần truy vấn cấu trúc dữ liệu Union-Find để xác định các chân kết nối chung nút điện tích cực.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Top Navigation Bar                              │
│  [Assemble] [Run / Pause] [Step] [Speed: 1x] [Examples] [Export HEX]  │
└────────────────────────────────────────────────────────────────────────┘
┌──────────────┬──────────────────────────────────────────┬──────────────┐
│  Component   │         Schematic Canvas (SVG)           │ Assembly IDE │
│   Palette    │  ┌────────────────────────────────────┐  │ & Inspector  │
│              │  │  [8051 DIP-40] ──[Resistor]──[LED] │  │ ┌──────────┐ │
│ • 8051 MCU   │  │    P1.0 ───────(Junction)          │  │ │ORG 0000H │ │
│ • Resistor   │  │    P1.7 ───────[Push Button]──GND  │  │ │MOV P1,#0 │ │
│ • LED / 7Seg │  │                                    │  │ │SJMP $    │ │
│ • Diode/BJT  │  │  Zoom / Pan / Orthogonal Wiring    │  │ └──────────┘ │
│ • Vcc / GND  │  └────────────────────────────────────┘  │ [Properties] │
├──────────────┴──────────────────────────────────────────┴──────────────┤
│ Bottom Dock: [Console Log] [Registers & PSW] [128B RAM] [Timers & I/O] │
└────────────────────────────────────────────────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌──────────────────────┐                    ┌──────────────────────┐
│      CPU 8051        │  Pin State Events  │    Circuit Solver    │
│ • 111 Instructions   │───────────────────▶│ • MNA Matrix Engine  │
│ • Timers 0 & 1       │                    │ • Newton-Raphson     │
│ • Interrupt Vectors  │◀───────────────────│ • Branch Currents /  │
│ • 128B RAM / SFRs    │   Input Voltage    │   Node Voltages      │
└──────────────────────┘                    └──────────────────────┘
```

#### Cấu trúc dữ liệu chính:
- **MCU State**: `pc`, `sp`, `a`, `b`, `dptr`, `psw`, `ram: Uint8Array(128)`, `sfr: Uint8Array(128)`, `rom: Uint8Array(65536)`, `cycles: number`, `breakpoints: Set<number>`.
- **Circuit Schematic**:
  - `components: Array<{ id, type, x, y, rotation, props, pins: [{ id, name, relX, relY }] }>`
  - `wires: Array<{ id, color, points: [{ x, y }], fromPin?: { compId, pinId }, toPin?: { compId, pinId }, junctions: [] }>`
  - `netlist: Map<nodeId, Array<PinReference>>`
- **Two-Pass Assembler**:
  - Pass 1: Quét nhãn, tính Program Counter (PC), ghi nhận bảng ký hiệu Symbol Table, kiểm tra chồng lấn ORG.
  - Pass 2: Sinh mã máy Bytecode, tính toán cự ly nhảy tương đối (-128..+127 cho SJMP/DJNZ/CJNE), sinh bảng Listing và xuất định dạng Intel HEX.

---

### 5. Kế hoạch triển khai mã nguồn & 8 bài mẫu kiểm thử chuẩn

1. **Lõi CPU 8051 & Ngoại vi (`cpu8051.ts`)**:
   - Khởi tạo bảng 255 opcodes đầy đủ không thiếu lệnh nào.
   - Quản lý Timer 0 & 1 (Mode 0, 1, 2, 3), đếm chu kỳ máy và ngắt ngoài INT0/INT1/T0/T1.
2. **Trình biên dịch Assembly 8051 (`assembler.ts`)**:
   - Trình phân tích từ vựng (tokenizer) nhận diện chữ số hex, bin, dec, ký tự, nhãn, các thanh ghi và bit chuẩn (P1.0, TR0, TF0, EA...).
   - Báo lỗi chi tiết số dòng kèm gợi ý sửa lỗi rõ ràng.
3. **Bộ giải mạch điện tử MNA (`circuitSolver.ts`)**:
   - Lập ma trận dẫn nạp G và vector dòng I, mở rộng hàng cho nguồn điện áp và ampe kế.
   - Giải nút điện và tính toán dòng qua LED, độ sụt áp qua điện trở, trạng thái dẫn/ngắt của transistor BJT.
4. **Hệ thống Schematic & Đi dây (`schematicEngine.ts` & Canvas/SVG)**:
   - Đi dây trực quan với phím Esc hủy, click thêm điểm gập, gắn junction ngã ba, chọn dây và xóa dây.
   - Di chuyển linh kiện thì dây tự bám theo các chân (pin tracking).
5. **Giao diện Editor, Bảng Điều Khiển & Debugger (`App.tsx` & components)**:
   - Trình soạn thảo nhẹ tích hợp đầy đủ số dòng, highlight, breakpoint.
   - Hex viewer cho 128 byte RAM nội có chức năng click sửa trực tiếp và đổi màu ô vừa được CPU ghi vào.
6. **Thư viện 8 bài mẫu hoàn chỉnh sẵn sàng 1-click**:
   - Mẫu 1: Nhấp nháy LED P1.0 bằng vòng lặp DJNZ lồng nhau.
   - Mẫu 2: LED chạy tuần tự 8 LED trên cổng P1 với lệnh RL A / RR A.
   - Mẫu 3: Đọc nút nhấn tại P1.7 để bật/tắt LED tại P1.0.
   - Mẫu 4: Định thời chính xác 1 giây dùng Timer0 Mode 1 quét cờ TF0.
   - Mẫu 5: Ngắt Timer0 (ISR tại địa chỉ 000BH) đảo trạng thái LED.
   - Mẫu 6: Ngắt ngoài INT0 kích hoạt bởi nút bấm chân P3.2.
   - Mẫu 7: Transistor BJT NPN đệm dòng kéo LED, đo bằng Ampe kế và Vôn kế.
   - Mẫu 8: Bộ đếm nhị phân 0-255 xuất ra 8 LED ở P1 dùng thanh ghi A và R.
