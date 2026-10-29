/**
 * Simulation Console Log Panel
 * 4 Levels: INFO, OK, WARN, ERROR with simulation timestamps,
 * level filters, auto-scroll, and clear controls.
 */

import React, { useEffect, useRef, useState } from 'react';
import { LogEntry, LogLevel } from '../types';

interface ConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const Console: React.FC<ConsoleProps> = ({ logs, onClear }) => {
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = filter === 'ALL' ? logs : logs.filter((l) => l.level === filter);

  // Format simulation time
  const formatTime = (us: number) => {
    if (us < 1000) return `${us.toFixed(0)} µs`;
    if (us < 1000000) return `${(us / 1000).toFixed(2)} ms`;
    return `${(us / 1000000).toFixed(3)} s`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 font-mono text-xs overflow-hidden">
      {/* Console Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-slate-400 font-semibold mr-2">Console</span>
          {(['ALL', 'INFO', 'OK', 'WARN', 'ERROR'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === lvl
                  ? 'bg-slate-700 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {lvl === 'ALL' ? 'Tất cả' : lvl}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 w-3 h-3"
            />
            Tự cuộn
          </label>
          <button
            onClick={onClear}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Xóa
          </button>
        </div>
      </div>

      {/* Log Entries Container */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 italic py-2 text-center select-none">
            Không có thông báo nhật ký nào.
          </div>
        ) : (
          filteredLogs.map((log) => {
            let color = 'text-slate-300';
            let badgeBg = 'bg-slate-800 text-slate-400';
            if (log.level === 'OK') {
              color = 'text-emerald-300';
              badgeBg = 'bg-emerald-950 text-emerald-400 border border-emerald-800/60';
            } else if (log.level === 'WARN') {
              color = 'text-amber-300';
              badgeBg = 'bg-amber-950 text-amber-400 border border-amber-800/60';
            } else if (log.level === 'ERROR') {
              color = 'text-rose-300 font-semibold';
              badgeBg = 'bg-rose-950 text-rose-400 border border-rose-800/60';
            }

            return (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed hover:bg-slate-800/30 px-1 rounded">
                <span className="text-slate-500 shrink-0 tabular-nums">[{formatTime(log.time)}]</span>
                <span className={`px-1 rounded text-[10px] font-bold shrink-0 ${badgeBg}`}>{log.level}</span>
                <span className={`flex-1 break-words ${color}`}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
