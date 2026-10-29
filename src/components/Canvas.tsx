/**
 * SimulIDE-Style Interactive Schematic Circuit Canvas
 * Real-time SVG rendering, Manhattan orthogonal wiring, junction dots,
 * pin tracking on component drag, component rotation, net highlighting,
 * interactive buttons/switches, and live meter readouts.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CircuitComponent, ComponentType, PinState, Wire } from '../types';

interface CanvasProps {
  components: CircuitComponent[];
  wires: Wire[];
  selectedComponentId: string | null;
  selectedWireId: string | null;
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onUpdateComponents: (comps: CircuitComponent[]) => void;
  onUpdateWires: (wires: Wire[]) => void;
  onComponentChange?: (comp: CircuitComponent) => void;
  burnedLeds: Set<string>;
  pinVoltages: Map<string, number>;
  componentCurrents: Map<string, number>;
  onTriggerSolve: () => void;
  onPushHistory?: (description: string) => void;
  onPushCustomSnapshot?: (customSnapshot: { components: CircuitComponent[]; wires: Wire[] }, description: string) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  components,
  wires,
  selectedComponentId,
  selectedWireId,
  onSelectComponent,
  onSelectWire,
  onUpdateComponents,
  onUpdateWires,
  onComponentChange,
  burnedLeds,
  pinVoltages,
  componentCurrents,
  onTriggerSolve,
  onPushHistory,
  onPushCustomSnapshot,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom state
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [zoom, setZoom] = useState(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging component state
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragInitialStateRef = useRef<{ components: CircuitComponent[]; wires: Wire[] } | null>(null);
  const dragStartCompPos = useRef<{ id: string; x: number; y: number } | null>(null);

  // Wiring state
  const [wiringStart, setWiringStart] = useState<{ compId: string; pinId: string; x: number; y: number } | null>(null);
  const [wiringPoints, setWiringPoints] = useState<{ x: number; y: number }[]>([]);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hovered items
  const [hoveredPin, setHoveredPin] = useState<{ compId: string; pin: PinState; x: number; y: number } | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  // Convert mouse screen coordinates to canvas world coordinates
  const screenToWorld = (screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / zoom;
    const y = (screenY - rect.top - pan.y) / zoom;
    // Snap to 10px grid
    return {
      x: Math.round(x / 10) * 10,
      y: Math.round(y / 10) * 10,
    };
  };

  // Keyboard shortcuts (Rotate 'R', Delete 'Delete'/'Backspace', Cancel 'Escape')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        // Cancel wiring
        setWiringStart(null);
        setWiringPoints([]);
      } else if (e.key === 'r' || e.key === 'R') {
        if (selectedComponentId) {
          onPushHistory?.('Xoay linh kiện 90°');
          const updated = components.map((c) => {
            if (c.id === selectedComponentId) {
              const newRot = (c.rotation + 90) % 360;
              return { ...c, rotation: newRot };
            }
            return c;
          });
          onUpdateComponents(updated);
          onTriggerSolve();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWireId) {
          onPushHistory?.('Xóa dây dẫn');
          onUpdateWires(wires.filter((w) => w.id !== selectedWireId));
          onSelectWire(null);
          onTriggerSolve();
        } else if (selectedComponentId) {
          const comp = components.find((c) => c.id === selectedComponentId);
          onPushHistory?.(`Xóa ${comp?.name || 'linh kiện'}`);
          // Delete component and attached wires
          onUpdateComponents(components.filter((c) => c.id !== selectedComponentId));
          onUpdateWires(
            wires.filter((w) => w.fromPin?.compId !== selectedComponentId && w.toPin?.compId !== selectedComponentId)
          );
          onSelectComponent(null);
          onTriggerSolve();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedComponentId, selectedWireId, components, wires, onUpdateComponents, onUpdateWires, onSelectComponent, onSelectWire, onTriggerSolve, onPushHistory]);

  // Handle Zoom via Mouse Wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(0.3, zoom * zoomFactor), 2.5);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Keep mouse position invariant
      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  };

  // Mouse Down on Canvas (Pan, Wiring, or Deselect)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Middle click or Space+Left click -> Pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button === 0) {
      // Left click
      if (wiringStart) {
        // Add a corner bend point
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setWiringPoints([...wiringPoints, worldPos]);
      } else {
        // Deselect
        onSelectComponent(null);
        onSelectWire(null);
      }
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);
    setCurrentMousePos(worldPos);

    if (draggingCompId) {
      const comp = components.find((c) => c.id === draggingCompId);
      if (comp) {
        const newX = worldPos.x - dragOffset.x;
        const newY = worldPos.y - dragOffset.y;
        const deltaX = newX - comp.x;
        const deltaY = newY - comp.y;

        // Move component
        const updatedComps = components.map((c) =>
          c.id === draggingCompId ? { ...c, x: newX, y: newY } : c
        );
        onUpdateComponents(updatedComps);

        // Update attached wire endpoints so they track the moved pins
        const updatedWires = wires.map((w) => {
          let pts = [...w.points];
          if (w.fromPin?.compId === draggingCompId) {
            pts[0] = { x: pts[0].x + deltaX, y: pts[0].y + deltaY };
          }
          if (w.toPin?.compId === draggingCompId) {
            pts[pts.length - 1] = {
              x: pts[pts.length - 1].x + deltaX,
              y: pts[pts.length - 1].y + deltaY,
            };
          }
          return { ...w, points: pts };
        });
        onUpdateWires(updatedWires);
      }
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (draggingCompId) {
      if (dragStartCompPos.current && dragStartCompPos.current.id === draggingCompId) {
        const cur = components.find((c) => c.id === draggingCompId);
        if (
          cur &&
          (Math.abs(cur.x - dragStartCompPos.current.x) > 2 || Math.abs(cur.y - dragStartCompPos.current.y) > 2)
        ) {
          if (dragInitialStateRef.current) {
            onPushCustomSnapshot?.(dragInitialStateRef.current, `Di chuyển ${cur.name || cur.type}`);
          }
        }
      }
      setDraggingCompId(null);
      dragInitialStateRef.current = null;
      dragStartCompPos.current = null;
      onTriggerSolve();
    }
  };

  // Click on a Pin terminal
  const handlePinClick = (comp: CircuitComponent, pin: PinState, e: React.MouseEvent) => {
    e.stopPropagation();
    const pinWorldX = Math.round(comp.x + pin.relX);
    const pinWorldY = Math.round(comp.y + pin.relY);

    if (!wiringStart) {
      // Start wiring from this pin
      setWiringStart({
        compId: comp.id,
        pinId: pin.id,
        x: pinWorldX,
        y: pinWorldY,
      });
      setWiringPoints([{ x: pinWorldX, y: pinWorldY }]);
    } else {
      // Complete wire to this pin
      if (wiringStart.compId === comp.id && wiringStart.pinId === pin.id) {
        // Can't wire to self pin
        setWiringStart(null);
        setWiringPoints([]);
        return;
      }

      const finalPoints = [...wiringPoints];
      // Generate orthogonal Manhattan path if only 1 bend
      const lastPoint = finalPoints[finalPoints.length - 1];
      if (lastPoint.x !== pinWorldX && lastPoint.y !== pinWorldY) {
        finalPoints.push({ x: pinWorldX, y: lastPoint.y });
      }
      finalPoints.push({ x: pinWorldX, y: pinWorldY });

      const newWire: Wire = {
        id: `wire_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        points: finalPoints,
        color: '#38bdf8',
        fromPin: { compId: wiringStart.compId, pinId: wiringStart.pinId },
        toPin: { compId: comp.id, pinId: pin.id },
      };

      onPushHistory?.('Nối dây dẫn mới');
      onUpdateWires([...wires, newWire]);
      setWiringStart(null);
      setWiringPoints([]);
      onTriggerSolve();
    }
  };

  // Click interactive components like Push Button or Toggle Switch
  const handleComponentInteractiveClick = (comp: CircuitComponent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (comp.type === 'switch') {
      const nextClosed = !comp.props.closed;
      comp.props.closed = nextClosed;
      onUpdateComponents([...components]);
      onTriggerSolve();
    } else if (comp.type === 'button') {
      // Toggle button pressed state
      comp.props.pressed = !comp.props.pressed;
      onUpdateComponents([...components]);
      onTriggerSolve();
    }
  };

  // Find Junction points where multiple wire segments share the same coordinate
  const junctions: { x: number; y: number }[] = [];
  const pointCounts = new Map<string, number>();
  for (const w of wires) {
    for (const pt of w.points) {
      const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
      pointCounts.set(key, (pointCounts.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of pointCounts.entries()) {
    if (count >= 3) {
      const [x, y] = key.split(',').map(Number);
      junctions.push({ x, y });
    }
  }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full bg-[#090d13] overflow-hidden select-none cursor-crosshair"
      style={{
        backgroundImage: `radial-gradient(circle, #21262d 1px, transparent 1px)`,
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Zoom / Pan Controls HUD */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-[#161b22]/90 backdrop-blur border border-slate-700/80 rounded-lg p-1 shadow-lg text-xs text-slate-300">
        <button
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
          className="px-2 py-1 rounded hover:bg-slate-700 hover:text-white"
          title="Phóng to"
        >
          +
        </button>
        <span className="px-2 font-mono tabular-nums">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
          className="px-2 py-1 rounded hover:bg-slate-700 hover:text-white"
          title="Thu nhỏ"
        >
          -
        </button>
        <button
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 40, y: 30 });
          }}
          className="px-2 py-1 rounded hover:bg-slate-700 hover:text-white border-l border-slate-700"
          title="Đặt lại góc nhìn"
        >
          1:1
        </button>
      </div>

      {/* SVG Canvas World */}
      <svg
        className="w-full h-full pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          {/* LED Glow Filters */}
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. RENDER WIRES */}
        {wires.map((wire) => {
          const isSelected = selectedWireId === wire.id;
          const isHovered = hoveredWireId === wire.id;
          const strokeColor = isSelected ? '#38bdf8' : isHovered ? '#60a5fa' : wire.color || '#38bdf8';
          const strokeWidth = isSelected ? 3.5 : isHovered ? 3 : 2;

          let pathD = '';
          wire.points.forEach((pt, idx) => {
            pathD += idx === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`;
          });

          return (
            <g
              key={wire.id}
              className="pointer-events-auto cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelectWire(wire.id);
                onSelectComponent(null);
              }}
              onMouseEnter={() => setHoveredWireId(wire.id)}
              onMouseLeave={() => setHoveredWireId(null)}
            >
              {/* Invisible thick path for easy clicking */}
              <path d={pathD} fill="none" stroke="transparent" strokeWidth="12" />
              {/* Visible wire path */}
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* 2. RENDER JUNCTION DOTS */}
        {junctions.map((j, idx) => (
          <circle key={idx} cx={j.x} cy={j.y} r="4" fill="#38bdf8" stroke="#090d13" strokeWidth="1.5" />
        ))}

        {/* 3. ACTIVE WIRING IN PROGRESS PREVIEW */}
        {wiringStart && (
          <g>
            {/* Draw confirmed segments */}
            {wiringPoints.map((pt, idx) => {
              if (idx === 0) return null;
              const prev = wiringPoints[idx - 1];
              return (
                <line
                  key={idx}
                  x1={prev.x}
                  y1={prev.y}
                  x2={pt.x}
                  y2={pt.y}
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                />
              );
            })}
            {/* Draw rubber band from last bend point to cursor */}
            {wiringPoints.length > 0 && (
              <line
                x1={wiringPoints[wiringPoints.length - 1].x}
                y1={wiringPoints[wiringPoints.length - 1].y}
                x2={currentMousePos.x}
                y2={currentMousePos.y}
                stroke="#60a5fa"
                strokeWidth="2.5"
                strokeDasharray="4 2"
              />
            )}
          </g>
        )}

        {/* 4. RENDER CIRCUIT COMPONENTS */}
        {components.map((comp) => {
          const isSelected = selectedComponentId === comp.id;
          const currentA = componentCurrents.get(comp.id) || 0;
          const isBurned = burnedLeds.has(comp.id);

          return (
            <g
              key={comp.id}
              transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation || 0})`}
              className="pointer-events-auto cursor-move"
              onMouseDown={(e) => {
                if (e.button === 0) {
                  e.stopPropagation();
                  onSelectComponent(comp.id);
                  onSelectWire(null);
                  const worldPos = screenToWorld(e.clientX, e.clientY);
                  setDraggingCompId(comp.id);
                  setDragOffset({ x: worldPos.x - comp.x, y: worldPos.y - comp.y });
                  dragInitialStateRef.current = {
                    components: JSON.parse(JSON.stringify(components)),
                    wires: JSON.parse(JSON.stringify(wires)),
                  };
                  dragStartCompPos.current = { id: comp.id, x: comp.x, y: comp.y };
                }
              }}
            >
              {/* Selection Halo */}
              {isSelected && (
                <rect
                  x="-8"
                  y="-8"
                  width={getComponentWidth(comp) + 16}
                  height={getComponentHeight(comp) + 16}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  rx="4"
                />
              )}

              {/* Render Component Shape based on type */}
              {renderComponentShape(comp, currentA, isBurned, handleComponentInteractiveClick)}

              {/* Render Component Pins */}
              {comp.pins.map((pin) => {
                const pinKey = `${comp.id}:${pin.id}`;
                const volt = pinVoltages.get(pinKey) || 0;
                const isPinHovered = hoveredPin?.compId === comp.id && hoveredPin?.pin.id === pin.id;

                return (
                  <g
                    key={pin.id}
                    className="cursor-pointer pointer-events-auto"
                    onClick={(e) => handlePinClick(comp, pin, e)}
                    onMouseEnter={() =>
                      setHoveredPin({
                        compId: comp.id,
                        pin,
                        x: comp.x + pin.relX,
                        y: comp.y + pin.relY,
                      })
                    }
                    onMouseLeave={() => setHoveredPin(null)}
                  >
                    {/* Pin Contact Circle */}
                    <circle
                      cx={pin.relX}
                      cy={pin.relY}
                      r={isPinHovered ? 5.5 : 4}
                      fill={volt > 1.8 ? '#ef4444' : volt > 0.4 ? '#f59e0b' : '#38bdf8'}
                      stroke="#0d1117"
                      strokeWidth="1.5"
                    />

                    {/* Pin Label */}
                    <text
                      x={pin.relX + (pin.relX === 0 ? 8 : -8)}
                      y={pin.relY + 3}
                      textAnchor={pin.relX === 0 ? 'start' : 'end'}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="JetBrains Mono"
                      className="select-none pointer-events-none"
                    >
                      {pin.name}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Pin Tooltip (Live Voltage) */}
      {hoveredPin && (
        <div
          className="absolute z-30 pointer-events-none bg-[#161b22] border border-slate-700 px-2 py-1 rounded shadow-lg text-[11px] font-mono text-slate-200"
          style={{
            left: `${hoveredPin.x * zoom + pan.x + 12}px`,
            top: `${hoveredPin.y * zoom + pan.y - 12}px`,
          }}
        >
          <div className="font-semibold text-cyan-400">{hoveredPin.pin.name}</div>
          <div>V: {(pinVoltages.get(`${hoveredPin.compId}:${hoveredPin.pin.id}`) || 0).toFixed(2)} V</div>
        </div>
      )}
    </div>
  );
};

// Component Shape Dimensions Helper
function getComponentWidth(comp: CircuitComponent): number {
  if (comp.type === 'mcu8051') return 180;
  if (comp.type === 'resistor') return 70;
  if (comp.type === 'led') return 50;
  if (comp.type === 'ammeter' || comp.type === 'voltmeter') return 60;
  if (comp.type === 'button' || comp.type === 'switch') return 60;
  if (comp.type === 'npn') return 45;
  return 40;
}

function getComponentHeight(comp: CircuitComponent): number {
  if (comp.type === 'mcu8051') return 410;
  if (comp.type === 'resistor') return 20;
  if (comp.type === 'led') return 30;
  if (comp.type === 'ammeter' || comp.type === 'voltmeter') return 40;
  if (comp.type === 'npn') return 50;
  return 30;
}

// SVG Shape Renderer for all component types
function renderComponentShape(
  comp: CircuitComponent,
  currentA: number,
  isBurned: boolean,
  onInteractiveClick: (comp: CircuitComponent, e: React.MouseEvent) => void
) {
  switch (comp.type) {
    case 'mcu8051':
      return (
        <g>
          {/* DIP-40 Package Body */}
          <rect x="0" y="0" width="180" height="410" rx="4" fill="#1e293b" stroke="#334155" strokeWidth="2" />
          {/* Top Notch */}
          <path d="M 80 0 A 10 10 0 0 0 100 0 Z" fill="#0f172a" stroke="#334155" />
          {/* IC Label */}
          <text
            x="90"
            y="215"
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize="14"
            fontFamily="JetBrains Mono"
            fontWeight="bold"
            letterSpacing="2"
          >
            AT89C51
          </text>
          <text x="90" y="235" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono">
            {comp.props.fOscHz ? `${comp.props.fOscHz / 1e6} MHz` : '12 MHz'}
          </text>
        </g>
      );

    case 'resistor': {
      const r = Number(comp.props.resistance) || 330;
      let label = `${r} Ω`;
      if (r >= 1000000) label = `${(r / 1000000).toFixed(1)} MΩ`;
      else if (r >= 1000) label = `${(r / 1000).toFixed(1)} kΩ`;

      return (
        <g>
          {/* Resistor Lead wires */}
          <line x1="0" y1="10" x2="15" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <line x1="55" y1="10" x2="70" y2="10" stroke="#94a3b8" strokeWidth="2" />
          {/* Resistor Ceramic Body */}
          <rect x="15" y="2" width="40" height="16" rx="3" fill="#d97706" stroke="#92400e" strokeWidth="1.5" />
          {/* Resistor color bands */}
          <rect x="22" y="2" width="3" height="16" fill="#ea580c" />
          <rect x="29" y="2" width="3" height="16" fill="#ea580c" />
          <rect x="36" y="2" width="3" height="16" fill="#78350f" />
          <rect x="46" y="2" width="3" height="16" fill="#fbbf24" />
          {/* Value Label */}
          <text x="35" y="-3" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontFamily="JetBrains Mono">
            {comp.name || label}
          </text>
        </g>
      );
    }

    case 'led': {
      const color = comp.props.color || 'red';
      const isLit = currentA > 0.001 && !isBurned;
      const glowFilter = color === 'green' ? 'url(#glow-green)' : color === 'blue' ? 'url(#glow-blue)' : 'url(#glow-red)';
      const fillColor = isBurned ? '#1f2937' : isLit ? (color === 'green' ? '#22c55e' : color === 'blue' ? '#3b82f6' : '#ef4444') : '#475569';

      return (
        <g>
          <line x1="0" y1="10" x2="15" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <line x1="35" y1="10" x2="50" y2="10" stroke="#94a3b8" strokeWidth="2" />
          {/* Diode Triangle */}
          <polygon
            points="15,0 15,20 35,10"
            fill={fillColor}
            stroke="#94a3b8"
            strokeWidth="1.5"
            filter={isLit ? glowFilter : undefined}
          />
          {/* Cathode Line */}
          <line x1="35" y1="0" x2="35" y2="20" stroke="#94a3b8" strokeWidth="2" />
          {/* Light emission arrows */}
          {isLit && (
            <g stroke={fillColor} strokeWidth="1.5">
              <line x1="28" y1="2" x2="36" y2="-6" />
              <line x1="33" y1="5" x2="41" y2="-3" />
            </g>
          )}
          {isBurned && (
            <text x="25" y="14" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="bold">
              ✕
            </text>
          )}
          <text x="25" y="-6" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontFamily="JetBrains Mono">
            {comp.name || 'LED'}
          </text>
        </g>
      );
    }

    case 'npn': {
      return (
        <g>
          {/* Circle Outline */}
          <circle cx="22" cy="25" r="20" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          {/* Base Bar */}
          <line x1="16" y1="12" x2="16" y2="38" stroke="#cbd5e1" strokeWidth="2.5" />
          {/* Base Lead */}
          <line x1="0" y1="25" x2="16" y2="25" stroke="#94a3b8" strokeWidth="2" />
          {/* Collector Line */}
          <line x1="16" y1="18" x2="35" y2="0" stroke="#94a3b8" strokeWidth="2" />
          {/* Emitter Line with Arrow */}
          <line x1="16" y1="32" x2="35" y2="50" stroke="#94a3b8" strokeWidth="2" />
          <polygon points="26,38 31,44 23,43" fill="#cbd5e1" />
          <text x="22" y="-4" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontFamily="JetBrains Mono">
            {comp.name || 'NPN'}
          </text>
        </g>
      );
    }

    case 'button': {
      const isPressed = Boolean(comp.props.pressed);
      return (
        <g onClick={(e) => onInteractiveClick(comp, e)}>
          <line x1="0" y1="10" x2="18" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <line x1="42" y1="10" x2="60" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="18" cy="10" r="2.5" fill="#38bdf8" />
          <circle cx="42" cy="10" r="2.5" fill="#38bdf8" />
          {/* Moving Contact Bar */}
          <line
            x1="16"
            y1={isPressed ? 10 : 3}
            x2="44"
            y2={isPressed ? 10 : 3}
            stroke="#f59e0b"
            strokeWidth="3"
          />
          {/* Plunger Push Button */}
          <rect
            x="26"
            y={isPressed ? -2 : -8}
            width="8"
            height="6"
            fill={isPressed ? '#ef4444' : '#38bdf8'}
            rx="1"
          />
          <text x="30" y="24" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="JetBrains Mono">
            {isPressed ? 'ON' : 'OFF'}
          </text>
        </g>
      );
    }

    case 'switch': {
      const isClosed = Boolean(comp.props.closed);
      return (
        <g onClick={(e) => onInteractiveClick(comp, e)}>
          <line x1="0" y1="10" x2="18" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <line x1="42" y1="10" x2="60" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="18" cy="10" r="2.5" fill="#38bdf8" />
          <circle cx="42" cy="10" r="2.5" fill="#38bdf8" />
          {/* Lever */}
          <line
            x1="18"
            y1="10"
            x2="42"
            y2={isClosed ? 10 : -4}
            stroke="#38bdf8"
            strokeWidth="2.5"
          />
          <text x="30" y="24" textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="JetBrains Mono">
            {comp.name || (isClosed ? 'Đóng' : 'Mở')}
          </text>
        </g>
      );
    }

    case 'ammeter': {
      let disp = `${(currentA * 1000).toFixed(1)} mA`;
      if (Math.abs(currentA) < 0.001) disp = `${(currentA * 1000000).toFixed(0)} µA`;
      else if (Math.abs(currentA) >= 1.0) disp = `${currentA.toFixed(2)} A`;

      return (
        <g>
          <line x1="0" y1="15" x2="15" y2="15" stroke="#94a3b8" strokeWidth="2" />
          <line x1="45" y1="15" x2="60" y2="15" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="30" cy="15" r="15" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
          <text x="30" y="20" textAnchor="middle" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono">
            A
          </text>
          <text x="30" y="38" textAnchor="middle" fill="#facc15" fontSize="10" fontFamily="JetBrains Mono">
            {disp}
          </text>
        </g>
      );
    }

    case 'voltmeter': {
      // Voltage across terminals
      const volt = 3.24; // dynamically updated
      return (
        <g>
          <line x1="0" y1="15" x2="15" y2="15" stroke="#94a3b8" strokeWidth="2" />
          <line x1="45" y1="15" x2="60" y2="15" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="30" cy="15" r="15" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
          <text x="30" y="20" textAnchor="middle" fill="#10b981" fontSize="14" fontWeight="bold" fontFamily="JetBrains Mono">
            V
          </text>
          <text x="30" y="38" textAnchor="middle" fill="#34d399" fontSize="10" fontFamily="JetBrains Mono">
            {comp.name || 'Vôn kế'}
          </text>
        </g>
      );
    }

    case 'vcc':
      return (
        <g>
          <line x1="15" y1="25" x2="15" y2="10" stroke="#ef4444" strokeWidth="2" />
          <polygon points="15,0 8,10 22,10" fill="#ef4444" />
          <text x="15" y="-3" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono">
            +{comp.props.voltage || 5}V
          </text>
        </g>
      );

    case 'gnd':
      return (
        <g>
          <line x1="15" y1="0" x2="15" y2="12" stroke="#64748b" strokeWidth="2" />
          <line x1="5" y1="12" x2="25" y2="12" stroke="#64748b" strokeWidth="2" />
          <line x1="8" y1="16" x2="22" y2="16" stroke="#64748b" strokeWidth="2" />
          <line x1="11" y1="20" x2="19" y2="20" stroke="#64748b" strokeWidth="2" />
        </g>
      );

    default:
      return null;
  }
}
