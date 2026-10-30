/**
 * SimulIDE-Style Interactive Schematic Circuit Canvas
 * Real-time SVG rendering, Manhattan orthogonal wiring, junction dots,
 * pin tracking on component drag, component rotation, net highlighting,
 * interactive buttons/switches, live meter readouts,
 * box-marquee selection, multi-component dragging, copy, paste, and duplicate.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CircuitComponent, PinState, Wire } from '../types';

interface CanvasProps {
  components: CircuitComponent[];
  wires: Wire[];
  selectedComponentId: string | null;
  selectedWireId: string | null;
  selectedComponentIds?: string[];
  selectedWireIds?: string[];
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onSelectComponents?: (ids: string[]) => void;
  onSelectWires?: (ids: string[]) => void;
  onUpdateComponents: (comps: CircuitComponent[]) => void;
  onUpdateWires: (wires: Wire[]) => void;
  onComponentChange?: (comp: CircuitComponent) => void;
  burnedLeds: Set<string>;
  pinVoltages: Map<string, number>;
  componentCurrents: Map<string, number>;
  onTriggerSolve: () => void;
  onPushHistory?: (description: string) => void;
  onPushCustomSnapshot?: (customSnapshot: { components: CircuitComponent[]; wires: Wire[] }, description: string) => void;
  onLogMessage?: (level: 'INFO' | 'OK' | 'WARN' | 'ERROR', message: string) => void;
}

interface BoxSelectState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  active: boolean;
  additive: boolean;
}

export const Canvas: React.FC<CanvasProps> = ({
  components,
  wires,
  selectedComponentId,
  selectedWireId,
  selectedComponentIds,
  selectedWireIds,
  onSelectComponent,
  onSelectWire,
  onSelectComponents,
  onSelectWires,
  onUpdateComponents,
  onUpdateWires,
  burnedLeds,
  pinVoltages,
  componentCurrents,
  onTriggerSolve,
  onPushHistory,
  onPushCustomSnapshot,
  onLogMessage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize selected IDs
  const activeCompIds = selectedComponentIds ?? (selectedComponentId ? [selectedComponentId] : []);
  const activeWireIds = selectedWireIds ?? (selectedWireId ? [selectedWireId] : []);

  // Pan & Zoom state
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [zoom, setZoom] = useState(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Multi-drag component state
  const [isDraggingComps, setIsDraggingComps] = useState(false);
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragStartWiresRef = useRef<Map<string, Wire>>(new Map());
  const dragStartMouseWorldRef = useRef<{ x: number; y: number } | null>(null);
  const dragInitialSnapshotRef = useRef<{ components: CircuitComponent[]; wires: Wire[] } | null>(null);

  // Box-selection (marquee) state
  const [boxSelect, setBoxSelect] = useState<BoxSelectState | null>(null);

  // Clipboard for copy & duplicate operations
  const clipboardRef = useRef<{ components: CircuitComponent[]; wires: Wire[] } | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  // Wiring state
  const [wiringStart, setWiringStart] = useState<{ compId: string; pinId: string; x: number; y: number } | null>(null);
  const [wiringPoints, setWiringPoints] = useState<{ x: number; y: number }[]>([]);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hovered items
  const [hoveredPin, setHoveredPin] = useState<{ compId: string; pin: PinState; x: number; y: number } | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  // Convert mouse screen coordinates to canvas world coordinates
  const screenToWorld = (screenX: number, screenY: number, snapGrid = true) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - pan.x) / zoom;
    const y = (screenY - rect.top - pan.y) / zoom;
    if (!snapGrid) return { x, y };
    return {
      x: Math.round(x / 10) * 10,
      y: Math.round(y / 10) * 10,
    };
  };

  // Helper to update selection
  const setSelection = (compIds: string[], wireIds: string[] = []) => {
    if (onSelectComponents) {
      onSelectComponents(compIds);
    } else {
      onSelectComponent(compIds.length > 0 ? compIds[0] : null);
    }

    if (onSelectWires) {
      onSelectWires(wireIds);
    } else {
      onSelectWire(wireIds.length > 0 ? wireIds[0] : null);
    }
  };

  // 1. COPY OPERATION
  const handleCopy = () => {
    if (activeCompIds.length === 0) {
      if (activeWireIds.length > 0) {
        onLogMessage?.('INFO', 'Hãy chọn ít nhất 1 linh kiện để sao chép.');
      }
      return;
    }

    const compsToCopy = components.filter((c) => activeCompIds.includes(c.id));
    const compIdSet = new Set(activeCompIds);

    // Intra-wires connecting between selected components
    const wiresToCopy = wires.filter(
      (w) => w.fromPin && compIdSet.has(w.fromPin.compId) && w.toPin && compIdSet.has(w.toPin.compId)
    );

    clipboardRef.current = {
      components: JSON.parse(JSON.stringify(compsToCopy)),
      wires: JSON.parse(JSON.stringify(wiresToCopy)),
    };
    setHasClipboard(true);
    onLogMessage?.('INFO', `Đã sao chép ${compsToCopy.length} linh kiện (Bấm Ctrl+V để dán).`);
  };

  // 2. PASTE OPERATION
  const handlePaste = () => {
    if (!clipboardRef.current || clipboardRef.current.components.length === 0) {
      onLogMessage?.('WARN', 'Bộ nhớ tạm đang trống. Hãy chọn linh kiện và bấm Ctrl+C trước.');
      return;
    }

    const { components: clipComps, wires: clipWires } = clipboardRef.current;
    const idMap = new Map<string, string>();
    const offset = 40;

    // Create new components with unique IDs and shifted positions
    const newComps: CircuitComponent[] = clipComps.map((c) => {
      const newId = `${c.type}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      idMap.set(c.id, newId);
      return {
        ...c,
        id: newId,
        name: `${c.name || c.type}_copy`,
        x: c.x + offset,
        y: c.y + offset,
      };
    });

    // Create new wires connecting the newly pasted components
    const newWires: Wire[] = clipWires.map((w) => {
      const newWireId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      return {
        ...w,
        id: newWireId,
        points: w.points.map((pt) => ({ x: pt.x + offset, y: pt.y + offset })),
        fromPin: w.fromPin ? { ...w.fromPin, compId: idMap.get(w.fromPin.compId) || w.fromPin.compId } : undefined,
        toPin: w.toPin ? { ...w.toPin, compId: idMap.get(w.toPin.compId) || w.toPin.compId } : undefined,
      };
    });

    onPushHistory?.(`Dán ${newComps.length} linh kiện`);
    onUpdateComponents([...components, ...newComps]);
    onUpdateWires([...wires, ...newWires]);

    // Select the newly pasted components
    const newIds = newComps.map((c) => c.id);
    setSelection(newIds, []);

    // Cascade offset for repeated pastes
    clipboardRef.current.components = clipComps.map((c) => ({ ...c, x: c.x + 20, y: c.y + 20 }));
    clipboardRef.current.wires = clipWires.map((w) => ({
      ...w,
      points: w.points.map((pt) => ({ x: pt.x + 20, y: pt.y + 20 })),
    }));

    onTriggerSolve();
    onLogMessage?.('OK', `Đã dán ${newComps.length} linh kiện.`);
  };

  // 3. DUPLICATE OPERATION (Instant copy & paste at offset)
  const handleDuplicate = () => {
    if (activeCompIds.length === 0) return;

    const compsToDup = components.filter((c) => activeCompIds.includes(c.id));
    const compIdSet = new Set(activeCompIds);

    const wiresToDup = wires.filter(
      (w) => w.fromPin && compIdSet.has(w.fromPin.compId) && w.toPin && compIdSet.has(w.toPin.compId)
    );

    const idMap = new Map<string, string>();
    const offset = 40;

    const newComps: CircuitComponent[] = compsToDup.map((c) => {
      const newId = `${c.type}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      idMap.set(c.id, newId);
      return {
        ...c,
        id: newId,
        name: `${c.name || c.type}_copy`,
        x: c.x + offset,
        y: c.y + offset,
      };
    });

    const newWires: Wire[] = wiresToDup.map((w) => {
      const newWireId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      return {
        ...w,
        id: newWireId,
        points: w.points.map((pt) => ({ x: pt.x + offset, y: pt.y + offset })),
        fromPin: w.fromPin ? { ...w.fromPin, compId: idMap.get(w.fromPin.compId) || w.fromPin.compId } : undefined,
        toPin: w.toPin ? { ...w.toPin, compId: idMap.get(w.toPin.compId) || w.toPin.compId } : undefined,
      };
    });

    onPushHistory?.(`Nhân bản ${newComps.length} linh kiện`);
    onUpdateComponents([...components, ...newComps]);
    onUpdateWires([...wires, ...newWires]);

    const newIds = newComps.map((c) => c.id);
    setSelection(newIds, []);

    onTriggerSolve();
    onLogMessage?.('OK', `Đã nhân bản ${newComps.length} linh kiện.`);
  };

  // 4. DELETE SELECTED ITEMS
  const handleDeleteSelection = () => {
    if (activeCompIds.length === 0 && activeWireIds.length === 0) return;

    const compSet = new Set(activeCompIds);
    const wireSet = new Set(activeWireIds);

    const count = activeCompIds.length + activeWireIds.length;
    onPushHistory?.(`Xóa ${count} thành phần`);

    const remainingComps = components.filter((c) => !compSet.has(c.id));
    const remainingWires = wires.filter(
      (w) =>
        !wireSet.has(w.id) &&
        (!w.fromPin || !compSet.has(w.fromPin.compId)) &&
        (!w.toPin || !compSet.has(w.toPin.compId))
    );

    onUpdateComponents(remainingComps);
    onUpdateWires(remainingWires);
    setSelection([], []);
    onTriggerSolve();
    onLogMessage?.('INFO', `Đã xóa ${count} thành phần.`);
  };

  // 5. ROTATE SELECTED COMPONENTS
  const handleRotateSelection = () => {
    if (activeCompIds.length === 0) return;
    onPushHistory?.(`Xoay ${activeCompIds.length} linh kiện 90°`);
    const compSet = new Set(activeCompIds);
    const updated = components.map((c) => {
      if (compSet.has(c.id)) {
        return { ...c, rotation: ((c.rotation || 0) + 90) % 360 };
      }
      return c;
    });
    onUpdateComponents(updated);
    onTriggerSolve();
  };

  // 6. SELECT ALL
  const handleSelectAll = () => {
    setSelection(
      components.map((c) => c.id),
      wires.map((w) => w.id)
    );
    onLogMessage?.('INFO', `Đã chọn tất cả (${components.length} linh kiện, ${wires.length} dây).`);
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // Escape: Cancel wiring or clear selection
      if (e.key === 'Escape') {
        if (wiringStart) {
          setWiringStart(null);
          setWiringPoints([]);
        } else {
          setSelection([], []);
        }
        return;
      }

      // Ctrl+C / Cmd+C: Copy
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Ctrl+V / Cmd+V: Paste
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Ctrl+D / Cmd+D: Duplicate
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // Ctrl+A / Cmd+A: Select All
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      // R: Rotate selected
      if (e.key === 'r' || e.key === 'R') {
        if (activeCompIds.length > 0) {
          e.preventDefault();
          handleRotateSelection();
        }
        return;
      }

      // Delete / Backspace: Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeCompIds.length > 0 || activeWireIds.length > 0) {
          e.preventDefault();
          handleDeleteSelection();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCompIds, activeWireIds, components, wires, wiringStart]);

  // Handle Zoom via Mouse Wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(0.3, zoom * zoomFactor), 2.5);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  };

  // Mouse Down on Canvas (Pan, Wiring, or Start Marquee Box Selection)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Middle click or Alt+Left click -> Pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button === 0) {
      if (wiringStart) {
        // Add a corner bend point
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setWiringPoints([...wiringPoints, worldPos]);
      } else {
        // Start marquee box selection
        const worldPos = screenToWorld(e.clientX, e.clientY, false);
        setBoxSelect({
          startX: worldPos.x,
          startY: worldPos.y,
          currentX: worldPos.x,
          currentY: worldPos.y,
          active: true,
          additive: e.shiftKey || e.ctrlKey,
        });
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
    const preciseWorldPos = screenToWorld(e.clientX, e.clientY, false);
    setCurrentMousePos(worldPos);

    // Update Box Selection
    if (boxSelect?.active) {
      setBoxSelect((prev) =>
        prev
          ? {
              ...prev,
              currentX: preciseWorldPos.x,
              currentY: preciseWorldPos.y,
            }
          : null
      );
      return;
    }

    // Update Multi-component Dragging
    if (isDraggingComps && dragStartMouseWorldRef.current) {
      const deltaX = worldPos.x - dragStartMouseWorldRef.current.x;
      const deltaY = worldPos.y - dragStartMouseWorldRef.current.y;
      const movingSet = new Set(dragStartPositionsRef.current.keys());

      // Move components
      const updatedComps = components.map((c) => {
        const init = dragStartPositionsRef.current.get(c.id);
        if (init) {
          return { ...c, x: init.x + deltaX, y: init.y + deltaY };
        }
        return c;
      });
      onUpdateComponents(updatedComps);

      // Move wires
      const updatedWires = wires.map((w) => {
        const fromMoving = w.fromPin && movingSet.has(w.fromPin.compId);
        const toMoving = w.toPin && movingSet.has(w.toPin.compId);
        const initW = dragStartWiresRef.current.get(w.id);

        if (initW) {
          if (fromMoving && toMoving) {
            // Both ends moving -> whole wire moves together!
            return {
              ...w,
              points: initW.points.map((pt) => ({ x: pt.x + deltaX, y: pt.y + deltaY })),
            };
          } else if (fromMoving || toMoving) {
            // Only one end moving -> endpoint tracks moving pin
            const pts = initW.points.map((p) => ({ ...p }));
            if (fromMoving) {
              pts[0] = { x: pts[0].x + deltaX, y: pts[0].y + deltaY };
            }
            if (toMoving) {
              pts[pts.length - 1] = { x: pts[pts.length - 1].x + deltaX, y: pts[pts.length - 1].y + deltaY };
            }
            return { ...w, points: pts };
          }
        }
        return w;
      });
      onUpdateWires(updatedWires);
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    // Finalize Marquee Box Selection
    if (boxSelect?.active) {
      const minX = Math.min(boxSelect.startX, boxSelect.currentX);
      const maxX = Math.max(boxSelect.startX, boxSelect.currentX);
      const minY = Math.min(boxSelect.startY, boxSelect.currentY);
      const maxY = Math.max(boxSelect.startY, boxSelect.currentY);

      const boxW = maxX - minX;
      const boxH = maxY - minY;

      if (boxW >= 8 || boxH >= 8) {
        // Find intersecting components
        const hitCompIds: string[] = [];
        for (const comp of components) {
          const cw = getComponentWidth(comp);
          const ch = getComponentHeight(comp);
          const noOverlap = comp.x > maxX || comp.x + cw < minX || comp.y > maxY || comp.y + ch < minY;
          if (!noOverlap) {
            hitCompIds.push(comp.id);
          }
        }

        // Find intersecting wires
        const hitWireIds: string[] = [];
        for (const w of wires) {
          const wireInBox = w.points.some((pt) => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY);
          if (wireInBox) {
            hitWireIds.push(w.id);
          }
        }

        if (boxSelect.additive) {
          const mergedCompIds = Array.from(new Set([...activeCompIds, ...hitCompIds]));
          const mergedWireIds = Array.from(new Set([...activeWireIds, ...hitWireIds]));
          setSelection(mergedCompIds, mergedWireIds);
        } else {
          setSelection(hitCompIds, hitWireIds);
        }

        if (hitCompIds.length > 0) {
          onLogMessage?.('INFO', `Đã quét chọn ${hitCompIds.length} linh kiện.`);
        }
      } else {
        // Simple click without drag -> deselect if not additive
        if (!boxSelect.additive) {
          setSelection([], []);
        }
      }
      setBoxSelect(null);
    }

    // Finalize Component Dragging
    if (isDraggingComps) {
      if (dragInitialSnapshotRef.current && dragStartMouseWorldRef.current) {
        let maxMoved = 0;
        for (const [id, init] of dragStartPositionsRef.current.entries()) {
          const cur = components.find((c) => c.id === id);
          if (cur) {
            const dist = Math.hypot(cur.x - init.x, cur.y - init.y);
            if (dist > maxMoved) maxMoved = dist;
          }
        }

        if (maxMoved > 4) {
          const count = dragStartPositionsRef.current.size;
          onPushCustomSnapshot?.(
            dragInitialSnapshotRef.current,
            count === 1 ? 'Di chuyển linh kiện' : `Di chuyển ${count} linh kiện`
          );
        }
      }

      setIsDraggingComps(false);
      dragStartPositionsRef.current.clear();
      dragStartWiresRef.current.clear();
      dragStartMouseWorldRef.current = null;
      dragInitialSnapshotRef.current = null;
      onTriggerSolve();
    }
  };

  // Component Mouse Down: Handle selection and dragging
  const handleComponentMouseDown = (comp: CircuitComponent, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const isShiftOrCtrl = e.shiftKey || e.ctrlKey;
    let nextCompIds: string[];

    if (isShiftOrCtrl) {
      if (activeCompIds.includes(comp.id)) {
        nextCompIds = activeCompIds.filter((id) => id !== comp.id);
      } else {
        nextCompIds = [...activeCompIds, comp.id];
      }
    } else {
      if (activeCompIds.includes(comp.id)) {
        nextCompIds = activeCompIds; // Keep entire group selected when dragging
      } else {
        nextCompIds = [comp.id]; // Select only this one
      }
    }

    setSelection(nextCompIds, []);

    // Setup multi-drag
    const movingComps = nextCompIds.includes(comp.id) ? nextCompIds : [comp.id];
    const startPositions = new Map<string, { x: number; y: number }>();
    for (const id of movingComps) {
      const c = components.find((item) => item.id === id);
      if (c) startPositions.set(id, { x: c.x, y: c.y });
    }
    dragStartPositionsRef.current = startPositions;

    const startWires = new Map<string, Wire>();
    for (const w of wires) {
      startWires.set(w.id, JSON.parse(JSON.stringify(w)));
    }
    dragStartWiresRef.current = startWires;

    dragInitialSnapshotRef.current = {
      components: JSON.parse(JSON.stringify(components)),
      wires: JSON.parse(JSON.stringify(wires)),
    };

    const worldPos = screenToWorld(e.clientX, e.clientY);
    dragStartMouseWorldRef.current = worldPos;
    setIsDraggingComps(true);
  };

  // Pin Click for Wiring
  const handlePinClick = (comp: CircuitComponent, pin: PinState, e: React.MouseEvent) => {
    e.stopPropagation();
    const pinWorldX = Math.round(comp.x + pin.relX);
    const pinWorldY = Math.round(comp.y + pin.relY);

    if (!wiringStart) {
      setWiringStart({
        compId: comp.id,
        pinId: pin.id,
        x: pinWorldX,
        y: pinWorldY,
      });
      setWiringPoints([{ x: pinWorldX, y: pinWorldY }]);
    } else {
      if (wiringStart.compId === comp.id && wiringStart.pinId === pin.id) {
        setWiringStart(null);
        setWiringPoints([]);
        return;
      }

      const finalPoints = [...wiringPoints];
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

  // Interactive Click (Buttons / Switches)
  const handleComponentInteractiveClick = (comp: CircuitComponent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (comp.type === 'switch') {
      const nextClosed = !comp.props.closed;
      comp.props.closed = nextClosed;
      onUpdateComponents([...components]);
      onTriggerSolve();
    } else if (comp.type === 'button') {
      comp.props.pressed = !comp.props.pressed;
      onUpdateComponents([...components]);
      onTriggerSolve();
    }
  };

  // Junction points
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
      {/* 1. TOP-LEFT QUICK ACTION HUD: Selection info, Copy, Paste, Duplicate, Delete */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-[#161b22]/90 backdrop-blur border border-slate-700/80 rounded-lg p-1.5 shadow-xl text-xs text-slate-300">
        {activeCompIds.length > 0 ? (
          <>
            <span className="px-2 py-0.5 bg-cyan-950 border border-cyan-700 text-cyan-300 font-mono font-bold rounded text-[11px]">
              {activeCompIds.length} đã chọn
            </span>
            <button
              onClick={handleCopy}
              className="px-2 py-1 rounded hover:bg-slate-700 hover:text-white flex items-center gap-1 transition-colors"
              title="Sao chép linh kiện đã chọn (Ctrl + C)"
            >
              <span>Sao chép</span>
              <kbd className="text-[10px] text-slate-400 font-mono">^C</kbd>
            </button>
            <button
              onClick={handleDuplicate}
              className="px-2 py-1 rounded hover:bg-cyan-900/60 hover:text-cyan-200 text-cyan-400 font-semibold flex items-center gap-1 transition-colors"
              title="Nhân bản tức thì linh kiện đã chọn (Ctrl + D)"
            >
              <span>Nhân bản</span>
              <kbd className="text-[10px] text-cyan-300/80 font-mono">^D</kbd>
            </button>
            <button
              onClick={handleRotateSelection}
              className="px-2 py-1 rounded hover:bg-slate-700 hover:text-white flex items-center gap-1 transition-colors"
              title="Xoay 90° (R)"
            >
              <span>Xoay</span>
              <kbd className="text-[10px] text-slate-400 font-mono">R</kbd>
            </button>
            <button
              onClick={handleDeleteSelection}
              className="px-2 py-1 rounded hover:bg-rose-950 hover:text-rose-300 text-rose-400 flex items-center gap-1 transition-colors"
              title="Xóa linh kiện đã chọn (Delete / Backspace)"
            >
              <span>Xóa</span>
              <kbd className="text-[10px] text-rose-400/80 font-mono">Del</kbd>
            </button>
          </>
        ) : (
          <div className="px-2 py-0.5 text-slate-400 text-[11px] flex items-center gap-2">
            <span className="text-cyan-400">💡 Quét chọn:</span>
            <span>Kéo chuột trên vùng trống để <b>quét chọn nhiều linh kiện</b></span>
          </div>
        )}

        {(hasClipboard || clipboardRef.current) && (
          <button
            onClick={handlePaste}
            className="px-2 py-1 ml-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
            title="Dán linh kiện từ bộ nhớ tạm (Ctrl + V)"
          >
            <span>Dán</span>
            <kbd className="text-[10px] text-slate-400 font-mono">^V</kbd>
          </button>
        )}
      </div>

      {/* 2. TOP-RIGHT ZOOM / PAN CONTROLS HUD */}
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
          const isSelected = activeWireIds.includes(wire.id);
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
                if (e.shiftKey || e.ctrlKey) {
                  const nextWires = activeWireIds.includes(wire.id)
                    ? activeWireIds.filter((id) => id !== wire.id)
                    : [...activeWireIds, wire.id];
                  setSelection(activeCompIds, nextWires);
                } else {
                  setSelection([], [wire.id]);
                }
              }}
              onMouseEnter={() => setHoveredWireId(wire.id)}
              onMouseLeave={() => setHoveredWireId(null)}
            >
              <path d={pathD} fill="none" stroke="transparent" strokeWidth="12" />
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

        {/* 4. MARQUEE BOX SELECTION PREVIEW RECTANGLE */}
        {boxSelect?.active && (
          <rect
            x={Math.min(boxSelect.startX, boxSelect.currentX)}
            y={Math.min(boxSelect.startY, boxSelect.currentY)}
            width={Math.abs(boxSelect.currentX - boxSelect.startX)}
            height={Math.abs(boxSelect.currentY - boxSelect.startY)}
            fill="rgba(56, 189, 248, 0.15)"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            rx="2"
          />
        )}

        {/* 5. RENDER CIRCUIT COMPONENTS */}
        {components.map((comp) => {
          const isSelected = activeCompIds.includes(comp.id);
          const currentA = componentCurrents.get(comp.id) || 0;
          const isBurned = burnedLeds.has(comp.id);

          return (
            <g
              key={comp.id}
              transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation || 0})`}
              className="pointer-events-auto cursor-move"
              onMouseDown={(e) => handleComponentMouseDown(comp, e)}
            >
              {/* Animated Selection Halo */}
              {isSelected && (
                <rect
                  x="-8"
                  y="-8"
                  width={getComponentWidth(comp) + 16}
                  height={getComponentHeight(comp) + 16}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  rx="5"
                />
              )}

              {/* Component Shape */}
              {renderComponentShape(comp, currentA, isBurned, handleComponentInteractiveClick)}

              {/* Component Pins */}
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
                    <circle
                      cx={pin.relX}
                      cy={pin.relY}
                      r={isPinHovered ? 5.5 : 4}
                      fill={volt > 1.8 ? '#ef4444' : volt > 0.4 ? '#f59e0b' : '#38bdf8'}
                      stroke="#0d1117"
                      strokeWidth="1.5"
                    />
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

      {/* Pin Live Voltage Tooltip */}
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
          <rect x="0" y="0" width="180" height="410" rx="4" fill="#1e293b" stroke="#334155" strokeWidth="2" />
          <path d="M 80 0 A 10 10 0 0 0 100 0 Z" fill="#0f172a" stroke="#334155" />
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
          <line x1="0" y1="10" x2="15" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <line x1="55" y1="10" x2="70" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <rect x="15" y="2" width="40" height="16" rx="3" fill="#d97706" stroke="#92400e" strokeWidth="1.5" />
          <rect x="22" y="2" width="3" height="16" fill="#ea580c" />
          <rect x="29" y="2" width="3" height="16" fill="#ea580c" />
          <rect x="36" y="2" width="3" height="16" fill="#78350f" />
          <rect x="46" y="2" width="3" height="16" fill="#fbbf24" />
          <text x="35" y="-3" textAnchor="middle" fill="#cbd5e1" fontSize="10" fontFamily="JetBrains Mono">
            {comp.name || label}
          </text>
        </g>
      );
    }

    case 'led': {
      const color = comp.props.color || 'red';
      const isLit = currentA > 0.001 && !isBurned;
      const glowFilter =
        color === 'green' ? 'url(#glow-green)' : color === 'blue' ? 'url(#glow-blue)' : 'url(#glow-red)';
      const fillColor = isBurned
        ? '#1f2937'
        : isLit
        ? color === 'green'
          ? '#22c55e'
          : color === 'blue'
          ? '#3b82f6'
          : '#ef4444'
        : '#475569';

      return (
        <g>
          <line x1="0" y1="10" x2="15" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <line x1="35" y1="10" x2="50" y2="10" stroke="#94a3b8" strokeWidth="2" />
          <polygon
            points="15,0 15,20 35,10"
            fill={fillColor}
            stroke="#94a3b8"
            strokeWidth="1.5"
            filter={isLit ? glowFilter : undefined}
          />
          <line x1="35" y1="0" x2="35" y2="20" stroke="#94a3b8" strokeWidth="2" />
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
          <circle cx="22" cy="25" r="20" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
          <line x1="16" y1="12" x2="16" y2="38" stroke="#cbd5e1" strokeWidth="2.5" />
          <line x1="0" y1="25" x2="16" y2="25" stroke="#94a3b8" strokeWidth="2" />
          <line x1="16" y1="18" x2="35" y2="0" stroke="#94a3b8" strokeWidth="2" />
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
          <line x1="16" y1={isPressed ? 10 : 3} x2="44" y2={isPressed ? 10 : 3} stroke="#f59e0b" strokeWidth="3" />
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
          <line x1="18" y1="10" x2="42" y2={isClosed ? 10 : -4} stroke="#38bdf8" strokeWidth="2.5" />
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
          <text
            x="30"
            y="20"
            textAnchor="middle"
            fill="#38bdf8"
            fontSize="14"
            fontWeight="bold"
            fontFamily="JetBrains Mono"
          >
            A
          </text>
          <text x="30" y="38" textAnchor="middle" fill="#facc15" fontSize="10" fontFamily="JetBrains Mono">
            {disp}
          </text>
        </g>
      );
    }

    case 'voltmeter': {
      return (
        <g>
          <line x1="0" y1="15" x2="15" y2="15" stroke="#94a3b8" strokeWidth="2" />
          <line x1="45" y1="15" x2="60" y2="15" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="30" cy="15" r="15" fill="#1e293b" stroke="#10b981" strokeWidth="2" />
          <text
            x="30"
            y="20"
            textAnchor="middle"
            fill="#10b981"
            fontSize="14"
            fontWeight="bold"
            fontFamily="JetBrains Mono"
          >
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
          <text
            x="15"
            y="-3"
            textAnchor="middle"
            fill="#ef4444"
            fontSize="11"
            fontWeight="bold"
            fontFamily="JetBrains Mono"
          >
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
