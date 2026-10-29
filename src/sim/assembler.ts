/**
 * Two-Pass Intel 8051 Assembler in TypeScript
 * Supports all 8051 instructions, standard SFR & bit symbols,
 * directives (ORG, END, EQU, DB, DW, DS, BIT, DATA),
 * forward label resolution, relative jump boundary checking,
 * line error reporting with helpful suggestions, listing table, and Intel HEX export.
 */

import { AssembleError, AssembleResult, ListingItem } from '../types';

export const STANDARD_SYMBOLS: Record<string, { value: number; type: 'sfr' | 'bit' }> = {
  // SFRs
  p0: { value: 0x80, type: 'sfr' },
  sp: { value: 0x81, type: 'sfr' },
  dpl: { value: 0x82, type: 'sfr' },
  dph: { value: 0x83, type: 'sfr' },
  pcon: { value: 0x87, type: 'sfr' },
  tcon: { value: 0x88, type: 'sfr' },
  tmod: { value: 0x89, type: 'sfr' },
  tl0: { value: 0x8a, type: 'sfr' },
  tl1: { value: 0x8b, type: 'sfr' },
  th0: { value: 0x8c, type: 'sfr' },
  th1: { value: 0x8d, type: 'sfr' },
  p1: { value: 0x90, type: 'sfr' },
  scon: { value: 0x98, type: 'sfr' },
  sbuf: { value: 0x99, type: 'sfr' },
  p2: { value: 0xa0, type: 'sfr' },
  ie: { value: 0xa8, type: 'sfr' },
  p3: { value: 0xb0, type: 'sfr' },
  ip: { value: 0xb8, type: 'sfr' },
  psw: { value: 0xd0, type: 'sfr' },
  acc: { value: 0xe0, type: 'sfr' },
  a: { value: 0xe0, type: 'sfr' },
  b: { value: 0xf0, type: 'sfr' },

  // PSW bits
  p: { value: 0xd0, type: 'bit' },
  ov: { value: 0xd2, type: 'bit' },
  rs0: { value: 0xd3, type: 'bit' },
  rs1: { value: 0xd4, type: 'bit' },
  f0: { value: 0xd5, type: 'bit' },
  ac: { value: 0xd6, type: 'bit' },
  cy: { value: 0xd7, type: 'bit' },
  c: { value: 0xd7, type: 'bit' },

  // TCON bits
  it0: { value: 0x88, type: 'bit' },
  ie0: { value: 0x89, type: 'bit' },
  it1: { value: 0x8a, type: 'bit' },
  ie1: { value: 0x8b, type: 'bit' },
  tr0: { value: 0x8c, type: 'bit' },
  tf0: { value: 0x8d, type: 'bit' },
  tr1: { value: 0x8e, type: 'bit' },
  tf1: { value: 0x8f, type: 'bit' },

  // IE bits
  ex0: { value: 0xa8, type: 'bit' },
  et0: { value: 0xa9, type: 'bit' },
  ex1: { value: 0xaa, type: 'bit' },
  et1: { value: 0xab, type: 'bit' },
  es: { value: 0xac, type: 'bit' },
  ea: { value: 0xaf, type: 'bit' },

  // IP bits
  px0: { value: 0xb8, type: 'bit' },
  pt0: { value: 0xb9, type: 'bit' },
  px1: { value: 0xba, type: 'bit' },
  pt1: { value: 0xbb, type: 'bit' },
  ps: { value: 0xbc, type: 'bit' },
};

// Add standard port bits: P0.0-P0.7, P1.0-P1.7, P2.0-P2.7, P3.0-P3.7
for (let port = 0; port <= 3; port++) {
  const base = port === 0 ? 0x80 : port === 1 ? 0x90 : port === 2 ? 0xa0 : 0xb0;
  for (let bit = 0; bit <= 7; bit++) {
    STANDARD_SYMBOLS[`p${port}.${bit}`] = { value: base + bit, type: 'bit' };
  }
}
// Add ACC.0 - ACC.7
for (let bit = 0; bit <= 7; bit++) {
  STANDARD_SYMBOLS[`acc.${bit}`] = { value: 0xe0 + bit, type: 'bit' };
}

interface ParsedLine {
  lineNum: number;
  rawText: string;
  label?: string;
  mnemonic?: string;
  operands: string[];
  pc: number;
}

export class Assembler8051 {
  private symbols: Map<string, number> = new Map();
  private errors: AssembleError[] = [];
  private warnings: string[] = [];
  private listing: ListingItem[] = [];
  private programMemory: Uint8Array = new Uint8Array(65536);
  private addressToLineMap: Map<number, number> = new Map();
  private lineToAddressMap: Map<number, number> = new Map();

  public assemble(source: string): AssembleResult {
    this.symbols.clear();
    this.errors = [];
    this.warnings = [];
    this.listing = [];
    this.programMemory.fill(0);
    this.addressToLineMap.clear();
    this.lineToAddressMap.clear();

    // Populate standard SFRs and bits into symbol table
    for (const [key, item] of Object.entries(STANDARD_SYMBOLS)) {
      this.symbols.set(key.toLowerCase(), item.value);
    }

    const lines = source.split(/\r?\n/);
    const parsedLines: ParsedLine[] = [];
    let currentPc = 0x0000;
    let seenEnd = false;

    // --- PASS 1: Symbol resolution, addresses, and instruction sizing ---
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawText = lines[i];

      // Remove comments (starting with ;)
      const commentIdx = rawText.indexOf(';');
      const codePart = (commentIdx >= 0 ? rawText.substring(0, commentIdx) : rawText).trim();

      if (!codePart) {
        continue;
      }

      if (seenEnd) {
        // Content after END is ignored
        continue;
      }

      // Check for labels (e.g. "MAIN:", "START: MOV A, #1", "VAL EQU 10")
      let remaining = codePart;
      let label: string | undefined;

      const colonIdx = remaining.indexOf(':');
      if (colonIdx > 0 && !remaining.substring(0, colonIdx).includes(' ')) {
        label = remaining.substring(0, colonIdx).trim();
        remaining = remaining.substring(colonIdx + 1).trim();
      }

      // Tokenize mnemonic and operands
      let mnemonic: string | undefined;
      const operands: string[] = [];

      if (remaining) {
        const firstSpace = remaining.search(/\s/);
        if (firstSpace === -1) {
          mnemonic = remaining.toUpperCase();
        } else {
          mnemonic = remaining.substring(0, firstSpace).toUpperCase();
          const opStr = remaining.substring(firstSpace).trim();
          if (opStr) {
            // Split operands by comma, taking into account strings/quotes
            operands.push(...this.splitOperands(opStr));
          }
        }
      }

      // Check if user accidentally omitted mnemonic and started with a port or register
      // e.g. "p0, #0b00000011" or "P1, #1"
      if (mnemonic && (mnemonic.endsWith(',') || this.symbols.has(mnemonic.toLowerCase().replace(/,$/, '')))) {
        const cleanedSym = mnemonic.replace(/,$/, '').toUpperCase();
        this.errors.push({
          line: lineNum,
          rawText,
          message: `Thiếu tên lệnh trước toán hạng "${cleanedSym}"`,
          hint: `Có phải bạn muốn viết: "MOV ${cleanedSym}, ${operands.join(', ')}"?`,
        });
        continue;
      }

      // Check for EQU / DATA / BIT with label preceding
      if (mnemonic === 'EQU' || mnemonic === 'DATA' || mnemonic === 'BIT') {
        const symName = label || (operands.length > 1 ? operands[0] : undefined);
        const expr = operands.length > 1 ? operands[1] : operands[0];
        if (symName && expr) {
          const val = this.evaluateExpression(expr, currentPc, false);
          if (val !== null) {
            this.symbols.set(symName.toLowerCase(), val);
          } else {
            this.errors.push({
              line: lineNum,
              rawText,
              message: `Không thể định trị biểu thức cho ${symName}: "${expr}"`,
              hint: 'Kiểm tra cú pháp số thập lục phân (ví dụ 0FFH) hoặc hằng số.',
            });
          }
        }
        continue;
      }

      // If there is a label at this position, record it
      if (label) {
        const lowerLabel = label.toLowerCase();
        if (this.symbols.has(lowerLabel) && !STANDARD_SYMBOLS[lowerLabel]) {
          this.errors.push({
            line: lineNum,
            rawText,
            message: `Trùng lặp tên nhãn "${label}"`,
            hint: 'Hãy đổi tên nhãn để tránh xung đột.',
          });
        } else {
          this.symbols.set(lowerLabel, currentPc);
        }
      }

      if (!mnemonic) {
        continue;
      }

      // Handle Directives that modify PC
      if (mnemonic === 'ORG') {
        if (operands.length === 0) {
          this.errors.push({
            line: lineNum,
            rawText,
            message: 'Chỉ thị ORG thiếu địa chỉ',
            hint: 'Ví dụ: ORG 0000H hoặc ORG 0030H',
          });
        } else {
          const orgVal = this.evaluateExpression(operands[0], currentPc, false);
          if (orgVal !== null) {
            currentPc = orgVal & 0xffff;
          } else {
            this.errors.push({
              line: lineNum,
              rawText,
              message: `Địa chỉ ORG không hợp lệ: "${operands[0]}"`,
              hint: 'Dùng định dạng số như 0000H, 0030H, 100.',
            });
          }
        }
        continue;
      }

      if (mnemonic === 'END') {
        seenEnd = true;
        continue;
      }

      if (mnemonic === 'DB') {
        const byteCount = this.estimateDbSize(operands);
        parsedLines.push({ lineNum, rawText, label, mnemonic, operands, pc: currentPc });
        this.lineToAddressMap.set(lineNum, currentPc);
        currentPc += byteCount;
        continue;
      }

      if (mnemonic === 'DW') {
        const byteCount = operands.length * 2;
        parsedLines.push({ lineNum, rawText, label, mnemonic, operands, pc: currentPc });
        this.lineToAddressMap.set(lineNum, currentPc);
        currentPc += byteCount;
        continue;
      }

      if (mnemonic === 'DS') {
        const space = this.evaluateExpression(operands[0], currentPc, false) || 1;
        parsedLines.push({ lineNum, rawText, label, mnemonic, operands, pc: currentPc });
        this.lineToAddressMap.set(lineNum, currentPc);
        currentPc += space;
        continue;
      }

      // Instruction length estimate
      const size = this.estimateInstructionLength(mnemonic, operands);
      parsedLines.push({ lineNum, rawText, label, mnemonic, operands, pc: currentPc });
      this.lineToAddressMap.set(lineNum, currentPc);
      currentPc += size;
    }

    if (!seenEnd) {
      this.warnings.push('Cảnh báo: Chương trình không có chỉ thị END ở cuối file.');
    }

    // Stop if Pass 1 had syntax errors
    if (this.errors.length > 0) {
      return this.buildResult(false);
    }

    // --- PASS 2: Machine code generation ---
    let maxAddr = 0;

    for (const item of parsedLines) {
      const { lineNum, rawText, mnemonic, operands, pc } = item;
      if (!mnemonic) continue;

      this.addressToLineMap.set(pc, lineNum);

      let bytes: number[] = [];

      try {
        if (mnemonic === 'DB') {
          bytes = this.emitDb(operands, pc, lineNum, rawText);
        } else if (mnemonic === 'DW') {
          bytes = this.emitDw(operands, pc, lineNum, rawText);
        } else if (mnemonic === 'DS') {
          const count = this.evaluateExpression(operands[0], pc, true) || 1;
          bytes = new Array(count).fill(0);
        } else {
          bytes = this.emitInstruction(mnemonic, operands, pc, lineNum, rawText);
        }
      } catch (err: any) {
        this.errors.push({
          line: lineNum,
          rawText,
          message: err.message || 'Lỗi mã hóa lệnh',
        });
      }

      if (bytes.length > 0) {
        for (let b = 0; b < bytes.length; b++) {
          const addr = pc + b;
          if (addr >= 65536) {
            this.errors.push({
              line: lineNum,
              rawText,
              message: 'Chương trình vượt quá giới hạn bộ nhớ 64KB ROM',
            });
            break;
          }
          this.programMemory[addr] = bytes[b] & 0xff;
          if (addr > maxAddr) maxAddr = addr;
        }

        this.listing.push({
          address: pc,
          bytes,
          lineNum,
          source: rawText,
        });
      }
    }

    const success = this.errors.length === 0;
    return this.buildResult(success, maxAddr);
  }

  // --- TOKENIZE OPERANDS ---
  private splitOperands(str: string): string[] {
    const res: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if ((ch === "'" || ch === '"') && (!inQuote || quoteChar === ch)) {
        inQuote = !inQuote;
        quoteChar = inQuote ? ch : '';
        current += ch;
      } else if (ch === ',' && !inQuote) {
        res.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) {
      res.push(current.trim());
    }
    return res;
  }

  // --- PARSE NUMBER / EXPRESSION ---
  public evaluateExpression(expr: string, currentPc: number, strict: boolean = true): number | null {
    expr = expr.trim();
    if (!expr) return null;

    // Handle $ (Current Location Counter)
    if (expr === '$') {
      return currentPc;
    }

    // HIGH() or LOW()
    const highMatch = expr.match(/^HIGH\s*\((.*)\)$/i);
    if (highMatch) {
      const v = this.evaluateExpression(highMatch[1], currentPc, strict);
      return v !== null ? (v >> 8) & 0xff : null;
    }
    const lowMatch = expr.match(/^LOW\s*\((.*)\)$/i);
    if (lowMatch) {
      const v = this.evaluateExpression(lowMatch[1], currentPc, strict);
      return v !== null ? v & 0xff : null;
    }

    // Character literal: 'A' or "A"
    if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"'))) {
      if (expr.length >= 3) {
        return expr.charCodeAt(1);
      }
    }

    // 1. Binary: 0b00000011, 0B101, 10101010B, 1010b
    if (/^0b[01]+$/i.test(expr)) {
      return parseInt(expr.slice(2), 2);
    }
    if (/^[01]+b$/i.test(expr)) {
      return parseInt(expr.slice(0, -1), 2);
    }

    // 2. Hexadecimal: 0xFF, 0X12, 0FFH, 0FFh, 12H, 10h, 0AH, FFH
    if (/^0x[0-9a-f]+$/i.test(expr)) {
      return parseInt(expr, 16);
    }
    if (/^[0-9][0-9a-f]*h$/i.test(expr)) {
      return parseInt(expr.slice(0, -1), 16);
    }
    if (/^[0-9a-f]+h$/i.test(expr)) {
      return parseInt(expr.slice(0, -1), 16);
    }

    // 3. Decimal with explicit D/d suffix: e.g. 1D, 10D, 255d
    if (/^\d+d$/i.test(expr)) {
      return parseInt(expr.slice(0, -1), 10);
    }

    // 4. Standard Decimal: e.g. 0, 1, 10, 255, 65535
    if (/^\d+$/.test(expr)) {
      return parseInt(expr, 10);
    }

    // Arithmetic expressions: A + B, A - B
    // Support simple + and - operators
    const plusIdx = expr.lastIndexOf('+');
    if (plusIdx > 0 && !expr.startsWith('+')) {
      const left = this.evaluateExpression(expr.substring(0, plusIdx), currentPc, strict);
      const right = this.evaluateExpression(expr.substring(plusIdx + 1), currentPc, strict);
      if (left !== null && right !== null) return left + right;
    }
    const minusIdx = expr.lastIndexOf('-');
    if (minusIdx > 0 && !expr.startsWith('-')) {
      const left = this.evaluateExpression(expr.substring(0, minusIdx), currentPc, strict);
      const right = this.evaluateExpression(expr.substring(minusIdx + 1), currentPc, strict);
      if (left !== null && right !== null) return left - right;
    }

    // Symbol lookup (case-insensitive)
    const lower = expr.toLowerCase();
    if (this.symbols.has(lower)) {
      return this.symbols.get(lower)!;
    }

    if (!strict) return null;
    return null;
  }

  // --- PARSE OPERAND SPECIFIERS ---
  private parseBitAddress(op: string, currentPc: number, line: number, rawText: string): number {
    op = op.trim();
    // Inverted bit: /P1.0 or /BIT
    let inverted = false;
    if (op.startsWith('/') || op.toLowerCase().startsWith('not ')) {
      inverted = true;
      op = op.startsWith('/') ? op.slice(1).trim() : op.slice(4).trim();
    }

    // Check P1.0 or ACC.7 format directly
    const dotIdx = op.indexOf('.');
    if (dotIdx > 0) {
      const byteName = op.substring(0, dotIdx).trim().toLowerCase();
      const bitNum = parseInt(op.substring(dotIdx + 1).trim(), 10);
      if (isNaN(bitNum) || bitNum < 0 || bitNum > 7) {
        throw new Error(`Chỉ số bit không hợp lệ trong "${op}" (phải từ 0 đến 7)`);
      }
      let byteAddr: number | null = null;
      if (this.symbols.has(byteName)) {
        byteAddr = this.symbols.get(byteName)!;
      }
      if (byteAddr === null) {
        throw new Error(`Không xác định được thanh ghi cho bit "${op}"`);
      }
      if (byteAddr >= 0x80 && (byteAddr & 0x07) === 0) {
        // Bit-addressable SFR
        return byteAddr + bitNum;
      } else if (byteAddr >= 0x20 && byteAddr <= 0x2f) {
        // RAM bit addressable 20H-2FH
        return (byteAddr - 0x20) * 8 + bitNum;
      }
    }

    const val = this.evaluateExpression(op, currentPc, true);
    if (val === null) {
      throw new Error(`Không tìm thấy địa chỉ bit "${op}"`);
    }
    return val & 0xff;
  }

  // --- EMIT MACHINE CODES FOR ALL 8051 INSTRUCTIONS ---
  private emitInstruction(mnemonic: string, ops: string[], pc: number, line: number, rawText: string): number[] {
    const upper = mnemonic.toUpperCase();
    const opCount = ops.length;

    // Helper to evaluate immediate #data
    const parseImm = (op: string) => {
      let clean = op.trim();
      if (!clean.startsWith('#')) throw new Error(`Toán hạng phải là hằng số tức thời bắt đầu bằng #: "${op}"`);
      clean = clean.slice(1).trim();
      const val = this.evaluateExpression(clean, pc, true);
      if (val === null) throw new Error(`Không xác định được giá trị hằng số: "${op}"`);
      return val;
    };

    // Helper to evaluate direct RAM / SFR address
    const parseDirect = (op: string) => {
      const val = this.evaluateExpression(op, pc, true);
      if (val === null) throw new Error(`Không xác định được địa chỉ trực tiếp: "${op}"`);
      if (val < 0 || val > 0xff) throw new Error(`Địa chỉ trực tiếp vượt quá 8-bit (00H-FFH): "${op}" = ${val}`);
      return val & 0xff;
    };

    // Helper for relative jump calculation (-128 to +127)
    const parseRelOffset = (targetExpr: string, instSize: number) => {
      const target = this.evaluateExpression(targetExpr, pc, true);
      if (target === null) throw new Error(`Nhãn hoặc địa chỉ đích không xác định: "${targetExpr}"`);
      const diff = target - (pc + instSize);
      if (diff < -128 || diff > 127) {
        throw new Error(
          `Cự ly nhảy tương đối vượt quá khoảng -128..+127 byte (diff = ${diff} byte tới 0x${target.toString(16)}). Hãy dùng LJMP thay cho SJMP/JMP.`
        );
      }
      return (diff + 256) & 0xff;
    };

    // Check register R0-R7
    const getRegIndex = (op: string): number | null => {
      const m = op.trim().toUpperCase().match(/^R([0-7])$/);
      return m ? parseInt(m[1], 10) : null;
    };

    // Check @R0 / @R1
    const getIndirectIndex = (op: string): number | null => {
      const m = op.trim().toUpperCase().match(/^@R([01])$/);
      return m ? parseInt(m[1], 10) : null;
    };

    switch (upper) {
      // NOP
      case 'NOP':
        return [0x00];

      // AJMP addr11
      case 'AJMP': {
        const target = this.evaluateExpression(ops[0], pc, true);
        if (target === null) throw new Error(`Địa chỉ đích không xác định: "${ops[0]}"`);
        const nextPc = pc + 2;
        if ((target & 0xf800) !== (nextPc & 0xf800)) {
          throw new Error('Đích của AJMP phải nằm trong cùng trang 2KB bộ nhớ (hãy dùng LJMP)');
        }
        const a10_8 = (target >> 8) & 0x07;
        return [(a10_8 << 5) | 0x01, target & 0xff];
      }

      // LJMP addr16
      case 'LJMP': {
        const target = this.evaluateExpression(ops[0], pc, true);
        if (target === null) throw new Error(`Địa chỉ đích không xác định: "${ops[0]}"`);
        return [0x02, (target >> 8) & 0xff, target & 0xff];
      }

      // SJMP rel
      case 'SJMP':
        return [0x80, parseRelOffset(ops[0], 2)];

      // JMP @A+DPTR
      case 'JMP': {
        if (ops.length === 1 && ops[0].toUpperCase().replace(/\s+/g, '') === '@A+DPTR') {
          return [0x73];
        }
        // Fallback SJMP if single label
        return [0x80, parseRelOffset(ops[0], 2)];
      }

      // ACALL addr11
      case 'ACALL': {
        const target = this.evaluateExpression(ops[0], pc, true);
        if (target === null) throw new Error(`Địa chỉ đích không xác định: "${ops[0]}"`);
        const nextPc = pc + 2;
        if ((target & 0xf800) !== (nextPc & 0xf800)) {
          throw new Error('Đích của ACALL phải nằm trong cùng trang 2KB (hãy dùng LCALL)');
        }
        const a10_8 = (target >> 8) & 0x07;
        return [(a10_8 << 5) | 0x11, target & 0xff];
      }

      // LCALL addr16
      case 'LCALL': {
        const target = this.evaluateExpression(ops[0], pc, true);
        if (target === null) throw new Error(`Địa chỉ đích không xác định: "${ops[0]}"`);
        return [0x12, (target >> 8) & 0xff, target & 0xff];
      }

      // RET & RETI
      case 'RET':
        return [0x22];
      case 'RETI':
        return [0x32];

      // JZ & JNZ
      case 'JZ':
        return [0x60, parseRelOffset(ops[0], 2)];
      case 'JNZ':
        return [0x70, parseRelOffset(ops[0], 2)];

      // JC & JNC
      case 'JC':
        return [0x40, parseRelOffset(ops[0], 2)];
      case 'JNC':
        return [0x50, parseRelOffset(ops[0], 2)];

      // JB & JNB
      case 'JB':
        return [0x20, this.parseBitAddress(ops[0], pc, line, rawText), parseRelOffset(ops[1], 3)];
      case 'JNB':
        return [0x30, this.parseBitAddress(ops[0], pc, line, rawText), parseRelOffset(ops[1], 3)];

      // JBC bit, rel
      case 'JBC':
        return [0x10, this.parseBitAddress(ops[0], pc, line, rawText), parseRelOffset(ops[1], 3)];

      // CJNE
      case 'CJNE': {
        const [dst, src, rel] = ops;
        const dstUpper = dst.toUpperCase().trim();
        const rDst = getRegIndex(dst);
        const atDst = getIndirectIndex(dst);

        if (dstUpper === 'A' || dstUpper === 'ACC') {
          if (src.startsWith('#')) {
            return [0xb4, parseImm(src) & 0xff, parseRelOffset(rel, 3)];
          } else {
            return [0xb5, parseDirect(src), parseRelOffset(rel, 3)];
          }
        } else if (rDst !== null) {
          return [0xb8 + rDst, parseImm(src) & 0xff, parseRelOffset(rel, 3)];
        } else if (atDst !== null) {
          return [0xb6 + atDst, parseImm(src) & 0xff, parseRelOffset(rel, 3)];
        }
        throw new Error(`Cú pháp CJNE không hợp lệ: CJNE ${ops.join(', ')}`);
      }

      // DJNZ
      case 'DJNZ': {
        const [dst, rel] = ops;
        const rIdx = getRegIndex(dst);
        if (rIdx !== null) {
          return [0xd8 + rIdx, parseRelOffset(rel, 2)];
        } else {
          return [0xd5, parseDirect(dst), parseRelOffset(rel, 3)];
        }
      }

      // MOV
      case 'MOV': {
        const [dst, src] = ops;
        const dstU = dst.toUpperCase().trim();
        const srcU = src.toUpperCase().trim();
        const rDst = getRegIndex(dst);
        const rSrc = getRegIndex(src);
        const atDst = getIndirectIndex(dst);
        const atSrc = getIndirectIndex(src);

        // MOV A, ...
        if (dstU === 'A' || dstU === 'ACC') {
          if (rSrc !== null) return [0xe8 + rSrc];
          if (atSrc !== null) return [0xe6 + atSrc];
          if (src.startsWith('#')) return [0x74, parseImm(src) & 0xff];
          if (srcU === 'C') return [0xa2, this.parseBitAddress('C', pc, line, rawText)];
          return [0xe5, parseDirect(src)];
        }

        // MOV Rn, ...
        if (rDst !== null) {
          if (srcU === 'A' || srcU === 'ACC') return [0xf8 + rDst];
          if (src.startsWith('#')) return [0x78 + rDst, parseImm(src) & 0xff];
          return [0xa8 + rDst, parseDirect(src)];
        }

        // MOV @Ri, ...
        if (atDst !== null) {
          if (srcU === 'A' || srcU === 'ACC') return [0xf6 + atDst];
          if (src.startsWith('#')) return [0x76 + atDst, parseImm(src) & 0xff];
          return [0xa6 + atDst, parseDirect(src)];
        }

        // MOV DPTR, #data16
        if (dstU === 'DPTR') {
          const val = parseImm(src);
          return [0x90, (val >> 8) & 0xff, val & 0xff];
        }

        // MOV C, bit
        if (dstU === 'C') {
          return [0xa2, this.parseBitAddress(src, pc, line, rawText)];
        }

        // MOV bit, C
        if (srcU === 'C') {
          return [0x92, this.parseBitAddress(dst, pc, line, rawText)];
        }

        // MOV direct, ...
        const directAddr = parseDirect(dst);
        if (srcU === 'A' || srcU === 'ACC') return [0xf5, directAddr];
        if (rSrc !== null) return [0x88 + rSrc, directAddr];
        if (atSrc !== null) return [0x86 + atSrc, directAddr];
        if (src.startsWith('#')) return [0x75, directAddr, parseImm(src) & 0xff];
        // MOV direct, direct
        return [0x85, parseDirect(src), directAddr];
      }

      // MOVC A, @A+...
      case 'MOVC': {
        const [dst, src] = ops;
        const norm = src.toUpperCase().replace(/\s+/g, '');
        if (norm === '@A+DPTR') return [0x93];
        if (norm === '@A+PC') return [0x83];
        throw new Error('Cú pháp MOVC hợp lệ: MOVC A, @A+DPTR hoặc MOVC A, @A+PC');
      }

      // MOVX
      case 'MOVX': {
        const [dst, src] = ops;
        const dNorm = dst.toUpperCase().replace(/\s+/g, '');
        const sNorm = src.toUpperCase().replace(/\s+/g, '');
        if (dNorm === 'A' && sNorm === '@DPTR') return [0xe0];
        if (dNorm === '@DPTR' && sNorm === 'A') return [0xf0];
        throw new Error('Cú pháp MOVX hợp lệ: MOVX A, @DPTR hoặc MOVX @DPTR, A');
      }

      // PUSH & POP
      case 'PUSH':
        return [0xc0, parseDirect(ops[0])];
      case 'POP':
        return [0xd0, parseDirect(ops[0])];

      // XCH
      case 'XCH': {
        const [dst, src] = ops;
        const rSrc = getRegIndex(src);
        const atSrc = getIndirectIndex(src);
        if (rSrc !== null) return [0xc8 + rSrc];
        if (atSrc !== null) return [0xc6 + atSrc];
        return [0xc5, parseDirect(src)];
      }

      // XCHD A, @Ri
      case 'XCHD': {
        const atSrc = getIndirectIndex(ops[1]);
        if (atSrc !== null) return [0xd6 + atSrc];
        throw new Error('Cú pháp XCHD hợp lệ: XCHD A, @R0 hoặc XCHD A, @R1');
      }

      // CLR, SETB, CPL
      case 'CLR': {
        const op = ops[0].toUpperCase().trim();
        if (op === 'A' || op === 'ACC') return [0xe4];
        if (op === 'C') return [0xc3];
        return [0xc2, this.parseBitAddress(ops[0], pc, line, rawText)];
      }
      case 'SETB': {
        const op = ops[0].toUpperCase().trim();
        if (op === 'C') return [0xd3];
        return [0xd2, this.parseBitAddress(ops[0], pc, line, rawText)];
      }
      case 'CPL': {
        const op = ops[0].toUpperCase().trim();
        if (op === 'A' || op === 'ACC') return [0xf4];
        if (op === 'C') return [0xb3];
        return [0xb2, this.parseBitAddress(ops[0], pc, line, rawText)];
      }

      // INC & DEC
      case 'INC': {
        const op = ops[0].toUpperCase().trim();
        if (op === 'A' || op === 'ACC') return [0x04];
        if (op === 'DPTR') return [0xa3];
        const r = getRegIndex(ops[0]);
        if (r !== null) return [0x08 + r];
        const at = getIndirectIndex(ops[0]);
        if (at !== null) return [0x06 + at];
        return [0x05, parseDirect(ops[0])];
      }
      case 'DEC': {
        const op = ops[0].toUpperCase().trim();
        if (op === 'A' || op === 'ACC') return [0x14];
        const r = getRegIndex(ops[0]);
        if (r !== null) return [0x18 + r];
        const at = getIndirectIndex(ops[0]);
        if (at !== null) return [0x16 + at];
        return [0x15, parseDirect(ops[0])];
      }

      // ADD & ADDC
      case 'ADD':
      case 'ADDC': {
        const isAddc = upper === 'ADDC';
        const src = ops[1];
        const rSrc = getRegIndex(src);
        const atSrc = getIndirectIndex(src);
        if (rSrc !== null) return [isAddc ? 0x38 + rSrc : 0x28 + rSrc];
        if (atSrc !== null) return [isAddc ? 0x36 + atSrc : 0x26 + atSrc];
        if (src.startsWith('#')) return [isAddc ? 0x34 : 0x24, parseImm(src) & 0xff];
        return [isAddc ? 0x35 : 0x25, parseDirect(src)];
      }

      // SUBB
      case 'SUBB': {
        const src = ops[1];
        const rSrc = getRegIndex(src);
        const atSrc = getIndirectIndex(src);
        if (rSrc !== null) return [0x98 + rSrc];
        if (atSrc !== null) return [0x96 + atSrc];
        if (src.startsWith('#')) return [0x94, parseImm(src) & 0xff];
        return [0x95, parseDirect(src)];
      }

      // MUL & DIV
      case 'MUL':
        return [0xa4];
      case 'DIV':
        return [0x84];
      case 'DA':
        return [0xd4];

      // ANL, ORL, XRL
      case 'ANL':
      case 'ORL':
      case 'XRL': {
        const baseA = upper === 'ANL' ? 0x50 : upper === 'ORL' ? 0x40 : 0x60;
        const [dst, src] = ops;
        const dstU = dst.toUpperCase().trim();
        const srcU = src.toUpperCase().trim();

        // Bit logic: ANL C, bit / ORL C, bit
        if (dstU === 'C') {
          let bit = src;
          let notBit = false;
          if (bit.startsWith('/')) {
            notBit = true;
            bit = bit.slice(1);
          }
          const bitAddr = this.parseBitAddress(bit, pc, line, rawText);
          if (upper === 'ANL') {
            return [notBit ? 0xb0 : 0x82, bitAddr];
          } else if (upper === 'ORL') {
            return [notBit ? 0xa0 : 0x72, bitAddr];
          }
        }

        // Logic with ACC
        if (dstU === 'A' || dstU === 'ACC') {
          const rSrc = getRegIndex(src);
          const atSrc = getIndirectIndex(src);
          if (rSrc !== null) return [baseA + 0x08 + rSrc];
          if (atSrc !== null) return [baseA + 0x06 + atSrc];
          if (src.startsWith('#')) return [baseA + 0x04, parseImm(src) & 0xff];
          return [baseA + 0x05, parseDirect(src)];
        }

        // Logic with direct: ANL direct, A or ANL direct, #data
        const dir = parseDirect(dst);
        if (srcU === 'A' || srcU === 'ACC') {
          return [baseA + 0x02, dir];
        }
        if (src.startsWith('#')) {
          return [baseA + 0x03, dir, parseImm(src) & 0xff];
        }
        throw new Error(`Toán hạng không hợp lệ cho lệnh ${upper}: ${ops.join(', ')}`);
      }

      // Rotations & Swap
      case 'RL':
        return [0x23];
      case 'RLC':
        return [0x33];
      case 'RR':
        return [0x03];
      case 'RRC':
        return [0x13];
      case 'SWAP':
        return [0xc4];

      default:
        throw new Error(`Lệnh không tồn tại hoặc chưa được hỗ trợ: "${upper}"`);
    }
  }

  // --- DIRECTIVE DATA EMITTERS ---
  private estimateDbSize(ops: string[]): number {
    let size = 0;
    for (const op of ops) {
      if ((op.startsWith("'") && op.endsWith("'")) || (op.startsWith('"') && op.endsWith('"'))) {
        size += Math.max(1, op.length - 2);
      } else {
        size += 1;
      }
    }
    return size;
  }

  private emitDb(ops: string[], pc: number, line: number, rawText: string): number[] {
    const bytes: number[] = [];
    for (const op of ops) {
      if ((op.startsWith("'") && op.endsWith("'")) || (op.startsWith('"') && op.endsWith('"'))) {
        const text = op.substring(1, op.length - 1);
        for (let i = 0; i < text.length; i++) {
          bytes.push(text.charCodeAt(i) & 0xff);
        }
      } else {
        const val = this.evaluateExpression(op, pc, true);
        if (val === null) throw new Error(`Không xác định giá trị cho DB: "${op}"`);
        bytes.push(val & 0xff);
      }
    }
    return bytes;
  }

  private emitDw(ops: string[], pc: number, line: number, rawText: string): number[] {
    const bytes: number[] = [];
    for (const op of ops) {
      const val = this.evaluateExpression(op, pc, true);
      if (val === null) throw new Error(`Không xác định giá trị cho DW: "${op}"`);
      bytes.push((val >> 8) & 0xff);
      bytes.push(val & 0xff);
    }
    return bytes;
  }

  private estimateInstructionLength(mnemonic: string, ops: string[]): number {
    const m = mnemonic.toUpperCase();
    if (['NOP', 'RET', 'RETI', 'MUL', 'DIV', 'DA', 'RL', 'RLC', 'RR', 'RRC', 'SWAP'].includes(m)) return 1;
    if (['LJMP', 'LCALL'].includes(m)) return 3;
    if (['SJMP', 'AJMP', 'ACALL', 'JZ', 'JNZ', 'JC', 'JNC'].includes(m)) return 2;
    if (['JB', 'JNB', 'JBC'].includes(m)) return 3;
    if (m === 'CJNE') return 3;
    if (m === 'DJNZ') return ops.length > 1 && ops[0].toUpperCase().startsWith('R') ? 2 : 3;
    if (m === 'MOV') {
      if (ops.length >= 2 && ops[0].toUpperCase().trim() === 'DPTR') return 3;
      const d = ops[0]?.toUpperCase().trim();
      const isA = d === 'A' || d === 'ACC';
      const isC = d === 'C';
      const isR = /^R[0-7]$/.test(d);
      const isAtR = /^@R[01]$/.test(d);

      if (isA) {
        // MOV A, #data (2), MOV A, direct (2), MOV A, Rn (1), MOV A, @Ri (1)
        const s = ops[1]?.toUpperCase().trim();
        if (s.startsWith('#') || (!s.startsWith('R') && !s.startsWith('@'))) return 2;
        return 1;
      }
      if (isR || isAtR) {
        // MOV Rn, #data (2), MOV Rn, direct (2), MOV Rn, A (1)
        const s = ops[1]?.toUpperCase().trim();
        if (s === 'A' || s === 'ACC') return 1;
        return 2;
      }
      if (isC) {
        return 2; // MOV C, bit (2)
      }
      // Destination is direct (e.g. P0, P1, 30H) or bit
      const s = ops[1]?.toUpperCase().trim();
      if (s === 'C') return 2; // MOV bit, C (2)
      if (s === 'A' || s === 'ACC') return 2; // MOV direct, A (2)
      if (/^R[0-7]$/.test(s)) return 2; // MOV direct, Rn (2)
      if (/^@R[01]$/.test(s)) return 2; // MOV direct, @Ri (2)
      // MOV direct, #data (3) or MOV direct, direct (3)
      return 3;
    }
    if (['ADD', 'ADDC', 'SUBB'].includes(m)) {
      if (ops.length >= 2 && (ops[1]?.trim().startsWith('#') || (!ops[1]?.trim().toUpperCase().startsWith('R') && !ops[1]?.trim().toUpperCase().startsWith('@')))) {
        return 2;
      }
      return 1;
    }
    if (['ANL', 'ORL', 'XRL'].includes(m)) {
      if (ops.length >= 2) {
        const d = ops[0]?.toUpperCase().trim();
        if (d === 'C') return 2;
        if (d === 'A' || d === 'ACC') {
          return ops[1]?.trim().startsWith('#') || (!ops[1]?.trim().toUpperCase().startsWith('R') && !ops[1]?.trim().toUpperCase().startsWith('@')) ? 2 : 1;
        }
        return ops[1]?.trim().startsWith('#') ? 3 : 2;
      }
      return 2;
    }
    return 2;
  }

  // --- RESULT BUILDER & INTEL HEX GENERATOR ---
  private buildResult(success: boolean, maxAddr: number = 0): AssembleResult {
    let hexOutput = '';
    if (success) {
      hexOutput = this.generateIntelHex(maxAddr);
    }

    return {
      success,
      errors: this.errors,
      warnings: this.warnings,
      hexOutput,
      codeSize: maxAddr > 0 ? maxAddr + 1 : 0,
      symbolCount: this.symbols.size,
      listing: this.listing,
      programMemory: this.programMemory,
      addressToLineMap: this.addressToLineMap,
      lineToAddressMap: this.lineToAddressMap,
    };
  }

  public generateIntelHex(maxAddr: number): string {
    const lines: string[] = [];
    const bytesPerRecord = 16;

    for (let addr = 0; addr <= maxAddr; addr += bytesPerRecord) {
      const chunkLen = Math.min(bytesPerRecord, maxAddr - addr + 1);
      let sum = chunkLen + ((addr >> 8) & 0xff) + (addr & 0xff) + 0x00;
      let record = `:${chunkLen.toString(16).padStart(2, '0').toUpperCase()}`;
      record += addr.toString(16).padStart(4, '0').toUpperCase();
      record += '00'; // Record type 00 (Data)

      for (let i = 0; i < chunkLen; i++) {
        const byte = this.programMemory[addr + i];
        record += byte.toString(16).padStart(2, '0').toUpperCase();
        sum += byte;
      }

      const checksum = ((~sum + 1) & 0xff).toString(16).padStart(2, '0').toUpperCase();
      record += checksum;
      lines.push(record);
    }

    // End of file record
    lines.push(':00000001FF');
    return lines.join('\n');
  }
}
