/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu, Download, FileCode, FolderArchive, Upload } from 'lucide-react';
import { Canvas } from './components/Canvas';
import { CheatSheetModal } from './components/CheatSheetModal';
import { Console } from './components/Console';
import { Editor } from './components/Editor';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { RamPanel } from './components/RamPanel';
import { RegistersPanel } from './components/RegistersPanel';
import { SfrPanel } from './components/SfrPanel';
import { PREBUILT_EXAMPLES } from './examples/prebuiltCircuits';
import { Assembler8051 } from './sim/assembler';
import { CircuitSolver, SolverResult } from './sim/circuitSolver';
import { Cpu8051 } from './sim/cpu8051';
import {
  AssembleError,
  AssembleResult,
  CircuitComponent,
  ComponentType,
  CpuStateSnapshot,
  LogEntry,
  PortMode,
  Wire,
} from './types';

export default function App() {
  // Core Simulators
  const cpuRef = useRef<Cpu8051>(new Cpu8051());
  const assemblerRef = useRef<Assembler8051>(new Assembler8051());
  const solverRef = useRef<CircuitSolver>(new CircuitSolver());

  // Application State
  const [sourceCode, setSourceCode] = useState<string>(PREBUILT_EXAMPLES[0].sourceCode);
  const [components, setComponents] = useState<CircuitComponent[]>(PREBUILT_EXAMPLES[0].circuit.components);
  const [wires, setWires] = useState<Wire[]>(PREBUILT_EXAMPLES[0].circuit.wires);
  const [selectedExampleId, setSelectedExampleId] = useState<string>(PREBUILT_EXAMPLES[0].id);

  // Selection state
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);

  // Simulation execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(1.0); // 0.01x, 0.1x, 1.0x, 10x, 100x
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [activeLine, setActiveLine] = useState<number | null>(null);

  // Assembler output state
  const [assembleResult, setAssembleResult] = useState<AssembleResult | null>(null);
  const [assembleErrors, setAssembleErrors] = useState<AssembleError[]>([]);

  // Circuit Solver Output
  const [pinVoltages, setPinVoltages] = useState<Map<string, number>>(new Map());
  const [compCurrents, setCompCurrents] = useState<Map<string, number>>(new Map());
  const [burnedLeds, setBurnedLeds] = useState<Set<string>>(new Set());
  const [portMode, setPortMode] = useState<PortMode>('easy');

  // Logs & Snapshots
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cpuSnapshot, setCpuSnapshot] = useState<CpuStateSnapshot>(cpuRef.current.getSnapshot());

  // UI Tabs & Modals
  const [rightTab, setRightTab] = useState<'editor' | 'properties' | 'listing'>('editor');
  const [bottomTab, setBottomTab] = useState<'console' | 'registers' | 'ram' | 'sfr'>('console');
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);

  // Animation frame runner ref
  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const cycleAccumulatorRef = useRef<number>(0);

  // Add Log Helper
  const addLog = useCallback((level: 'INFO' | 'OK' | 'WARN' | 'ERROR', message: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      time: cpuRef.current.getSnapshot().simTimeUs,
      level,
      message,
    };
    setLogs((prev) => [...prev.slice(-300), entry]);
  }, []);

  // Hook CPU logging
  useEffect(() => {
    cpuRef.current.onLog = (lvl, msg) => addLog(lvl, msg);
    cpuRef.current.portMode = portMode;
  }, [addLog, portMode]);

  // Trigger DC Circuit Solver
  const triggerSolve = useCallback(() => {
    const res: SolverResult = solverRef.current.solve(
      components,
      wires,
      cpuRef.current,
      portMode,
      burnedLeds
    );

    setPinVoltages(res.pinVoltages);
    setCompCurrents(res.componentCurrents);
    setBurnedLeds(new Set(res.burnedLeds));

    for (const w of res.warnings) {
      addLog('WARN', w);
    }
  }, [components, wires, portMode, burnedLeds, addLog]);

  // Hook MCU pin change event to solver
  useEffect(() => {
    cpuRef.current.onPinStateChange = () => {
      triggerSolve();
    };
  }, [triggerSolve]);

  // Assemble Source Code
  const handleAssemble = useCallback((): boolean => {
    addLog('INFO', 'Đang biên dịch chương trình Assembly 8051...');
    const result = assemblerRef.current.assemble(sourceCode);
    setAssembleResult(result);
    setAssembleErrors(result.errors);

    if (result.success) {
      // 1. Clear old ROM to prevent stale code remnants
      cpuRef.current.rom.fill(0);
      // 2. Reset CPU registers, PC = 0x0000, SP = 0x07
      cpuRef.current.reset();
      // 3. Load fresh bytecode into ROM
      cpuRef.current.rom.set(result.programMemory);
      cpuRef.current.pc = 0x0000;

      // 4. Update UI snapshot and active line
      setCpuSnapshot(cpuRef.current.getSnapshot());
      const firstLine = result.addressToLineMap.get(0x0000) || 1;
      setActiveLine(firstLine);

      // 5. Solve circuit immediately for reset state
      triggerSolve();

      addLog(
        'OK',
        `Biên dịch thành công! Dung lượng mã: ${result.codeSize} byte, ${result.symbolCount} nhãn. CPU đã được nạp mã và sẵn sàng chạy từ 0000H.`
      );
      if (result.warnings.length > 0) {
        result.warnings.forEach((w) => addLog('WARN', w));
      }
      return true;
    } else {
      addLog('ERROR', `Biên dịch thất bại: phát hiện ${result.errors.length} lỗi cú pháp.`);
      result.errors.forEach((err) => {
        addLog('ERROR', `Dòng ${err.line}: ${err.message}${err.hint ? ` (${err.hint})` : ''}`);
      });
      return false;
    }
  }, [sourceCode, addLog, triggerSolve]);

  // Step Single Instruction
  const handleStep = useCallback(() => {
    if (!assembleResult?.success) {
      if (!handleAssemble()) return;
    }

    const prevPc = cpuRef.current.pc;
    const { pc, cycles, opcode } = cpuRef.current.step();
    setCpuSnapshot(cpuRef.current.getSnapshot());

    // Update active line in editor
    const lineNum = assembleResult?.addressToLineMap.get(pc) || null;
    setActiveLine(lineNum);

    // Solve circuit for new pin states
    triggerSolve();

    // Log executed instruction details
    const executedItem = assembleResult?.listing.find((item) => item.address === prevPc);
    const instStr = executedItem ? `"${executedItem.source.trim()}"` : `Opcode 0x${opcode.toString(16).padStart(2, '0').toUpperCase()}`;
    const p0Val = cpuRef.current.readSfr(0x80);
    const p0Hex = p0Val.toString(16).padStart(2, '0').toUpperCase();
    const p0Bin = p0Val.toString(2).padStart(8, '0');
    addLog(
      'INFO',
      `[Bước PC=${prevPc.toString(16).padStart(4, '0').toUpperCase()}H] Thực thi: ${instStr} (+${cycles} chu kỳ) | P0=${p0Hex}H (0b${p0Bin}), A=${cpuRef.current.A.toString(16).padStart(2, '0').toUpperCase()}H -> PC kế tiếp: ${pc.toString(16).padStart(4, '0').toUpperCase()}H`
    );
  }, [assembleResult, handleAssemble, triggerSolve, addLog]);

  // Reset Simulation & CPU
  const handleReset = useCallback(() => {
    setIsRunning(false);
    cpuRef.current.reset();
    if (assembleResult?.success) {
      cpuRef.current.rom.set(assembleResult.programMemory);
    }
    setCpuSnapshot(cpuRef.current.getSnapshot());
    setActiveLine(assembleResult?.addressToLineMap.get(0x0000) || 1);
    triggerSolve();
    addLog('INFO', 'Hệ thống vi điều khiển 8051 đã được Reset về PC=0000H, SP=07H.');
  }, [assembleResult, triggerSolve, addLog]);

  // Toggle Run / Pause
  const handleToggleRun = useCallback(() => {
    if (!isRunning) {
      if (!assembleResult?.success) {
        if (!handleAssemble()) return;
      }
      setIsRunning(true);
      lastTimestampRef.current = performance.now();
      addLog('OK', `Bắt đầu chạy mô phỏng 8051 (Tốc độ ${simSpeed}x)...`);
    } else {
      setIsRunning(false);
      addLog('INFO', 'Tạm dừng mô phỏng.');
    }
  }, [isRunning, assembleResult, handleAssemble, simSpeed, addLog]);

  // Main Simulation Loop with requestAnimationFrame
  useEffect(() => {
    if (!isRunning) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const runLoop = (currentTimestamp: number) => {
      const elapsedMs = Math.min(100, currentTimestamp - lastTimestampRef.current);
      lastTimestampRef.current = currentTimestamp;

      // 12 MHz standard clock: 12,000,000 / 12 = 1,000,000 machine cycles per second
      // cyclesPerMs = 1,000 cycles / ms at 1x
      const cyclesPerMs = (cpuRef.current.fOscHz / 12) / 1000;
      cycleAccumulatorRef.current += elapsedMs * cyclesPerMs * simSpeed;

      let cyclesToRun = Math.floor(cycleAccumulatorRef.current);
      // Bound max cycles per frame to prevent freezing UI
      cyclesToRun = Math.min(cyclesToRun, 50000);
      cycleAccumulatorRef.current -= cyclesToRun;

      let ranCycles = 0;
      let hitBreakpoint = false;

      while (ranCycles < cyclesToRun) {
        const curPc = cpuRef.current.pc;
        const curLine = assembleResult?.addressToLineMap.get(curPc);

        // Check if hit breakpoint
        if (curLine && breakpoints.has(curLine) && ranCycles > 0) {
          hitBreakpoint = true;
          setIsRunning(false);
          setActiveLine(curLine);
          addLog('INFO', `Đã dừng tại điểm ngắt (Breakpoint) dòng ${curLine} [PC=0x${curPc.toString(16).padStart(4, '0')}]`);
          break;
        }

        const stepInfo = cpuRef.current.step();
        ranCycles += stepInfo.cycles;
      }

      // Update UI snapshot and active line
      setCpuSnapshot(cpuRef.current.getSnapshot());
      const newActiveLine = assembleResult?.addressToLineMap.get(cpuRef.current.pc) || null;
      setActiveLine(newActiveLine);

      // Solve circuit
      triggerSolve();

      if (!hitBreakpoint && isRunning) {
        animFrameRef.current = requestAnimationFrame(runLoop);
      }
    };

    animFrameRef.current = requestAnimationFrame(runLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRunning, simSpeed, breakpoints, assembleResult, triggerSolve, addLog]);

  // Load a Prebuilt Example
  const handleLoadExample = (exampleId: string) => {
    const ex = PREBUILT_EXAMPLES.find((e) => e.id === exampleId);
    if (!ex) return;

    setIsRunning(false);
    setSelectedExampleId(ex.id);
    setSourceCode(ex.sourceCode);
    setComponents(ex.circuit.components);
    setWires(ex.circuit.wires);
    setSelectedCompId(null);
    setSelectedWireId(null);
    setBurnedLeds(new Set());

    // Reset CPU and assemble
    cpuRef.current.reset();
    setTimeout(() => {
      const res = assemblerRef.current.assemble(ex.sourceCode);
      setAssembleResult(res);
      setAssembleErrors(res.errors);
      if (res.success) {
        cpuRef.current.rom.set(res.programMemory);
      }
      setCpuSnapshot(cpuRef.current.getSnapshot());
      triggerSolve();
      addLog('OK', `Đã nạp bài mẫu: "${ex.title}".`);
    }, 50);
  };

  // Add Component from Palette
  const handleAddComponent = (type: ComponentType) => {
    const newId = `${type}_${Date.now()}`;
    let newComp: CircuitComponent;

    if (type === 'resistor') {
      newComp = {
        id: newId,
        type: 'resistor',
        name: `R_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: { resistance: 330 },
        pins: [
          { id: 'pin1', name: '1', relX: 0, relY: 10 },
          { id: 'pin2', name: '2', relX: 70, relY: 10 },
        ],
      };
    } else if (type === 'led') {
      newComp = {
        id: newId,
        type: 'led',
        name: `LED_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: { color: 'green', vf: 2.1, maxCurrent: 0.025 },
        pins: [
          { id: 'anode', name: 'A', relX: 0, relY: 10 },
          { id: 'cathode', name: 'K', relX: 50, relY: 10 },
        ],
      };
    } else if (type === 'vcc') {
      newComp = {
        id: newId,
        type: 'vcc',
        name: 'VCC',
        x: 350,
        y: 180,
        rotation: 0,
        props: { voltage: 5.0 },
        pins: [{ id: 'pin1', name: 'VCC', relX: 15, relY: 25 }],
      };
    } else if (type === 'gnd') {
      newComp = {
        id: newId,
        type: 'gnd',
        name: 'GND',
        x: 350,
        y: 220,
        rotation: 0,
        props: {},
        pins: [{ id: 'gnd', name: 'GND', relX: 15, relY: 0 }],
      };
    } else if (type === 'button') {
      newComp = {
        id: newId,
        type: 'button',
        name: `SW_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: { pressed: false },
        pins: [
          { id: 'pin1', name: '1', relX: 0, relY: 10 },
          { id: 'pin2', name: '2', relX: 60, relY: 10 },
        ],
      };
    } else if (type === 'switch') {
      newComp = {
        id: newId,
        type: 'switch',
        name: `K_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: { closed: false },
        pins: [
          { id: 'pin1', name: '1', relX: 0, relY: 10 },
          { id: 'pin2', name: '2', relX: 60, relY: 10 },
        ],
      };
    } else if (type === 'npn') {
      newComp = {
        id: newId,
        type: 'npn',
        name: `Q_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: { beta: 100, state: 'Ngắt' },
        pins: [
          { id: 'b', name: 'B', relX: 0, relY: 25 },
          { id: 'c', name: 'C', relX: 35, relY: 0 },
          { id: 'e', name: 'E', relX: 35, relY: 50 },
        ],
      };
    } else if (type === 'diode') {
      newComp = {
        id: newId,
        type: 'diode',
        name: `D_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: { vf: 0.7 },
        pins: [
          { id: 'a', name: 'A', relX: 0, relY: 10 },
          { id: 'k', name: 'K', relX: 50, relY: 10 },
        ],
      };
    } else if (type === 'ammeter') {
      newComp = {
        id: newId,
        type: 'ammeter',
        name: `A_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: {},
        pins: [
          { id: 'p', name: '+', relX: 0, relY: 15 },
          { id: 'n', name: '-', relX: 60, relY: 15 },
        ],
      };
    } else if (type === 'voltmeter') {
      newComp = {
        id: newId,
        type: 'voltmeter',
        name: `V_${components.length + 1}`,
        x: 350,
        y: 200,
        rotation: 0,
        props: {},
        pins: [
          { id: 'p', name: '+', relX: 0, relY: 15 },
          { id: 'n', name: '-', relX: 60, relY: 15 },
        ],
      };
    } else {
      addLog('WARN', `Linh kiện ${type} sẽ được hỗ trợ trong phiên bản kế.`);
      return;
    }

    setComponents([...components, newComp]);
    setSelectedCompId(newId);
    triggerSolve();
    addLog('INFO', `Đã thêm linh kiện: ${newComp.name} (${newComp.type})`);
  };

  // Project & Code Import / Export State & Refs
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const asmFileInputRef = useRef<HTMLInputElement>(null);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState<boolean>(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Close project menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setIsProjectMenuOpen(false);
      }
    };
    if (isProjectMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProjectMenuOpen]);

  // Export Intel HEX File
  const handleExportHex = () => {
    if (!assembleResult?.success) {
      if (!handleAssemble()) return;
    }
    const blob = new Blob([assembleResult!.hexOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.hex';
    a.click();
    URL.revokeObjectURL(a.href);
    addLog('OK', 'Đã tải xuống tệp Intel HEX (program.hex).');
  };

  // Export Assembly Source
  const handleExportAsm = () => {
    const blob = new Blob([sourceCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'code8051.asm';
    a.click();
    URL.revokeObjectURL(a.href);
    addLog('OK', 'Đã tải xuống mã nguồn Assembly (code8051.asm).');
  };

  // Export Full Project JSON (circuit components, wires, and assembly source)
  const handleExportProject = () => {
    const project = {
      name: '8051 Project',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      sourceCode,
      circuit: {
        components,
        wires,
      },
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '8051_project.json';
    a.click();
    URL.revokeObjectURL(a.href);
    addLog('OK', 'Đã xuất dự án hoàn chỉnh gồm mạch và mã nguồn (8051_project.json).');
  };

  // Import Full Project JSON File
  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object') {
          throw new Error('Cấu trúc file JSON không hợp lệ.');
        }

        let loadedCode = '';
        let loadedComponents: CircuitComponent[] = [];
        let loadedWires: Wire[] = [];

        // Support both structured project or flat structure
        if (typeof data.sourceCode === 'string') {
          loadedCode = data.sourceCode;
        } else if (typeof data.code === 'string') {
          loadedCode = data.code;
        }

        if (data.circuit && Array.isArray(data.circuit.components)) {
          loadedComponents = data.circuit.components;
          loadedWires = Array.isArray(data.circuit.wires) ? data.circuit.wires : [];
        } else if (Array.isArray(data.components)) {
          loadedComponents = data.components;
          loadedWires = Array.isArray(data.wires) ? data.wires : [];
        } else {
          throw new Error('Không tìm thấy danh sách linh kiện mạch trong file.');
        }

        // Apply new project state
        setComponents(loadedComponents);
        setWires(loadedWires);
        if (loadedCode) {
          setSourceCode(loadedCode);
        }
        setSelectedCompId(null);
        setSelectedWireId(null);

        addLog(
          'OK',
          `Đã nhập thành công dự án từ "${file.name}" (${loadedComponents.length} linh kiện, ${loadedWires.length} đường dây).`
        );

        // Immediate assemble & solve
        setTimeout(() => {
          handleAssemble();
          triggerSolve();
        }, 60);
      } catch (err: any) {
        addLog('ERROR', `Lỗi khi nhập tệp dự án: ${err.message || 'Dữ liệu JSON không đúng cú pháp'}`);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
    setIsProjectMenuOpen(false);
  };

  // Import Assembly Code File (.asm, .txt, .s)
  const handleImportAsmFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setSourceCode(text);
        addLog('OK', `Đã nhập mã nguồn Assembly từ "${file.name}" vào trình soạn thảo.`);
        setTimeout(() => {
          handleAssemble();
        }, 60);
      } catch (err: any) {
        addLog('ERROR', `Lỗi khi đọc file mã nguồn: ${err.message}`);
      }
    };

    reader.readAsText(file);
    e.target.value = '';
    setIsProjectMenuOpen(false);
  };

  // Initial Assembly on first mount
  useEffect(() => {
    handleAssemble();
    triggerSolve();
  }, []);

  const selectedComponent = components.find((c) => c.id === selectedCompId) || null;
  const selectedWire = wires.find((w) => w.id === selectedWireId) || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090d13] text-[#e6edf3] overflow-hidden select-none font-mono">
      {/* 1. TOP HEADER & MAIN TOOLBAR */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-slate-800 text-xs shrink-0 gap-4">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
            <span className="font-bold text-sm tracking-wide text-white">8051 SIMULATOR</span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 hidden lg:inline">SimulIDE Schematic &amp; Assembly IDE</span>
        </div>

        {/* Center: Simulation Controls */}
        <div className="flex items-center gap-1.5 bg-[#0d1117] p-1 rounded-lg border border-slate-800">
          {/* Assemble */}
          <button
            onClick={handleAssemble}
            className="flex items-center gap-1 px-3 py-1 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-300 font-semibold rounded transition-colors"
            title="Biên dịch mã nguồn Assembly (F7)"
          >
            <span>⚙️</span> Biên Dịch
          </button>

          <span className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Run / Pause */}
          <button
            onClick={handleToggleRun}
            className={`flex items-center gap-1 px-3 py-1 font-bold rounded transition-colors ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            <span>{isRunning ? '⏸ Tạm Dừng' : '▶ Chạy'}</span>
          </button>

          {/* Step */}
          <button
            onClick={handleStep}
            disabled={isRunning}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded transition-colors"
            title="Thực thi từng lệnh (F10)"
          >
            <span>⏭</span> Từng Lệnh
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
            title="Reset vi điều khiển về trạng thái ban đầu"
          >
            <span>🔄</span> Reset
          </button>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-800 text-slate-400">
            <span>Tốc độ:</span>
            <select
              value={simSpeed}
              onChange={(e) => setSimSpeed(Number(e.target.value))}
              className="bg-[#161b22] border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs outline-none"
            >
              <option value={0.01}>0.01x (Rất chậm)</option>
              <option value={0.1}>0.1x (Chậm)</option>
              <option value={1.0}>1x (Thời gian thật 12MHz)</option>
              <option value={5.0}>5x (Nhanh)</option>
              <option value={20.0}>20x (Tối đa)</option>
            </select>
          </div>
        </div>

        {/* Right Zone: Examples & File Operations */}
        <div className="flex items-center gap-2">
          {/* Example Selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 hidden xl:inline">Bài mẫu:</span>
            <select
              value={selectedExampleId}
              onChange={(e) => handleLoadExample(e.target.value)}
              className="bg-[#0d1117] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs outline-none max-w-[200px] truncate"
            >
              {PREBUILT_EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>

          {/* Import / Export Project Dropdown */}
          <div className="relative" ref={projectMenuRef}>
            <button
              onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors"
              title="Nhập hoặc xuất dự án (mạch & mã nguồn), file HEX, hoặc file ASM"
            >
              <FolderArchive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Nhập / Xuất</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProjectMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#161b22] border border-slate-700 rounded-lg shadow-2xl py-1.5 z-50 text-xs font-sans">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 flex items-center justify-between">
                  <span>Dự Án Hoàn Chỉnh (Mạch + Mã)</span>
                  <span className="text-cyan-400 font-mono text-[9px]">JSON</span>
                </div>

                <button
                  onClick={() => {
                    projectFileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-start gap-2.5 text-slate-200 group transition-colors"
                >
                  <Upload className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white group-hover:text-cyan-300">Nhập Dự Án (.json)</div>
                    <div className="text-[11px] text-slate-400">Nạp lại mạch điện và mã Assembly từ tệp JSON</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    handleExportProject();
                    setIsProjectMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-start gap-2.5 text-slate-200 group transition-colors"
                >
                  <Download className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white group-hover:text-cyan-300">Xuất Dự Án (.json)</div>
                    <div className="text-[11px] text-slate-400">Lưu trọn vẹn mạch, linh kiện và mã nguồn</div>
                  </div>
                </button>

                <div className="my-1 border-t border-slate-800" />

                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 flex items-center justify-between">
                  <span>Mã Nguồn & Firmware</span>
                  <span className="text-amber-400 font-mono text-[9px]">ASM / HEX</span>
                </div>

                <button
                  onClick={() => {
                    asmFileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-start gap-2.5 text-slate-200 group transition-colors"
                >
                  <FileCode className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white group-hover:text-cyan-300">Nhập Mã Assembly (.asm)</div>
                    <div className="text-[11px] text-slate-400">Mở file code từ máy vào trình soạn thảo</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    handleExportAsm();
                    setIsProjectMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-start gap-2.5 text-slate-200 group transition-colors"
                >
                  <Download className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white group-hover:text-cyan-300">Xuất Mã Assembly (.asm)</div>
                    <div className="text-[11px] text-slate-400">Tải riêng tệp mã nguồn code8051.asm</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    handleExportHex();
                    setIsProjectMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-start gap-2.5 text-slate-200 group transition-colors"
                >
                  <Cpu className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white group-hover:text-cyan-300">Xuất Intel HEX (.hex)</div>
                    <div className="text-[11px] text-slate-400">Tệp nhị phân để nạp chip AT89C51 thật</div>
                  </div>
                </button>
              </div>
            )}

            {/* Hidden file inputs */}
            <input
              ref={projectFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportProjectFile}
            />
            <input
              ref={asmFileInputRef}
              type="file"
              accept=".asm,.txt,.s"
              className="hidden"
              onChange={handleImportAsmFile}
            />
          </div>

          <button
            onClick={() => setIsCheatSheetOpen(true)}
            className="px-2.5 py-1 bg-cyan-950/80 border border-cyan-700 hover:bg-cyan-900 text-cyan-300 rounded transition-colors"
            title="Mở bảng tra cứu tập lệnh và phím tắt"
          >
            ❓ Tra Cứu
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (Split Left Palette, Center Schematic, Right IDE) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar: Component Palette */}
        <Palette onAddComponent={handleAddComponent} />

        {/* Center: Circuit Schematic Canvas */}
        <div className="flex-1 relative min-w-0 h-full">
          <Canvas
            components={components}
            wires={wires}
            selectedComponentId={selectedCompId}
            selectedWireId={selectedWireId}
            onSelectComponent={(id) => {
              setSelectedCompId(id);
              if (id) {
                setSelectedWireId(null);
                setRightTab('properties');
              }
            }}
            onSelectWire={(id) => {
              setSelectedWireId(id);
              if (id) {
                setSelectedCompId(null);
                setRightTab('properties');
              }
            }}
            onUpdateComponents={(comps) => setComponents(comps)}
            onUpdateWires={(w) => setWires(w)}
            burnedLeds={burnedLeds}
            pinVoltages={pinVoltages}
            componentCurrents={compCurrents}
            onTriggerSolve={triggerSolve}
          />
        </div>

        {/* Right Sidebar: Tabs for Assembly Editor & Properties */}
        <div className="w-[450px] shrink-0 border-l border-slate-800 flex flex-col bg-[#0d1117]">
          {/* Tab Headers */}
          <div className="flex items-center border-b border-slate-800 bg-[#161b22] px-2 text-xs">
            <button
              onClick={() => setRightTab('editor')}
              className={`px-3 py-2 border-b-2 font-medium transition-colors ${
                rightTab === 'editor'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Mã Nguồn Assembly
            </button>
            <button
              onClick={() => setRightTab('properties')}
              className={`px-3 py-2 border-b-2 font-medium transition-colors ${
                rightTab === 'properties'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Thuộc Tính {selectedComponent ? `(${selectedComponent.name})` : ''}
            </button>
            <button
              onClick={() => setRightTab('listing')}
              className={`px-3 py-2 border-b-2 font-medium transition-colors ${
                rightTab === 'listing'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Bảng Listing &amp; HEX
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightTab === 'editor' && (
              <Editor
                code={sourceCode}
                onChange={(newVal) => setSourceCode(newVal)}
                activeLine={activeLine}
                errors={assembleErrors}
                breakpoints={breakpoints}
                onToggleBreakpoint={(line) => {
                  setBreakpoints((prev) => {
                    const next = new Set(prev);
                    if (next.has(line)) next.delete(line);
                    else next.add(line);
                    return next;
                  });
                }}
              />
            )}

            {rightTab === 'properties' && (
              <PropertiesPanel
                selectedComponent={selectedComponent}
                selectedWire={selectedWire}
                onUpdateComponent={(updated) => {
                  setComponents(components.map((c) => (c.id === updated.id ? updated : c)));
                  triggerSolve();
                }}
                onDeleteComponent={(id) => {
                  setComponents(components.filter((c) => c.id !== id));
                  setWires(wires.filter((w) => w.fromPin?.compId !== id && w.toPin?.compId !== id));
                  setSelectedCompId(null);
                  triggerSolve();
                }}
                onUpdateWire={(updated) => {
                  setWires(wires.map((w) => (w.id === updated.id ? updated : w)));
                }}
                onDeleteWire={(id) => {
                  setWires(wires.filter((w) => w.id !== id));
                  setSelectedWireId(null);
                  triggerSolve();
                }}
                burnedLeds={burnedLeds}
                onResetLedBurn={(id) => {
                  setBurnedLeds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                  });
                  triggerSolve();
                  addLog('OK', 'Đã thay đèn LED mới.');
                }}
                portMode={portMode}
                onSetPortMode={(m) => {
                  setPortMode(m);
                  triggerSolve();
                  addLog('INFO', `Chế độ cổng I/O chuyển sang: ${m === 'easy' ? 'Dễ' : 'Thực tế'}`);
                }}
              />
            )}

            {rightTab === 'listing' && (
              <div className="h-full overflow-y-auto p-3 text-xs space-y-3 font-mono">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="font-bold text-slate-300">Bảng Listing Mã Máy</span>
                  <button
                    onClick={handleExportHex}
                    className="px-2 py-1 bg-cyan-950 border border-cyan-700 text-cyan-300 rounded text-[11px]"
                  >
                    Tải file HEX
                  </button>
                </div>
                {assembleResult?.listing && assembleResult.listing.length > 0 ? (
                  <div className="space-y-1">
                    {assembleResult.listing.map((item, idx) => (
                      <div key={idx} className="flex gap-2 hover:bg-slate-800/40 px-1 rounded">
                        <span className="text-amber-300 shrink-0">
                          {item.address.toString(16).padStart(4, '0').toUpperCase()}:
                        </span>
                        <span className="text-cyan-400 shrink-0 w-24">
                          {item.bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
                        </span>
                        <span className="text-slate-300 truncate">{item.source}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500 italic text-center py-4">
                    Chưa có bảng listing. Hãy bấm "Biên Dịch" trước.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM TELEMETRY DOCK */}
      <div className="h-56 shrink-0 border-t border-slate-800 flex flex-col bg-[#0d1117]">
        {/* Dock Tab Selector */}
        <div className="flex items-center justify-between px-3 bg-[#161b22] border-b border-slate-800 text-xs">
          <div className="flex items-center">
            <button
              onClick={() => setBottomTab('console')}
              className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
                bottomTab === 'console'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Console Log ({logs.length})
            </button>
            <button
              onClick={() => setBottomTab('registers')}
              className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
                bottomTab === 'registers'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Thanh Ghi &amp; PSW
            </button>
            <button
              onClick={() => setBottomTab('ram')}
              className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
                bottomTab === 'ram'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              RAM Nội 128 Byte
            </button>
            <button
              onClick={() => setBottomTab('sfr')}
              className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
                bottomTab === 'sfr'
                  ? 'border-cyan-400 text-cyan-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              SFR &amp; Cổng P0-P3
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Chu kỳ máy: <span className="text-slate-300 font-bold">{cpuSnapshot.totalCycles}</span> | Thời gian:{' '}
            <span className="text-cyan-300 font-bold">
              {cpuSnapshot.simTimeUs < 1000
                ? `${cpuSnapshot.simTimeUs.toFixed(0)} µs`
                : `${(cpuSnapshot.simTimeUs / 1000).toFixed(2)} ms`}
            </span>
          </div>
        </div>

        {/* Dock Tab Panes */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {bottomTab === 'console' && <Console logs={logs} onClear={() => setLogs([])} />}
          {bottomTab === 'registers' && <RegistersPanel cpuState={cpuSnapshot} />}
          {bottomTab === 'ram' && (
            <RamPanel
              ram={cpuRef.current.ram}
              lastChangedAddr={cpuSnapshot.lastChangedRamAddr}
              onEditByte={(addr, val) => {
                cpuRef.current.writeRam(addr, val);
                setCpuSnapshot(cpuRef.current.getSnapshot());
                addLog('INFO', `Đã sửa RAM[0x${addr.toString(16).toUpperCase()}] = 0x${val.toString(16).toUpperCase()}`);
              }}
            />
          )}
          {bottomTab === 'sfr' && <SfrPanel cpuState={cpuSnapshot} />}
        </div>
      </div>

      {/* 4. CHEAT SHEET MODAL */}
      <CheatSheetModal isOpen={isCheatSheetOpen} onClose={() => setIsCheatSheetOpen(false)} />
    </div>
  );
}
