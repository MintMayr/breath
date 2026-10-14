import { describe, expect, it } from 'vitest';
import { Session } from './session';
import type { Phase } from './types';

const p = (type: Phase['type'], dur: number): Phase => ({ type, dur, hint: '' });
// 0–4 s ein, 4–10 s aus, 10–40 s halten, 40–50 s erholen
const phases = [p('in', 4), p('out', 6), p('hold', 30), p('rest', 10)];

describe('Session', () => {
  it('lehnt leere Sequenzen ab', () => {
    expect(() => new Session([], 0)).toThrow();
  });

  it('wechselt Phasen anhand absoluter Zeiten', () => {
    const s = new Session(phases, 1000);
    expect(s.advance(4999)).toBe(false);
    expect(s.current.type).toBe('in');
    expect(s.advance(5000)).toBe(true);
    expect(s.current.type).toBe('out');
  });

  it('überspringt mehrere abgelaufene Phasen auf einmal', () => {
    const s = new Session(phases, 0);
    s.advance(45_000);
    expect(s.current.type).toBe('rest');
    expect(s.snapshot(45_000).secondsLeft).toBe(5);
  });

  it('ist nach der letzten Phase fertig und meldet vollen Fortschritt', () => {
    const s = new Session(phases, 0);
    expect(s.advance(60_000)).toBe(true);
    expect(s.status).toBe('done');
    expect(s.snapshot(60_000).doneSeconds).toBe(50);
  });

  it('zeigt Restsekunden aufgerundet und nie 0', () => {
    const s = new Session(phases, 0);
    expect(s.snapshot(0).secondsLeft).toBe(4);
    expect(s.snapshot(3001).secondsLeft).toBe(1);
    expect(s.snapshot(3999).secondsLeft).toBe(1);
  });

  it('friert die Zeit beim Pausieren ein und verschiebt sie beim Fortsetzen', () => {
    const s = new Session(phases, 0);
    s.advance(6000); // 2 s in „aus“
    s.pause(6000);
    expect(s.snapshot(60_000).elapsedMs).toBe(2000);
    expect(s.advance(60_000)).toBe(false);

    expect(s.resume(100_000)).toBe(false);
    expect(s.current.type).toBe('out');
    expect(s.snapshot(100_000).elapsedMs).toBe(2000);
    s.advance(104_000);
    expect(s.current.type).toBe('hold');
  });

  it('setzt ein pausiertes Halten nicht fort, sondern geht weiter', () => {
    const s = new Session(phases, 0);
    s.advance(15_000);
    expect(s.current.type).toBe('hold');
    s.pause(15_000);
    expect(s.resume(30_000)).toBe(true);
    expect(s.current.type).toBe('rest');
    expect(s.snapshot(30_000).secondsLeft).toBe(10);
  });

  it('skip beendet die Phase sofort und die nächste startet ab jetzt', () => {
    const s = new Session(phases, 0);
    s.advance(12_000);
    s.skip(12_000);
    expect(s.current.type).toBe('rest');
    expect(s.snapshot(12_000).secondsLeft).toBe(10);
    // Fortschritt springt auf den Beginn der Erholung (Sekunde 40)
    expect(s.snapshot(12_000).doneSeconds).toBe(40);
  });

  it('zählt vorzeitig beendete Haltephasen, aber kein Überspringen anderer Phasen', () => {
    const s = new Session([...phases, p('hold', 30), p('rest', 10)], 0);
    s.skip(1000); // „ein“ übersprungen: zählt nicht
    expect(s.cutHolds).toBe(0);
    s.advance(10_000);
    expect(s.current.type).toBe('hold');
    s.skip(10_000); // „Jetzt atmen“
    expect(s.cutHolds).toBe(1);
    s.advance(20_000);
    expect(s.current.type).toBe('hold');
    s.pause(25_000); // im Halten pausiert, Fortsetzen überspringt das Halten
    s.resume(40_000);
    expect(s.cutHolds).toBe(2);
  });

  it('zählt voll gehaltene Phasen nicht', () => {
    const s = new Session(phases, 0);
    s.advance(60_000);
    expect(s.status).toBe('done');
    expect(s.cutHolds).toBe(0);
  });

  it('ignoriert Pause/Skip, wenn nicht laufend', () => {
    const s = new Session([p('in', 1)], 0);
    s.advance(2000);
    s.pause(2000);
    s.skip(2000);
    expect(s.status).toBe('done');
    expect(s.resume(3000)).toBe(false);
  });
});
