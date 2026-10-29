/**
 * Integrated Assembly Code Editor
 * 100% pixel-perfect cursor alignment with transparent textarea overlay.
 * Exact shared font metrics ('JetBrains Mono', 13px, 22px line-height, normal font-weight),
 * synchronized scroll, active PC line highlight, error line markers, and breakpoint toggle gutter.
 */

import React, { useEffect, useRef } from 'react';
import { AssembleError } from '../types';

interface EditorProps {
  code: string;
  onChange: (val: string) => void;
  activeLine?: number | null; // 1-indexed source line where PC is currently paused
  errors: AssembleError[];
  breakpoints: Set<number>; // Set of line numbers
  onToggleBreakpoint: (line: number) => void;
  readOnly?: boolean;
}

const LINE_HEIGHT = 22; // px
const PADDING_TOP = 12; // px
const PADDING_LEFT = 10; // px
const FONT_FAMILY = "'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace";

const sharedCodeStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: '13px',
  lineHeight: `${LINE_HEIGHT}px`,
  fontWeight: 400,
  letterSpacing: '0px',
  tabSize: 4,
  MozTabSize: 4,
  whiteSpace: 'pre',
  wordWrap: 'normal',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  boxSizing: 'border-box',
  margin: 0,
  border: 0,
  padding: `${PADDING_TOP}px ${PADDING_LEFT}px`,
};

export const Editor: React.FC<EditorProps> = ({
  code,
  onChange,
  activeLine,
  errors,
  breakpoints,
  onToggleBreakpoint,
  readOnly = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = code.split('\n');
  const errorMap = new Map<number, AssembleError>();
  for (const err of errors) {
    errorMap.set(err.line, err);
  }

  // Synchronize scrolling between textarea, highlight pre, and gutter
  const handleScroll = () => {
    if (textareaRef.current) {
      const top = textareaRef.current.scrollTop;
      const left = textareaRef.current.scrollLeft;

      if (highlightRef.current) {
        highlightRef.current.scrollTop = top;
        highlightRef.current.scrollLeft = left;
      }
      if (gutterRef.current) {
        gutterRef.current.scrollTop = top;
      }
    }
  };

  // Tab key indent (4 spaces)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;

      const newVal = val.substring(0, start) + '    ' + val.substring(end);
      onChange(newVal);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

  return (
    <div className="relative flex h-full w-full bg-[#0d1117] text-[#e6edf3] font-mono text-xs overflow-hidden select-text border border-slate-800 rounded-lg">
      {/* Line Numbers & Breakpoint Gutter */}
      <div
        ref={gutterRef}
        className="w-12 shrink-0 bg-[#161b22] border-r border-slate-800 text-right select-none overflow-hidden text-slate-500"
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          paddingTop: `${PADDING_TOP}px`,
        }}
      >
        {lines.map((_, idx) => {
          const lineNum = idx + 1;
          const hasBp = breakpoints.has(lineNum);
          const isActive = activeLine === lineNum;
          const hasErr = errorMap.has(lineNum);

          return (
            <div
              key={idx}
              onClick={() => onToggleBreakpoint(lineNum)}
              style={{ height: `${LINE_HEIGHT}px`, lineHeight: `${LINE_HEIGHT}px` }}
              className={`pr-2 cursor-pointer flex items-center justify-end gap-1 transition-colors hover:text-slate-200 ${
                isActive ? 'text-amber-400 font-bold' : hasErr ? 'text-rose-400 font-bold' : ''
              }`}
            >
              {hasBp && (
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 shadow-[0_0_6px_#f43f5e]" title="Điểm dừng (Breakpoint)" />
              )}
              {isActive && !hasBp && <span className="text-amber-400 text-[10px]">▶</span>}
              <span>{lineNum}</span>
            </div>
          );
        })}
      </div>

      {/* Editor Body */}
      <div className="relative flex-1 h-full overflow-hidden">
        {/* Background Highlight Strip Layer */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {activeLine && activeLine <= lines.length && (
            <div
              className="absolute left-0 right-0 bg-amber-500/20 border-l-2 border-amber-400 transition-all duration-75"
              style={{
                top: `${PADDING_TOP + (activeLine - 1) * LINE_HEIGHT}px`,
                height: `${LINE_HEIGHT}px`,
              }}
            />
          )}
          {errors.map((err) => (
            <div
              key={err.line}
              className="absolute left-0 right-0 bg-rose-500/15 border-l-2 border-rose-500"
              style={{
                top: `${PADDING_TOP + (err.line - 1) * LINE_HEIGHT}px`,
                height: `${LINE_HEIGHT}px`,
              }}
              title={`${err.message}${err.hint ? ' - ' + err.hint : ''}`}
            />
          ))}
        </div>

        {/* Syntax Highlighted Pre (Identical layout and font metrics) */}
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{
            ...sharedCodeStyle,
            color: '#e6edf3',
          }}
        >
          {lines.map((line, idx) => (
            <React.Fragment key={idx}>
              {highlightAssemblyLine(line)}
              {idx < lines.length - 1 ? '\n' : ''}
            </React.Fragment>
          ))}
        </pre>

        {/* Real Transparent Textarea for Typing */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-cyan-400 resize-none outline-none overflow-auto"
          style={{
            ...sharedCodeStyle,
            caretColor: '#38bdf8',
          }}
        />
      </div>
    </div>
  );
};

// Syntax Highlighting Tokens (All font-weight: 400 to prevent caret drift)
function highlightAssemblyLine(line: string): React.ReactNode[] {
  if (!line) return [' '];

  const commentIdx = line.indexOf(';');
  let codePart = commentIdx >= 0 ? line.substring(0, commentIdx) : line;
  const commentPart = commentIdx >= 0 ? line.substring(commentIdx) : '';

  const nodes: React.ReactNode[] = [];

  // Match labels at start of line: e.g. "MAIN:", "LOOP:"
  const labelMatch = codePart.match(/^([a-zA-Z_][a-zA-Z0-9_]*:)/);
  if (labelMatch) {
    nodes.push(
      <span key="lbl" className="text-pink-400 font-normal">
        {labelMatch[1]}
      </span>
    );
    codePart = codePart.substring(labelMatch[1].length);
  }

  // Regex tokens: Directives, Instructions, Registers, SFRs/bits, Numbers (0b..., 0x..., #1, etc.), Strings
  const tokenRegex = /(\b(?:ORG|END|EQU|DB|DW|DS|BIT|DATA|HIGH|LOW)\b)|(\b(?:MOV|MOVC|MOVX|PUSH|POP|XCH|XCHD|ADD|ADDC|SUBB|INC|DEC|MUL|DIV|DA|ANL|ORL|XRL|CLR|CPL|RL|RLC|RR|RRC|SWAP|SETB|SJMP|AJMP|LJMP|JMP|ACALL|LCALL|RET|RETI|JZ|JNZ|JC|JNC|JB|JNB|JBC|CJNE|DJNZ|NOP)\b)|(\b(?:A|ACC|B|DPTR|DPH|DPL|SP|PSW|C|CY|AC|OV|P|R[0-7]|@R[01]|@DPTR)\b)|(\b(?:P[0-3](?:\.[0-7])?|TMOD|TCON|TH[01]|TL[01]|IE|IP|SCON|SBUF|PCON|TR[01]|TF[01]|IT[01]|IE[01]|ET[01]|EX[01]|EA|ES)\b)|(#\s*(?:0b[01]+|0x[0-9a-fA-F]+|[0-9a-fA-F]+[hH]|[01]+[bB]|\d+[dD]?|\d+)|0b[01]+|0x[0-9a-fA-F]+|[0-9a-fA-F]+[hH]|[01]+[bB]|\b\d+[dD]?\b)|('[^']*'|"[^"]*")|([a-zA-Z_][a-zA-Z0-9_]*)|([,\+\-\*\/\$])/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(codePart)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(codePart.substring(lastIndex, match.index));
    }

    const [full, directive, instruction, reg, sfr, number, stringLit, ident, op] = match;

    if (directive) {
      nodes.push(
        <span key={match.index} className="text-purple-400 font-normal">
          {full}
        </span>
      );
    } else if (instruction) {
      nodes.push(
        <span key={match.index} className="text-cyan-400 font-normal">
          {full}
        </span>
      );
    } else if (reg) {
      nodes.push(
        <span key={match.index} className="text-amber-300 font-normal">
          {full}
        </span>
      );
    } else if (sfr) {
      nodes.push(
        <span key={match.index} className="text-emerald-400 font-normal">
          {full}
        </span>
      );
    } else if (number) {
      nodes.push(
        <span key={match.index} className="text-orange-300 font-normal">
          {full}
        </span>
      );
    } else if (stringLit) {
      nodes.push(
        <span key={match.index} className="text-yellow-200 font-normal">
          {full}
        </span>
      );
    } else if (ident) {
      nodes.push(
        <span key={match.index} className="text-slate-200 font-normal">
          {full}
        </span>
      );
    } else {
      nodes.push(
        <span key={match.index} className="text-slate-400 font-normal">
          {full}
        </span>
      );
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < codePart.length) {
    nodes.push(codePart.substring(lastIndex));
  }

  if (commentPart) {
    nodes.push(
      <span key="comment" className="text-slate-500 italic font-normal">
        {commentPart}
      </span>
    );
  }

  return nodes;
}
