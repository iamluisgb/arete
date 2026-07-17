// Tests deterministas de la capa IA contra el export REAL del atleta.
// El fixture está gitignorado (repo público): si no existe, la suite se salta.
// Para tenerlo: Ajustes → Exportar JSON → copiar a evals/fixtures/arete-real.json
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from '../js/ai/context.js';
import { e1rmByExercise, weeklySeries, loadRatio, bodyTrend } from '../js/ai/metrics.js';
import { makeToolExecutor } from '../js/ai/tools.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../evals/fixtures/arete-real.json');
const hasFixture = existsSync(FIXTURE);
const db = hasFixture ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : null;
const REF = new Date('2026-07-17T12:00:00');

describe.skipIf(!hasFixture)('capa IA con datos reales', () => {
  it('el snapshot se construye completo y compacto', () => {
    const snap = buildSnapshot(db, { name: 'Efecto Kettlebell', phaseName: 'Potencia', sessionNames: ['S5-6 Día 1'] }, REF);
    expect(snap).toContain('PERFIL:');
    expect(snap).toContain('peso 72.6 kg');           // campo real 'peso', no 'weight'
    expect(snap).toContain('e1RM');
    expect(snap).toContain('Sentadilla');
    expect(snap).toContain('ÚLTIMAS SESIONES DE FUERZA');
    // Compacto: debe caber holgado en el presupuesto de contexto (~4 chars/token)
    expect(snap.length / 4).toBeLessThan(4000);
  });

  it('las métricas salen de los datos reales sin NaN', () => {
    const rms = e1rmByExercise(db.workouts, REF);
    expect(Object.keys(rms).length).toBeGreaterThan(5);
    for (const r of Object.values(rms)) {
      if (r.best) expect(Number.isFinite(r.best.rm)).toBe(true);
    }
    const weeks = weeklySeries(db, 8, REF);
    expect(weeks).toHaveLength(8);
    expect(weeks.some(w => w.strengthSessions > 0)).toBe(true);
    const lr = loadRatio(db, REF);
    expect(lr.ratio === null || Number.isFinite(lr.ratio)).toBe(true);
    const bt = bodyTrend(db.bodyLogs, REF);
    expect(bt.weight).toBe(72.6);
  });

  it('las herramientas responden con contenido real', async () => {
    const exec = makeToolExecutor(db, {});
    expect(await exec('get_exercise_history', { name: 'sentadilla', limit: 5 })).toContain('e1RM');
    expect(await exec('get_workouts', { from: '2026-07-01', limit: 10 })).toContain('2026-07');
    expect(await exec('get_body_logs', {})).toContain('peso 72.6');
  });
});
