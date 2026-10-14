import { describe, expect, it } from 'vitest';
import { dayPlanText, extraFor, nextPlannedMode, plannedModes, suggestedMode } from './plan';

const monday = new Date(2026, 9, 12, 12);
const tuesday = new Date(2026, 9, 13, 12);
const saturday = new Date(2026, 9, 17, 12);

describe('Wochenplan', () => {
  it('wechselt an Werktagen zwischen CO₂ und Lippenbremse, Wochenende ohne Zusatz', () => {
    expect(extraFor(monday)).toBe('co2');
    expect(extraFor(tuesday)).toBe('lips');
    expect(extraFor(saturday)).toBeNull();
    expect(plannedModes(saturday)).toEqual(['belly']);
  });

  it('schlägt zuerst Zwerchfell vor, dann die Zusatzübung, dann nichts mehr', () => {
    expect(nextPlannedMode([], monday)).toBe('belly');
    expect(nextPlannedMode(['belly'], monday)).toBe('co2');
    expect(nextPlannedMode(['belly', 'co2'], monday)).toBeNull();
    expect(nextPlannedMode(['co2'], monday)).toBe('belly');
  });

  it('wählt beim Öffnen nach erledigtem Tag wieder Zwerchfell', () => {
    expect(suggestedMode(['belly', 'co2'], monday)).toBe('belly');
    expect(suggestedMode(['belly'], monday)).toBe('co2');
  });

  it('beschreibt den Tag', () => {
    expect(dayPlanText(monday)).toBe('Montag: Zwerchfellatmung, dazu CO₂-Toleranz.');
    expect(dayPlanText(saturday)).toBe('Samstag: nur Zwerchfellatmung, ganz locker.');
  });
});
