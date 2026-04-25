// DurationPicker — elapsed-time picker (hours + minutes).
//
// Used for Steaming Time in the Voyage Report. The v6/early-v7 field
// was a plain text input parsed with /^(\d+):(\d{2})$/; crew routinely
// typed "123" (no colon) or "1:2" (one-digit minute) and got no
// feedback — avg speed silently stayed "— kts" until they noticed.
// This picker makes malformed states unrepresentable: hours is a
// digits-only text input, minutes is a 6-min slot <select>.
//
// Hour range is unbounded (a 6-day transatlantic is ~144h). Minute
// slots match the logbook TimePicker6Min so the elapsed math always
// closes over 6-min multiples (SBE/FA/FWE endpoints are 6-min rounded).
//
// Value contract: parent still sees "H:MM" or "HH:MM" (e.g. "0:30",
// "14:30", "144:30"), or '' when either half is unset.
//
// Sync pattern: we hold the two halves in local state and compare
// PARSED parts (not the raw `value` string) to decide whether to
// re-seed from the parent. Two reasons:
//   1. combine() returns '' unless BOTH halves are set, so the first
//      half the user picks would snap back if we drove off `value`.
//   2. A legacy malformed value like "123" parses to ['', ''] — if
//      the parent transitions "123" → "" during an in-flight edit,
//      raw-string comparison would fire a sync and wipe local state.
//      Parts comparison correctly no-ops (both transitions parse to
//      the same empty-empty).

import { useState } from 'react';

const MINUTE_SLOTS = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54];
const pad2 = (n: number): string => String(n).padStart(2, '0');

// Parse "H:MM" / "HH:MM" / "HHH:MM" → [hourStr, minStr] or ['', ''].
// Hour magnitude is unbounded; minutes must be a 6-min slot so the
// on-disk value round-trips cleanly through the picker.
function parseParts(hhmm: string | null | undefined): [string, string] {
  if (!hhmm || typeof hhmm !== 'string') return ['', ''];
  const m = /^(\d+):(\d{2})$/.exec(hhmm);
  if (!m) return ['', ''];
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(h) || h < 0) return ['', ''];
  if (!MINUTE_SLOTS.includes(mm)) return ['', ''];
  return [String(h), pad2(mm)];
}

// Both halves must be set for a value; one-sided is empty downstream.
function combine(hh: string, mm: string): string {
  if (hh === '' || mm === '') return '';
  return `${hh}:${mm}`;
}

// Coerce a keystroke into a non-negative integer string. Strips
// non-digits, rejects NaN, treats empty as empty. Leading zeros are
// stripped by String(Number) except for '0' itself.
function sanitizeHours(raw: string | null | undefined): string {
  if (raw === '' || raw == null) return '';
  const digits = String(raw).replace(/\D+/g, '');
  if (digits === '') return '';
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? String(n) : '';
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
}

export function DurationPicker({ value, onChange, readOnly = false }: Props) {
  const incoming = parseParts(value);
  const [hPart, setHPart] = useState<string>(incoming[0]);
  const [mPart, setMPart] = useState<string>(incoming[1]);
  const [prevParts, setPrevParts] = useState<[string, string]>(incoming);
  if (incoming[0] !== prevParts[0] || incoming[1] !== prevParts[1]) {
    setPrevParts(incoming);
    setHPart(incoming[0]);
    setMPart(incoming[1]);
  }

  const pickHour = (raw: string) => {
    const h = sanitizeHours(raw);
    setHPart(h);
    onChange(combine(h, mPart));
  };
  const pickMinute = (m: string) => {
    setMPart(m);
    onChange(combine(hPart, m));
  };

  if (readOnly) {
    return (
      <div
        className="form-input font-mono text-[0.78rem]"
        style={{ background: 'transparent', border: '1px solid transparent', cursor: 'default' }}
      >
        {value || '—'}
      </div>
    );
  }

  // One wrapper styled as .form-input; inner inputs strip their own
  // chrome so the compound reads as one field. inputMode="numeric"
  // gives mobile keyboards a digit pad without the desktop spinner
  // buttons that a type="number" input would show.
  return (
    <div
      className="form-input font-mono text-[0.78rem]"
      style={{
        padding: '0.25rem 0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={hPart}
        placeholder="0"
        onChange={(e) => pickHour(e.target.value)}
        aria-label="Hours"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text)',
          padding: '0.25rem 0.1rem',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          outline: 'none',
          width: '2.75rem',
          textAlign: 'right',
        }}
      />
      <span style={{ color: 'var(--color-faint)', fontSize: '0.7rem' }}>h</span>
      <select
        value={mPart}
        onChange={(e) => pickMinute(e.target.value)}
        aria-label="Minutes"
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text)',
          padding: '0.25rem 0.1rem',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="">--</option>
        {MINUTE_SLOTS.map((mm) => (
          <option key={mm} value={pad2(mm)}>{pad2(mm)}</option>
        ))}
      </select>
      <span style={{ color: 'var(--color-faint)', fontSize: '0.7rem' }}>m</span>
    </div>
  );
}
