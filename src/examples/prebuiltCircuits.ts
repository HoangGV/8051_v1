/**
 * Pre-built 8051 Circuits & Assembly Source Examples
 * 1. Blink LED on P1.0 (DJNZ delay loop)
 * 2. 8-LED Chaser on P1 (RL A / RR A)
 * 3. Button at P1.7 controlling LED at P1.0
 * 4. Accurate 1s Delay with Timer 0 Mode 1 (16-bit)
 * 5. Timer 0 Interrupt (Vector 000BH) Blinking LED
 * 6. External Interrupt INT0 on P3.2 toggles LED
 * 7. NPN BJT driving LED with Ammeter and Voltmeter
 * 8. 8-bit Binary Counter 0-255 on P1 LEDs
 * 9. 7-Segment Display 0-9 Counter on P0 (MOVC A, @A+DPTR)
 */

import { CircuitComponent, PrebuiltExample, Wire } from '../types';

export const createMcuComponent = (x: number, y: number): CircuitComponent => {
  const pins = [];
  // P1.0 - P1.7 on Left side top
  for (let i = 0; i < 8; i++) {
    pins.push({
      id: `p1_${i}`,
      name: `P1.${i}`,
      relX: 0,
      relY: 40 + i * 25,
      dir: 'bidir' as const,
    });
  }
  // RST
  pins.push({
    id: 'rst',
    name: 'RST',
    relX: 0,
    relY: 260,
    dir: 'input' as const,
  });
  // P3.2 - P3.5
  pins.push({ id: 'p3_2', name: 'P3.2 (INT0)', relX: 0, relY: 300, dir: 'bidir' as const });
  pins.push({ id: 'p3_3', name: 'P3.3 (INT1)', relX: 0, relY: 325, dir: 'bidir' as const });
  pins.push({ id: 'p3_4', name: 'P3.4 (T0)', relX: 0, relY: 350, dir: 'bidir' as const });
  pins.push({ id: 'p3_5', name: 'P3.5 (T1)', relX: 0, relY: 375, dir: 'bidir' as const });

  // P0.0 - P0.7 on Right side
  for (let i = 0; i < 8; i++) {
    pins.push({
      id: `p0_${i}`,
      name: `P0.${i}`,
      relX: 180,
      relY: 40 + i * 25,
      dir: 'bidir' as const,
    });
  }

  return {
    id: 'u1',
    type: 'mcu8051',
    name: 'AT89C51',
    x,
    y,
    rotation: 0,
    props: {
      voltage: 5.0,
      fOscHz: 12000000,
    },
    pins,
  };
};

export const PREBUILT_EXAMPLES: PrebuiltExample[] = [
  // 1. BLINK LED P1.0
  {
    id: 'ex1_blink',
    title: '1. Nhấp nháy LED tại P1.0 (Vòng lặp DJNZ)',
    category: 'Cơ bản',
    description: 'Chớp tắt LED ở chân P1.0 dùng 2 vòng lặp DJNZ lồng nhau. Thạch anh 12MHz cho thời gian delay trực quan.',
    sourceCode: `; ============================================
; Ví dụ 1: Nhấp nháy LED tại P1.0 dùng DJNZ
; Thạch anh: 12 MHz (1 chu kỳ máy = 1 micro giây)
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    MOV P1, #0FFH       ; Khởi tạo cổng P1 mức cao

LOOP:
    CPL P1.0            ; Đảo trạng thái LED tại P1.0
    ACALL DELAY         ; Gọi hàm trễ
    SJMP LOOP           ; Lặp vô tận

; --------------------------------------------
; Hàm trễ dùng 2 vòng lặp DJNZ lồng nhau
; Thời gian ~ 250 x 200 x 2 us ~ 100 ms
; --------------------------------------------
DELAY:
    MOV R6, #250
D1:
    MOV R7, #200
D2:
    DJNZ R7, D2         ; 2 chu kỳ máy
    DJNZ R6, D1
    RET

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        {
          id: 'r1',
          type: 'resistor',
          name: 'R1',
          x: 420,
          y: 130,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led1',
          type: 'led',
          name: 'LED1',
          x: 540,
          y: 130,
          rotation: 0,
          props: { color: 'green', vf: 2.1, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'gnd1',
          type: 'gnd',
          name: 'GND',
          x: 640,
          y: 140,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        {
          id: 'w1',
          points: [
            { x: 180, y: 140 },
            { x: 140, y: 140 },
            { x: 140, y: 70 },
            { x: 420, y: 70 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_0' },
          toPin: { compId: 'r1', pinId: 'pin1' },
          color: '#38bdf8',
        },
        {
          id: 'w2',
          points: [
            { x: 490, y: 140 },
            { x: 540, y: 140 },
          ],
          fromPin: { compId: 'r1', pinId: 'pin2' },
          toPin: { compId: 'led1', pinId: 'anode' },
          color: '#38bdf8',
        },
        {
          id: 'w3',
          points: [
            { x: 590, y: 140 },
            { x: 655, y: 140 },
          ],
          fromPin: { compId: 'led1', pinId: 'cathode' },
          toPin: { compId: 'gnd1', pinId: 'gnd' },
          color: '#64748b',
        },
      ],
    },
  },

  // 2. 8-LED CHASER
  {
    id: 'ex2_chaser',
    title: '2. Đèn LED chạy (Chaser) 8 LED trên cổng P1',
    category: 'Cơ bản',
    description: 'Sử dụng lệnh dịch vòng RL A để tạo hiệu ứng LED chạy đuổi từ P1.0 đến P1.7 liên tục.',
    sourceCode: `; ============================================
; Ví dụ 2: 8 LED Chaser trên Port 1 (RL A)
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    MOV A, #0FEH        ; Bật sáng LED đầu tiên (mức 0 sáng LED)

CHASE_LOOP:
    MOV P1, A           ; Xuất ra 8 LED tại cổng P1
    ACALL SHORT_DELAY   ; Chờ quan sát
    RL A                ; Dịch vòng sang trái 1 bit
    SJMP CHASE_LOOP     ; Tiếp tục vòng lặp

; --------------------------------------------
SHORT_DELAY:
    MOV R5, #120
L1:
    MOV R6, #150
L2:
    DJNZ R6, L2
    DJNZ R5, L1
    RET

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        // 8 LEDs connected to P1.0 - P1.7
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `led_${i}`,
          type: 'led' as const,
          name: `D${i}`,
          x: 420,
          y: 130 + i * 25,
          rotation: 0,
          props: { color: i % 2 === 0 ? 'red' : 'yellow', vf: 1.9, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        })),
        {
          id: 'vcc1',
          type: 'vcc',
          name: 'VCC',
          x: 520,
          y: 110,
          rotation: 0,
          props: { voltage: 5.0 },
          pins: [{ id: 'pin1', name: 'VCC', relX: 15, relY: 25 }],
        },
      ],
      wires: [
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `w_p1_${i}`,
          points: [
            { x: 180, y: 140 + i * 25 },
            { x: 420, y: 140 + i * 25 },
          ],
          fromPin: { compId: 'u1', pinId: `p1_${i}` },
          toPin: { compId: `led_${i}`, pinId: 'anode' },
          color: '#38bdf8',
        })),
        // Common ground for cathodes
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `w_gnd_${i}`,
          points: [
            { x: 470, y: 140 + i * 25 },
            { x: 470, y: 140 + (i + 1) * 25 },
          ],
          color: '#64748b',
        })),
        {
          id: 'w_gnd_final',
          points: [
            { x: 470, y: 315 },
            { x: 535, y: 315 },
          ],
          color: '#64748b',
        },
      ],
    },
  },

  // 3. BUTTON P1.7 CONTROLLING LED P1.0
  {
    id: 'ex3_button',
    title: '3. Đọc nút bấm tại P1.7 điều khiển LED P1.0',
    category: 'I/O Ngoại vi',
    description: 'Thao tác chuẩn Quasi-bidirectional: ghi mức 1 vào chân P1.7 trước khi đọc, bấm nút nhấn kéo xuống GND để bật sáng LED.',
    sourceCode: `; ============================================
; Ví dụ 3: Đọc nút bấm tại P1.7 điều khiển LED P1.0
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    SETB P1.7           ; BẮT BUỘC: Ghi 1 vào latch để chuẩn bị đọc input
    CLR P1.0            ; Tắt LED ban đầu

CHECK_BUTTON:
    JNB P1.7, PRESSED   ; Nếu P1.7 = 0 (nút được bấm) nhảy tới PRESSED
    
    ; Nút đang nhả (mức 1) -> Tắt LED
    CLR P1.0
    SJMP CHECK_BUTTON

PRESSED:
    ; Nút đang nhấn (mức 0) -> Bật sáng LED
    SETB P1.0
    SJMP CHECK_BUTTON

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        // Button connected to P1.7
        {
          id: 'btn1',
          type: 'button',
          name: 'SW_INPUT',
          x: 420,
          y: 305,
          rotation: 0,
          props: { pressed: false },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 60, relY: 10 },
          ],
        },
        {
          id: 'gnd_btn',
          type: 'gnd',
          name: 'GND',
          x: 520,
          y: 315,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
        // LED at P1.0
        {
          id: 'r_led',
          type: 'resistor',
          name: 'R1',
          x: 420,
          y: 130,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led_out',
          type: 'led',
          name: 'LED_OUT',
          x: 530,
          y: 130,
          rotation: 0,
          props: { color: 'blue', vf: 2.8, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'gnd_led',
          type: 'gnd',
          name: 'GND',
          x: 620,
          y: 140,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        // P1.7 to Button
        {
          id: 'w_b1',
          points: [
            { x: 180, y: 315 },
            { x: 420, y: 315 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_7' },
          toPin: { compId: 'btn1', pinId: 'pin1' },
          color: '#f59e0b',
        },
        // Button to GND
        {
          id: 'w_b2',
          points: [
            { x: 480, y: 315 },
            { x: 535, y: 315 },
          ],
          fromPin: { compId: 'btn1', pinId: 'pin2' },
          toPin: { compId: 'gnd_btn', pinId: 'gnd' },
          color: '#64748b',
        },
        // P1.0 to R1
        {
          id: 'w_l1',
          points: [
            { x: 180, y: 140 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_0' },
          toPin: { compId: 'r_led', pinId: 'pin1' },
          color: '#38bdf8',
        },
        // R1 to LED
        {
          id: 'w_l2',
          points: [
            { x: 490, y: 140 },
            { x: 530, y: 140 },
          ],
          fromPin: { compId: 'r_led', pinId: 'pin2' },
          toPin: { compId: 'led_out', pinId: 'anode' },
          color: '#38bdf8',
        },
        // LED to GND
        {
          id: 'w_l3',
          points: [
            { x: 580, y: 140 },
            { x: 635, y: 140 },
          ],
          fromPin: { compId: 'led_out', pinId: 'cathode' },
          toPin: { compId: 'gnd_led', pinId: 'gnd' },
          color: '#64748b',
        },
      ],
    },
  },

  // 4. TIMER0 MODE 1 (16-BIT) DELAY 1S
  {
    id: 'ex4_timer0_polling',
    title: '4. Delay chuẩn 1 giây bằng Timer 0 Mode 1 (16-bit)',
    category: 'Timer & Định thời',
    description: 'Sử dụng Timer 0 ở Mode 1 (16-bit) tạo trễ 50ms x 20 lần = đúng 1.000.000 us (1 giây) tại tần số 12 MHz.',
    sourceCode: `; ============================================
; Ví dụ 4: Định thời chính xác 1s bằng Timer 0 Mode 1
; Nạp 65536 - 50000 = 15536 = 3CB0H
; 50ms x 20 lần = 1 Giây
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    MOV TMOD, #01H      ; Timer 0: Mode 1 (16-bit Timer)

MAIN_LOOP:
    CPL P1.0            ; Đảo trạng thái chân P1.0
    ACALL DELAY_1S      ; Trễ đúng 1 giây
    SJMP MAIN_LOOP

; --------------------------------------------
DELAY_1S:
    MOV R2, #20         ; Lặp 20 lần 50ms
T0_50MS:
    MOV TH0, #3CH       ; Nạp byte cao của 3CB0H
    MOV TL0, #0B0H      ; Nạp byte thấp của 3CB0H
    SETB TR0            ; Khởi động Timer 0

WAIT_TF0:
    JNB TF0, WAIT_TF0   ; Chờ cờ tràn TF0 được dựng lên (50ms)
    
    CLR TR0             ; Tắt Timer 0
    CLR TF0             ; Xóa cờ tràn
    DJNZ R2, T0_50MS    ; Giảm bộ đếm 20 lần
    RET

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        {
          id: 'r_t0',
          type: 'resistor',
          name: 'R1',
          x: 420,
          y: 130,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led_t0',
          type: 'led',
          name: 'LED1',
          x: 530,
          y: 130,
          rotation: 0,
          props: { color: 'green', vf: 2.1, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'gnd_t0',
          type: 'gnd',
          name: 'GND',
          x: 620,
          y: 140,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        {
          id: 'w1',
          points: [
            { x: 180, y: 140 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_0' },
          toPin: { compId: 'r_t0', pinId: 'pin1' },
          color: '#38bdf8',
        },
        {
          id: 'w2',
          points: [
            { x: 490, y: 140 },
            { x: 530, y: 140 },
          ],
          fromPin: { compId: 'r_t0', pinId: 'pin2' },
          toPin: { compId: 'led_t0', pinId: 'anode' },
          color: '#38bdf8',
        },
        {
          id: 'w3',
          points: [
            { x: 580, y: 140 },
            { x: 635, y: 140 },
          ],
          fromPin: { compId: 'led_t0', pinId: 'cathode' },
          toPin: { compId: 'gnd_t0', pinId: 'gnd' },
          color: '#64748b',
        },
      ],
    },
  },

  // 5. TIMER 0 INTERRUPT (ISR 000BH)
  {
    id: 'ex5_timer0_isr',
    title: '5. Ngắt Timer 0 (ISR tại 000BH) đảo trạng thái LED',
    category: 'Ngắt (Interrupt)',
    description: 'Sử dụng ngắt phần cứng Timer 0 (vector 000BH) để đảo LED tự động, chương trình chính tự do làm việc khác.',
    sourceCode: `; ============================================
; Ví dụ 5: Ngắt Timer 0 (Vector 000BH) đảo LED
; ============================================
    ORG 0000H
    LJMP MAIN

    ; Vector ngắt Timer 0
    ORG 000BH
    LJMP TIMER0_ISR

    ORG 0030H
MAIN:
    MOV TMOD, #01H      ; Timer 0 Mode 1 (16-bit)
    MOV TH0, #3CH       ; Nạp giá trị ban đầu 50ms (3CB0H)
    MOV TL0, #0B0H
    
    SETB ET0            ; Bật ngắt Timer 0
    SETB EA             ; Cho phép ngắt toàn cục
    SETB TR0            ; Kích hoạt Timer 0

IDLE_LOOP:
    SJMP IDLE_LOOP      ; CPU ở chế độ rảnh rỗi chờ ngắt

; --------------------------------------------
; Trình phục vụ ngắt Timer 0 (ISR)
; --------------------------------------------
TIMER0_ISR:
    ; Nạp lại giá trị cho 16-bit Mode 1
    MOV TH0, #3CH
    MOV TL0, #0B0H
    CPL P1.0            ; Đảo trạng thái LED
    RETI                ; Trở về từ ngắt và khôi phục cờ

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        {
          id: 'r1',
          type: 'resistor',
          name: 'R1',
          x: 420,
          y: 130,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led1',
          type: 'led',
          name: 'LED1',
          x: 530,
          y: 130,
          rotation: 0,
          props: { color: 'red', vf: 1.8, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'gnd1',
          type: 'gnd',
          name: 'GND',
          x: 620,
          y: 140,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        {
          id: 'w1',
          points: [
            { x: 180, y: 140 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_0' },
          toPin: { compId: 'r1', pinId: 'pin1' },
          color: '#38bdf8',
        },
        {
          id: 'w2',
          points: [
            { x: 490, y: 140 },
            { x: 530, y: 140 },
          ],
          fromPin: { compId: 'r1', pinId: 'pin2' },
          toPin: { compId: 'led1', pinId: 'anode' },
          color: '#38bdf8',
        },
        {
          id: 'w3',
          points: [
            { x: 580, y: 140 },
            { x: 635, y: 140 },
          ],
          fromPin: { compId: 'led1', pinId: 'cathode' },
          toPin: { compId: 'gnd1', pinId: 'gnd' },
          color: '#64748b',
        },
      ],
    },
  },

  // 6. EXTERNAL INTERRUPT INT0 (P3.2)
  {
    id: 'ex6_int0',
    title: '6. Nút nhấn kích ngắt ngoài INT0 (P3.2) cạnh xuống',
    category: 'Ngắt (Interrupt)',
    description: 'Bấm nút tại chân P3.2 tạo cạnh xuống kích hoạt ngắt ngoài INT0 (vector 0003H) đảo trạng thái LED ngay tức thì.',
    sourceCode: `; ============================================
; Ví dụ 6: Ngắt ngoài INT0 kích hoạt bởi nút bấm P3.2
; ============================================
    ORG 0000H
    LJMP MAIN

    ; Vector ngắt ngoài INT0
    ORG 0003H
    LJMP EX0_ISR

    ORG 0030H
MAIN:
    SETB IT0            ; Cấu hình ngắt INT0 theo cạnh xuống (Falling Edge)
    SETB EX0            ; Cho phép ngắt ngoài 0
    SETB EA             ; Bật ngắt toàn cục
    
    SETB P3.2           ; Chuẩn bị chân P3.2 làm ngõ vào
    CLR P1.0            ; Tắt LED ban đầu

WAIT_LOOP:
    SJMP WAIT_LOOP      ; Đứng chờ nút bấm kích ngắt

; --------------------------------------------
; Trình phục vụ ngắt ngoài INT0
; --------------------------------------------
EX0_ISR:
    CPL P1.0            ; Đảo trạng thái LED
    RETI                ; Thoát khỏi ngắt

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        // Push button to P3.2
        {
          id: 'btn_int0',
          type: 'button',
          name: 'BTN_INT0',
          x: 420,
          y: 390,
          rotation: 0,
          props: { pressed: false },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 60, relY: 10 },
          ],
        },
        {
          id: 'gnd_int0',
          type: 'gnd',
          name: 'GND',
          x: 520,
          y: 400,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
        // Output LED at P1.0
        {
          id: 'r_out',
          type: 'resistor',
          name: 'R1',
          x: 420,
          y: 130,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led_out',
          type: 'led',
          name: 'LED1',
          x: 530,
          y: 130,
          rotation: 0,
          props: { color: 'blue', vf: 2.8, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'gnd_led',
          type: 'gnd',
          name: 'GND',
          x: 620,
          y: 140,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        // P3.2 to Button
        {
          id: 'w_p32',
          points: [
            { x: 180, y: 400 },
            { x: 420, y: 400 },
          ],
          fromPin: { compId: 'u1', pinId: 'p3_2' },
          toPin: { compId: 'btn_int0', pinId: 'pin1' },
          color: '#ec4899',
        },
        // Button to GND
        {
          id: 'w_bgnd',
          points: [
            { x: 480, y: 400 },
            { x: 535, y: 400 },
          ],
          fromPin: { compId: 'btn_int0', pinId: 'pin2' },
          toPin: { compId: 'gnd_int0', pinId: 'gnd' },
          color: '#64748b',
        },
        // LED wires
        {
          id: 'w1',
          points: [
            { x: 180, y: 140 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_0' },
          toPin: { compId: 'r_out', pinId: 'pin1' },
          color: '#38bdf8',
        },
        {
          id: 'w2',
          points: [
            { x: 490, y: 140 },
            { x: 530, y: 140 },
          ],
          fromPin: { compId: 'r_out', pinId: 'pin2' },
          toPin: { compId: 'led_out', pinId: 'anode' },
          color: '#38bdf8',
        },
        {
          id: 'w3',
          points: [
            { x: 580, y: 140 },
            { x: 635, y: 140 },
          ],
          fromPin: { compId: 'led_out', pinId: 'cathode' },
          toPin: { compId: 'gnd_led', pinId: 'gnd' },
          color: '#64748b',
        },
      ],
    },
  },

  // 7. NPN BJT DRIVER WITH METERS
  {
    id: 'ex7_bjt_driver',
    title: '7. Đệm dòng Transistor BJT NPN + Ampe kế & Vôn kế',
    category: 'Mạch tương tự & Đo đạc',
    description: 'Chân P1.0 qua điện trở Base 1kΩ kích dẫn BJT NPN kéo tải LED từ nguồn 5V. Ampe kế đo dòng tải và Vôn kế đo điện áp Vce.',
    sourceCode: `; ============================================
; Ví dụ 7: Điều khiển BJT NPN đệm dòng kéo LED
; Thể hiện đo dòng Ampe kế và sụt áp Vce Vôn kế
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
LOOP:
    SETB P1.0           ; Xuất 5V vào Base -> BJT Bão hòa (LED sáng rực)
    ACALL DELAY
    CLR P1.0            ; Xuất 0V vào Base -> BJT Ngắt (LED tắt hoàn toàn)
    ACALL DELAY
    SJMP LOOP

; --------------------------------------------
DELAY:
    MOV R4, #200
D1:
    MOV R5, #200
D2:
    DJNZ R5, D2
    DJNZ R4, D1
    RET

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        // Base resistor 1k
        {
          id: 'rb',
          type: 'resistor',
          name: 'Rb (1k)',
          x: 400,
          y: 130,
          rotation: 0,
          props: { resistance: 1000 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        // NPN BJT
        {
          id: 'q1',
          type: 'npn',
          name: 'Q1 (2N2222)',
          x: 520,
          y: 180,
          rotation: 0,
          props: { beta: 100, state: 'Bão hòa' },
          pins: [
            { id: 'b', name: 'B', relX: 0, relY: 25 },
            { id: 'c', name: 'C', relX: 35, relY: 0 },
            { id: 'e', name: 'E', relX: 35, relY: 50 },
          ],
        },
        // Collector load: VCC -> LED -> Collector Resistor -> Ammeter -> Collector
        {
          id: 'vcc_bjt',
          type: 'vcc',
          name: 'VCC (+5V)',
          x: 540,
          y: 20,
          rotation: 0,
          props: { voltage: 5.0 },
          pins: [{ id: 'pin1', name: 'VCC', relX: 15, relY: 25 }],
        },
        {
          id: 'rc',
          type: 'resistor',
          name: 'Rc (220R)',
          x: 520,
          y: 70,
          rotation: 0,
          props: { resistance: 220 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        // Ammeter in series
        {
          id: 'ammeter1',
          type: 'ammeter',
          name: 'Ampe kế Ic',
          x: 620,
          y: 70,
          rotation: 0,
          props: {},
          pins: [
            { id: 'p', name: '+', relX: 0, relY: 15 },
            { id: 'n', name: '-', relX: 60, relY: 15 },
          ],
        },
        // Voltmeter measuring Vce
        {
          id: 'voltmeter1',
          type: 'voltmeter',
          name: 'Vôn kế Vce',
          x: 650,
          y: 210,
          rotation: 0,
          props: {},
          pins: [
            { id: 'p', name: '+', relX: 0, relY: 15 },
            { id: 'n', name: '-', relX: 60, relY: 15 },
          ],
        },
        // Emitter to GND
        {
          id: 'gnd_bjt',
          type: 'gnd',
          name: 'GND',
          x: 540,
          y: 260,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        // P1.0 to Base Resistor
        {
          id: 'wb1',
          points: [
            { x: 180, y: 140 },
            { x: 400, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p1_0' },
          toPin: { compId: 'rb', pinId: 'pin1' },
          color: '#38bdf8',
        },
        // Rb to Base Q1
        {
          id: 'wb2',
          points: [
            { x: 470, y: 140 },
            { x: 500, y: 140 },
            { x: 500, y: 205 },
            { x: 520, y: 205 },
          ],
          fromPin: { compId: 'rb', pinId: 'pin2' },
          toPin: { compId: 'q1', pinId: 'b' },
          color: '#38bdf8',
        },
        // Vcc to Rc
        {
          id: 'wc1',
          points: [
            { x: 555, y: 45 },
            { x: 555, y: 60 },
            { x: 520, y: 60 },
            { x: 520, y: 80 },
          ],
          fromPin: { compId: 'vcc_bjt', pinId: 'pin1' },
          toPin: { compId: 'rc', pinId: 'pin1' },
          color: '#ef4444',
        },
        // Rc to Ammeter
        {
          id: 'wc2',
          points: [
            { x: 590, y: 80 },
            { x: 620, y: 85 },
          ],
          fromPin: { compId: 'rc', pinId: 'pin2' },
          toPin: { compId: 'ammeter1', pinId: 'p' },
          color: '#ef4444',
        },
        // Ammeter to Collector Q1 & Voltmeter +
        {
          id: 'wc3',
          points: [
            { x: 680, y: 85 },
            { x: 680, y: 160 },
            { x: 555, y: 160 },
            { x: 555, y: 180 },
          ],
          fromPin: { compId: 'ammeter1', pinId: 'n' },
          toPin: { compId: 'q1', pinId: 'c' },
          color: '#f59e0b',
        },
        // Voltmeter + connected to Collector
        {
          id: 'wv1',
          points: [
            { x: 555, y: 180 },
            { x: 650, y: 225 },
          ],
          color: '#10b981',
        },
        // Emitter to GND & Voltmeter -
        {
          id: 'we1',
          points: [
            { x: 555, y: 230 },
            { x: 555, y: 260 },
          ],
          fromPin: { compId: 'q1', pinId: 'e' },
          toPin: { compId: 'gnd_bjt', pinId: 'gnd' },
          color: '#64748b',
        },
        {
          id: 'wv2',
          points: [
            { x: 710, y: 225 },
            { x: 710, y: 260 },
            { x: 555, y: 260 },
          ],
          color: '#64748b',
        },
      ],
    },
  },

  // 8. 8-BIT BINARY COUNTER (0-255)
  {
    id: 'ex8_counter',
    title: '8. Bộ đếm nhị phân 0-255 hiển thị ra 8 LED tại cổng P1',
    category: 'Xử lý dữ liệu',
    description: 'Tăng dần giá trị thanh ghi R0 từ 0 đến 255 và xuất mã nhị phân trực tiếp ra 8 LED ở Port 1.',
    sourceCode: `; ============================================
; Ví dụ 8: Bộ đếm 8-bit nhị phân 0-255 trên Port 1
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    MOV R0, #00H        ; Bắt đầu từ 0
    MOV A, #00H

COUNT_LOOP:
    MOV A, R0           ; Đưa giá trị R0 vào A
    CPL A               ; Đảo bit để LED tích cực mức cao sáng đúng
    MOV P1, A           ; Xuất ra 8 LED cổng P1
    
    ACALL WAIT_TICK     ; Chờ quan sát nhịp đếm
    INC R0              ; Tăng giá trị đếm
    SJMP COUNT_LOOP     ; Khi R0 vượt 255 sẽ tự động quay về 0

; --------------------------------------------
WAIT_TICK:
    MOV R2, #80
W1:
    MOV R3, #150
W2:
    DJNZ R3, W2
    DJNZ R2, W1
    RET

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `led_${i}`,
          type: 'led' as const,
          name: `D${i}`,
          x: 420,
          y: 130 + i * 25,
          rotation: 0,
          props: { color: 'blue', vf: 2.5, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        })),
        {
          id: 'gnd_cnt',
          type: 'gnd',
          name: 'GND',
          x: 520,
          y: 315,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `w_c_${i}`,
          points: [
            { x: 180, y: 140 + i * 25 },
            { x: 420, y: 140 + i * 25 },
          ],
          fromPin: { compId: 'u1', pinId: `p1_${i}` },
          toPin: { compId: `led_${i}`, pinId: 'anode' },
          color: '#38bdf8',
        })),
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `w_g_${i}`,
          points: [
            { x: 470, y: 140 + i * 25 },
            { x: 470, y: 140 + (i + 1) * 25 },
          ],
          color: '#64748b',
        })),
        {
          id: 'w_g_final',
          points: [
            { x: 470, y: 315 },
            { x: 535, y: 315 },
          ],
          color: '#64748b',
        },
      ],
    },
  },

  // 9. OUTPUT DATA TO PORT 0 (MOV P0, #0b00000011)
  {
    id: 'ex9_port0',
    title: '9. Xuất dữ liệu ra cổng P0 (MOV P0, #0b00000011)',
    category: 'Cơ bản',
    description: 'Xuất dữ liệu nhị phân trực tiếp ra Port 0. Bật sáng 2 bóng LED tại chân P0.0 và P0.1.',
    sourceCode: `; ============================================
; Ví dụ 9: Xuất dữ liệu ra cổng P0
; Lệnh: MOV P0, #0b00000011
; Chân P0.0 và P0.1 lên mức cao (5V) làm sáng LED
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    ; Ghi giá trị nhị phân 0b00000011 (tương đương 03H hay số 3)
    ; Bit 0 (P0.0) = 1 (5V) -> Bật sáng LED 1
    ; Bit 1 (P0.1) = 1 (5V) -> Bật sáng LED 2
    ; Bit 2..7 = 0 (0V) -> Tắt các chân còn lại
    MOV P0, #0b00000011

HERE:
    SJMP HERE           ; Dừng vòng lặp vô tận để quan sát LED

    END
`,
    circuit: {
      components: [
        createMcuComponent(180, 100),
        {
          id: 'r0',
          type: 'resistor',
          name: 'R1 (P0.0)',
          x: 420,
          y: 130,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led0',
          type: 'led',
          name: 'LED P0.0',
          x: 540,
          y: 130,
          rotation: 0,
          props: { color: 'green', vf: 2.1, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'r1',
          type: 'resistor',
          name: 'R2 (P0.1)',
          x: 420,
          y: 155,
          rotation: 0,
          props: { resistance: 330 },
          pins: [
            { id: 'pin1', name: '1', relX: 0, relY: 10 },
            { id: 'pin2', name: '2', relX: 70, relY: 10 },
          ],
        },
        {
          id: 'led1',
          type: 'led',
          name: 'LED P0.1',
          x: 540,
          y: 155,
          rotation: 0,
          props: { color: 'yellow', vf: 2.0, maxCurrent: 0.025 },
          pins: [
            { id: 'anode', name: 'A', relX: 0, relY: 10 },
            { id: 'cathode', name: 'K', relX: 50, relY: 10 },
          ],
        },
        {
          id: 'gnd1',
          type: 'gnd',
          name: 'GND',
          x: 650,
          y: 155,
          rotation: 0,
          props: {},
          pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
        },
      ],
      wires: [
        {
          id: 'w_p0_0',
          points: [
            { x: 360, y: 140 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_0' },
          toPin: { compId: 'r0', pinId: 'pin1' },
          color: '#38bdf8',
        },
        {
          id: 'w_r0_led0',
          points: [
            { x: 490, y: 140 },
            { x: 540, y: 140 },
          ],
          fromPin: { compId: 'r0', pinId: 'pin2' },
          toPin: { compId: 'led0', pinId: 'anode' },
          color: '#38bdf8',
        },
        {
          id: 'w_p0_1',
          points: [
            { x: 360, y: 165 },
            { x: 420, y: 165 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_1' },
          toPin: { compId: 'r1', pinId: 'pin1' },
          color: '#38bdf8',
        },
        {
          id: 'w_r1_led1',
          points: [
            { x: 490, y: 165 },
            { x: 540, y: 165 },
          ],
          fromPin: { compId: 'r1', pinId: 'pin2' },
          toPin: { compId: 'led1', pinId: 'anode' },
          color: '#38bdf8',
        },
        {
          id: 'w_k0_gnd',
          points: [
            { x: 590, y: 140 },
            { x: 665, y: 140 },
            { x: 665, y: 155 },
          ],
          fromPin: { compId: 'led0', pinId: 'cathode' },
          toPin: { compId: 'gnd1', pinId: 'gnd' },
          color: '#64748b',
        },
        {
          id: 'w_k1_gnd',
          points: [
            { x: 590, y: 165 },
            { x: 665, y: 165 },
            { x: 665, y: 155 },
          ],
          fromPin: { compId: 'led1', pinId: 'cathode' },
          toPin: { compId: 'gnd1', pinId: 'gnd' },
          color: '#64748b',
        },
      ],
    },
  },
  // 9. 7-SEGMENT DISPLAY 0-9 COUNTER
  {
    id: 'ex9_sevseg',
    title: '9. Đếm số 0 - 9 trên LED 7 đoạn (Port 0)',
    category: 'Nâng cao',
    description:
      'Mô phỏng LED 7 đoạn Anode chung nối trực tiếp cổng P0. Chương trình dùng con trỏ DPTR tra bảng mã (MOVC A, @A+DPTR) đếm từ 0 đến 9 tuần hoàn.',
    sourceCode: `; ============================================
; Ví dụ 9: Đếm số 0 - 9 trên LED 7 đoạn Anode chung
; Kết nối: P0.0 -> a, P0.1 -> b, ..., P0.6 -> g
; Chân COM nối nguồn VCC (+5V)
; Mã LED 7 đoạn CA: LED sáng khi nhận mức 0
; ============================================
    ORG 0000H
    LJMP MAIN

    ORG 0030H
MAIN:
    MOV DPTR, #SEV_SEG_TABLE ; Trỏ DPTR tới đầu bảng mã 7 đoạn

RESET_COUNT:
    MOV R2, #0               ; Bắt đầu đếm từ chữ số 0

COUNT_LOOP:
    MOV A, R2                ; Đưa chỉ số đếm vào thanh ghi A
    MOVC A, @A+DPTR          ; Tra bảng lấy mã hiển thị tương ứng
    MOV P0, A                ; Xuất mã ra cổng P0 điều khiển LED 7 đoạn

    ACALL DELAY              ; Gọi hàm trễ để quan sát chữ số

    INC R2                   ; Tăng giá trị đếm
    CJNE R2, #10, COUNT_LOOP ; Nếu chưa đếm đến 10 thì lặp tiếp
    SJMP RESET_COUNT         ; Đã xong 9, quay lại đếm từ 0

; --------------------------------------------
; Hàm trễ hiển thị ~ 300 ms (Thạch anh 12 MHz)
; --------------------------------------------
DELAY:
    MOV R6, #120
D1:
    MOV R7, #250
D2:
    DJNZ R7, D2
    DJNZ R6, D1
    RET

; --------------------------------------------
; Bảng mã LED 7 đoạn Anode chung (0 - 9)
; 0: 0C0H, 1: 0F9H, 2: 0A4H, 3: 0B0H, 4: 099H
; 5: 092H, 6: 082H, 7: 0F8H, 8: 080H, 9: 090H
; --------------------------------------------
SEV_SEG_TABLE:
    DB 0C0H, 0F9H, 0A4H, 0B0H, 099H
    DB 092H, 082H, 0F8H, 080H, 090H

    END`,
    circuit: {
      components: [
        createMcuComponent(120, 80),
        {
          id: 'ds1',
          type: 'sevseg_ca',
          name: '7-SEG CA',
          x: 420,
          y: 100,
          rotation: 0,
          props: { color: 'red', mode: 'ca', vf: 2.0 },
          pins: [
            { id: 'a', name: 'a', relX: 0, relY: 20 },
            { id: 'b', name: 'b', relX: 0, relY: 30 },
            { id: 'c', name: 'c', relX: 0, relY: 40 },
            { id: 'd', name: 'd', relX: 0, relY: 50 },
            { id: 'e', name: 'e', relX: 0, relY: 60 },
            { id: 'f', name: 'f', relX: 0, relY: 70 },
            { id: 'g', name: 'g', relX: 0, relY: 80 },
            { id: 'dp', name: 'dp', relX: 0, relY: 90 },
            { id: 'com', name: 'CA', relX: 50, relY: 130 },
          ],
        },
        {
          id: 'vcc1',
          type: 'vcc',
          name: 'VCC',
          x: 455,
          y: 270,
          rotation: 0,
          props: { voltage: 5.0 },
          pins: [{ id: 'pin1', name: 'VCC', relX: 15, relY: 25 }],
        },
      ],
      wires: [
        {
          id: 'w_p00_a',
          points: [
            { x: 300, y: 120 },
            { x: 420, y: 120 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_0' },
          toPin: { compId: 'ds1', pinId: 'a' },
          color: '#38bdf8',
        },
        {
          id: 'w_p01_b',
          points: [
            { x: 300, y: 145 },
            { x: 350, y: 145 },
            { x: 350, y: 130 },
            { x: 420, y: 130 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_1' },
          toPin: { compId: 'ds1', pinId: 'b' },
          color: '#38bdf8',
        },
        {
          id: 'w_p02_c',
          points: [
            { x: 300, y: 170 },
            { x: 360, y: 170 },
            { x: 360, y: 140 },
            { x: 420, y: 140 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_2' },
          toPin: { compId: 'ds1', pinId: 'c' },
          color: '#38bdf8',
        },
        {
          id: 'w_p03_d',
          points: [
            { x: 300, y: 195 },
            { x: 370, y: 195 },
            { x: 370, y: 150 },
            { x: 420, y: 150 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_3' },
          toPin: { compId: 'ds1', pinId: 'd' },
          color: '#38bdf8',
        },
        {
          id: 'w_p04_e',
          points: [
            { x: 300, y: 220 },
            { x: 380, y: 220 },
            { x: 380, y: 160 },
            { x: 420, y: 160 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_4' },
          toPin: { compId: 'ds1', pinId: 'e' },
          color: '#38bdf8',
        },
        {
          id: 'w_p05_f',
          points: [
            { x: 300, y: 245 },
            { x: 390, y: 245 },
            { x: 390, y: 170 },
            { x: 420, y: 170 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_5' },
          toPin: { compId: 'ds1', pinId: 'f' },
          color: '#38bdf8',
        },
        {
          id: 'w_p06_g',
          points: [
            { x: 300, y: 270 },
            { x: 400, y: 270 },
            { x: 400, y: 180 },
            { x: 420, y: 180 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_6' },
          toPin: { compId: 'ds1', pinId: 'g' },
          color: '#38bdf8',
        },
        {
          id: 'w_p07_dp',
          points: [
            { x: 300, y: 295 },
            { x: 410, y: 295 },
            { x: 410, y: 190 },
            { x: 420, y: 190 },
          ],
          fromPin: { compId: 'u1', pinId: 'p0_7' },
          toPin: { compId: 'ds1', pinId: 'dp' },
          color: '#38bdf8',
        },
        {
          id: 'w_com_vcc',
          points: [
            { x: 470, y: 230 },
            { x: 470, y: 295 },
          ],
          fromPin: { compId: 'ds1', pinId: 'com' },
          toPin: { compId: 'vcc1', pinId: 'pin1' },
          color: '#ef4444',
        },
      ],
    },
  },
];
