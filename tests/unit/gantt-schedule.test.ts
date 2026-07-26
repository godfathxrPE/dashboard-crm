import { describe, it, expect } from 'vitest';
import {
  computeCascade,
  computeCpm,
  durationDays,
  type ScheduleNode,
  type ScheduleEdge,
} from '@/lib/utils/gantt-schedule';

// Хелперы конструирования узлов/рёбер на чистых литералах (без моков).
const leaf = (id: string, start: string, end: string, parentTaskId: string | null = null): ScheduleNode =>
  ({ id, start, end, hasOwnDates: true, parentTaskId });
const summaryOwn = (id: string, start: string, end: string): ScheduleNode =>
  ({ id, start, end, hasOwnDates: true, parentTaskId: null });
const fs = (predecessor_id: string, successor_id: string, lag_days = 0): ScheduleEdge =>
  ({ predecessor_id, successor_id, dep_type: 'FS', lag_days });
// S-GANTT-DEPTYPES: ребро произвольного типа
const dep = (
  predecessor_id: string,
  successor_id: string,
  dep_type: string,
  lag_days = 0,
): ScheduleEdge => ({ predecessor_id, successor_id, dep_type, lag_days });

const byId = (shifts: ReturnType<typeof computeCascade>) =>
  new Map(shifts.map((s) => [s.id, s]));

describe('computeCascade', () => {
  it('цепочка A→B→C: A уже сдвинут на +3 → B и C едут на +3, длительности целы', () => {
    // Исходно A/B/C впритык по дню; A уже двинут вперёд на 3 дня (anchor).
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'), // было 08-01..08-02, +3
      leaf('B', '2026-08-03', '2026-08-05'), // длительность 2 дня
      leaf('C', '2026-08-06', '2026-08-06'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'C')];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A'])));

    expect(shifts.size).toBe(2);
    // B стартует не раньше A.end (lag 0) = 08-05; длительность 2 дня сохранена.
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-05', end: '2026-08-07' });
    // C стартует не раньше нового B.end = 08-07.
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-07', end: '2026-08-07' });
  });

  it('lag_days = 2 → B.start === A.end + 2 (совпадение с семантикой 1a, НЕ +3)', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-05'),
      leaf('B', '2026-08-02', '2026-08-02'),
    ];
    const shifts = byId(computeCascade(nodes, [fs('A', 'B', 2)], new Set(['A'])));
    // earliest = A.end(08-05) + 2 = 08-07 — вне зависимости от «на сколько двинули A».
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-07', end: '2026-08-07' });
  });

  it('у B запас 5 дней, A двинут на 2 → B (и C) НЕ двигаются (только вперёд)', () => {
    const nodes = [
      leaf('A', '2026-08-03', '2026-08-04'), // было 08-01..08-02, +2
      leaf('B', '2026-08-10', '2026-08-11'), // старт с большим запасом
      leaf('C', '2026-08-20', '2026-08-20'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'C')];
    expect(computeCascade(nodes, edges, new Set(['A']))).toEqual([]);
  });

  it('ромб A→B, A→C, B→D, C→D с разными lag → D по максимуму из ветвей', () => {
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'), // anchor (двинут)
      leaf('B', '2026-08-01', '2026-08-06'),
      leaf('C', '2026-08-01', '2026-08-03'),
      leaf('D', '2026-08-02', '2026-08-02'),
    ];
    // B тянется от A (lag 0), C от A (lag 0); D = max(B.end+1, C.end+3).
    const edges = [fs('A', 'B'), fs('A', 'C'), fs('B', 'D', 1), fs('C', 'D', 3)];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A'])));

    // B: start ≥ A.end(08-05), длит 5 → 08-05..08-10
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-05', end: '2026-08-10' });
    // C: start ≥ A.end(08-05), длит 2 → 08-05..08-07
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-05', end: '2026-08-07' });
    // D: max(B.end 08-10 +1 = 08-11, C.end 08-07 +3 = 08-10) = 08-11
    expect(shifts.get('D')).toMatchObject({ start: '2026-08-11', end: '2026-08-11' });
  });

  it('неизвестный dep_type полностью игнорируется (мусор мимо CHECK 048)', () => {
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'),
      leaf('B', '2026-08-01', '2026-08-02'),
    ];
    expect(computeCascade(nodes, [dep('A', 'B', 'XX')], new Set(['A']))).toEqual([]);
  });

  it('successor — сводный узел с двумя детьми → едут оба ребёнка + сам узел (hasOwnDates)', () => {
    // S — сводная (обёртка детей S1..S2), у неё собственные даты (hasOwnDates).
    const nodes = [
      leaf('A', '2026-08-10', '2026-08-11'),          // anchor (двинут вперёд)
      summaryOwn('S', '2026-08-01', '2026-08-05'),    // wrapper = дети
      leaf('S1', '2026-08-01', '2026-08-02', 'S'),
      leaf('S2', '2026-08-04', '2026-08-05', 'S'),
    ];
    const shifts = byId(computeCascade(nodes, [fs('A', 'S')], new Set(['A'])));

    // earliest = A.end(08-11); S.start 08-01 → Δ = 10 дней ко всему поддереву.
    expect(shifts.size).toBe(3);
    expect(shifts.get('S')).toMatchObject({ deltaDays: 10, start: '2026-08-11', reason: 'dependency' });
    expect(shifts.get('S1')).toMatchObject({ deltaDays: 10, start: '2026-08-11', end: '2026-08-12', reason: 'subtree' });
    expect(shifts.get('S2')).toMatchObject({ deltaDays: 10, start: '2026-08-14', end: '2026-08-15', reason: 'subtree' });
  });

  it('successor уже в anchors → не двигается, но его хвост считается от текущих дат', () => {
    // B — тоже якорь (пользователь двигал и его). B не двигаем, но C тянется от B.
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'),
      leaf('B', '2026-08-08', '2026-08-09'), // якорь: своя дата, неподвижна
      leaf('C', '2026-08-01', '2026-08-01'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'C')];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A', 'B'])));

    expect(shifts.has('B')).toBe(false);                 // якорь неподвижен
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-09', end: '2026-08-09' }); // от B.end
  });

  // ── S-GANTT-DEPTYPES: SS / FF / SF в каскаде ───────────────────────────────
  // Общая канва: A — якорь 08-05..08-09, B — 08-01..08-03 (длительность 3 дня).
  // Меняется только тип ребра, поэтому видно, КАКОЙ конец B к КАКОМУ концу A тянется.

  it('SS: B.start подтягивается к A.start (не к A.end), длительность цела', () => {
    const nodes = [leaf('A', '2026-08-05', '2026-08-09'), leaf('B', '2026-08-01', '2026-08-03')];
    const shifts = byId(computeCascade(nodes, [dep('A', 'B', 'SS')], new Set(['A'])));
    // earliest = A.start 08-05 (НЕ A.end 08-09); Δ = 4, длительность 3 дня сохранена
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-05', end: '2026-08-07', deltaDays: 4 });
  });

  it('SS с lag 2: earliest = A.start + 2', () => {
    const nodes = [leaf('A', '2026-08-05', '2026-08-09'), leaf('B', '2026-08-01', '2026-08-03')];
    const shifts = byId(computeCascade(nodes, [dep('A', 'B', 'SS', 2)], new Set(['A'])));
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-07', end: '2026-08-09' });
  });

  it('FF: к A.end подтягивается ФИНИШ B, старт восстанавливается по длительности', () => {
    const nodes = [leaf('A', '2026-08-05', '2026-08-09'), leaf('B', '2026-08-01', '2026-08-03')];
    const shifts = byId(computeCascade(nodes, [dep('A', 'B', 'FF')], new Set(['A'])));
    // B.end 08-03 → 08-09 (Δ = 6); старт = 08-09 − (3−1) = 08-07, а НЕ 08-09
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-07', end: '2026-08-09', deltaDays: 6 });
  });

  it('SF: финиш B подтягивается к A.start', () => {
    const nodes = [leaf('A', '2026-08-05', '2026-08-09'), leaf('B', '2026-08-01', '2026-08-03')];
    const shifts = byId(computeCascade(nodes, [dep('A', 'B', 'SF')], new Set(['A'])));
    // B.end 08-03 → A.start 08-05 (Δ = 2); старт 08-03
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-03', end: '2026-08-05', deltaDays: 2 });
  });

  it('lag 0: ограничиваемый конец ровно на earliest → сдвига НЕТ (для всех четырёх типов)', () => {
    const a = leaf('A', '2026-08-01', '2026-08-05');
    const anchors = new Set(['A']);
    // FS: B.start === A.end;  SS: B.start === A.start
    expect(computeCascade([a, leaf('B', '2026-08-05', '2026-08-06')], [fs('A', 'B')], anchors)).toEqual([]);
    expect(computeCascade([a, leaf('B', '2026-08-01', '2026-08-02')], [dep('A', 'B', 'SS')], anchors)).toEqual([]);
    // FF: B.end === A.end;    SF: B.end === A.start
    expect(computeCascade([a, leaf('B', '2026-08-04', '2026-08-05')], [dep('A', 'B', 'FF')], anchors)).toEqual([]);
    expect(computeCascade([a, leaf('B', '2026-08-01', '2026-08-01')], [dep('A', 'B', 'SF')], anchors)).toEqual([]);
  });

  it('смешанный граф: у C рёбра FS и FF → едет по максимуму требуемого Δ, не по последнему', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-04'),   // якорь: FS требует C.start ≥ 08-04 ⇒ Δ = 2
      leaf('B', '2026-08-01', '2026-08-10'),   // якорь: FF требует C.end   ≥ 08-10 ⇒ Δ = 7
      leaf('C', '2026-08-02', '2026-08-03'),
    ];
    const edges = [fs('A', 'C'), dep('B', 'C', 'FF')];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A', 'B'])));
    // Δ = max(2, 7) = 7 — сравнивать «даты earliest» разных типов между собой нельзя,
    // сопоставимы только требуемые сдвиги.
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-09', end: '2026-08-10', deltaDays: 7 });
  });

  it('SS-цепочка A→B→C: сдвиг стартов распространяется по топопорядку', () => {
    const nodes = [
      leaf('A', '2026-08-05', '2026-08-06'),   // якорь
      leaf('B', '2026-08-01', '2026-08-02'),
      leaf('C', '2026-08-01', '2026-08-01'),
    ];
    const edges = [dep('A', 'B', 'SS'), dep('B', 'C', 'SS', 1)];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A'])));
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-05', end: '2026-08-06' });
    // C считается от УЖЕ сдвинутого B.start (08-05) + 1
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-06', end: '2026-08-06' });
  });

  it('искусственный цикл A→B→A → возвращает результат без зависания', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-02'),
      leaf('B', '2026-08-03', '2026-08-04'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'A')];
    // Оба узла в цикле → topo пуст → сдвигов нет, функция не виснет.
    expect(computeCascade(nodes, edges, new Set(['A']))).toEqual([]);
  });
});

describe('durationDays', () => {
  it('календарные дни включительно; милстоун (start === end) = 1', () => {
    expect(durationDays('2026-08-01', '2026-08-01')).toBe(1); // милстоун
    expect(durationDays('2026-08-01', '2026-08-02')).toBe(2);
    expect(durationDays('2026-08-01', '2026-08-05')).toBe(5);
  });

  it('end < start → клэмп в 1 (защита, не роняем расчёт)', () => {
    expect(durationDays('2026-08-05', '2026-08-01')).toBe(1);
  });
});

describe('computeCpm', () => {
  it('линейная цепочка встык без запасов → все TF = 0, все критические', () => {
    // Стык по дню: B.start = A.end (lag 0 легален), C.start = B.end — реального зазора нет.
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-02'), // dur 2
      leaf('B', '2026-08-02', '2026-08-03'), // dur 2, встык к A
      leaf('C', '2026-08-03', '2026-08-04'), // dur 2, встык к B
    ];
    const { byId, projectFinish } = computeCpm(nodes, [fs('A', 'B'), fs('B', 'C')]);
    expect(projectFinish).toBe('2026-08-04');
    for (const id of ['A', 'B', 'C']) {
      expect(byId.get(id)!.totalFloat).toBe(0);
      expect(byId.get(id)!.critical).toBe(true);
    }
    expect(byId.get('A')).toMatchObject({ es: '2026-08-01', ef: '2026-08-02' });
    expect(byId.get('C')).toMatchObject({ es: '2026-08-03', ef: '2026-08-04' });
  });

  it('параллельная ветка короче на 3 дня → у неё TF = 3, у длинной TF = 0', () => {
    // A → B(длинная, dur5) → C ; A → D(короткая, dur2) → C. C встык к концу B.
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-02'), // dur 2
      leaf('B', '2026-08-02', '2026-08-06'), // dur 5 (критическая ветвь)
      leaf('D', '2026-08-02', '2026-08-03'), // dur 2 (запас)
      leaf('C', '2026-08-06', '2026-08-06'), // dur 1, стык к B.end
    ];
    const edges = [fs('A', 'B'), fs('A', 'D'), fs('B', 'C'), fs('D', 'C')];
    const { byId } = computeCpm(nodes, edges);
    expect(byId.get('B')!.totalFloat).toBe(0);
    expect(byId.get('B')!.critical).toBe(true);
    expect(byId.get('D')!.totalFloat).toBe(3);
    expect(byId.get('D')!.critical).toBe(false);
    expect(byId.get('C')!.critical).toBe(true);
  });

  it('ДВЕ независимые критические цепочки равной длины → обе подсвечены (longest-path ронял)', () => {
    const nodes = [
      leaf('A1', '2026-08-01', '2026-08-02'), leaf('A2', '2026-08-02', '2026-08-03'),
      leaf('B1', '2026-08-01', '2026-08-02'), leaf('B2', '2026-08-02', '2026-08-03'),
    ];
    const edges = [fs('A1', 'A2'), fs('B1', 'B2')];
    const { byId, projectFinish } = computeCpm(nodes, edges);
    expect(projectFinish).toBe('2026-08-03');
    for (const id of ['A1', 'A2', 'B1', 'B2']) {
      expect(byId.get(id)!.critical).toBe(true); // ОБЕ цепочки, не одна
    }
  });

  it('lag_days = 2 учитывается в ES (прямой) и в LF (обратный) симметрично', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-05'), // dur 5
      leaf('B', '2026-08-07', '2026-08-07'), // старт ровно на earliest = A.end + 2
    ];
    const { byId, projectFinish } = computeCpm(nodes, [fs('A', 'B', 2)]);
    // прямой: ES(B) = shiftDay(EF(A)=08-05, +2) = 08-07
    expect(byId.get('B')!.es).toBe('2026-08-07');
    // обратный: LF(A) = LS(B) − 2 = 08-07 − 2 = 08-05 (та же lag назад)
    expect(byId.get('A')!.lf).toBe('2026-08-05');
    expect(projectFinish).toBe('2026-08-07');
    expect(byId.get('A')!.critical).toBe(true);
    expect(byId.get('B')!.critical).toBe(true);
  });

  it('ручное FS-нарушение (succ.start < earliest) → ES подтянут к earliest, критическая, float НЕ отрицательный', () => {
    // РАСХОЖДЕНИЕ с ранним текстом спринта: TF < 0 в этой модели недостижим (TF = LF − EF ≥ 0
    // доказуемо). Нарушение проявляется как ES > own_start (узел подтянут к earliest);
    // «просрочку» тултип считает отдельно как ES − own_start, а не через отрицательный float.
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-05'), // dur 5
      leaf('B', '2026-08-02', '2026-08-02'), // юзер поставил старт 08-02, earliest = A.end 08-05
    ];
    const { byId } = computeCpm(nodes, [fs('A', 'B')]);
    const b = byId.get('B')!;
    expect(b.es).toBe('2026-08-05');           // подтянут к earliest (own_start был 08-02)
    expect(b.totalFloat).toBeGreaterThanOrEqual(0); // НЕ отрицательный
    expect(b.critical).toBe(true);
    // Тот же сигнал, что 1a рисует стрелкой: ES − own_start = 3 дня «просрочки».
    expect(b.es > '2026-08-02').toBe(true);
  });

  it('одиночный узел без рёбер → TF = 0, projectFinish = его end', () => {
    const { byId, projectFinish } = computeCpm([leaf('A', '2026-08-01', '2026-08-04')], []);
    expect(projectFinish).toBe('2026-08-04');
    expect(byId.get('A')).toMatchObject({ es: '2026-08-01', ef: '2026-08-04', totalFloat: 0, critical: true });
  });

  it('милстоун (start === end) → dur = 1, участвует в цепочке', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-02'), // dur 2
      leaf('M', '2026-08-02', '2026-08-02'), // милстоун, dur 1
      leaf('C', '2026-08-02', '2026-08-03'), // dur 2
    ];
    const { byId } = computeCpm(nodes, [fs('A', 'M'), fs('M', 'C')]);
    expect(byId.get('M')).toMatchObject({ es: '2026-08-02', ef: '2026-08-02', critical: true });
    expect(byId.get('M')!.totalFloat).toBe(0);
  });

  it('цикл A→B→A → без зависания, оба узла в byId, не критические, projectFinish null', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-02'),
      leaf('B', '2026-08-03', '2026-08-04'),
    ];
    const { byId, projectFinish } = computeCpm(nodes, [fs('A', 'B'), fs('B', 'A')]);
    expect(byId.size).toBe(2);
    expect(byId.get('A')).toMatchObject({ totalFloat: 0, critical: false });
    expect(byId.get('B')).toMatchObject({ totalFloat: 0, critical: false });
    expect(projectFinish).toBeNull();
  });

  it('пустой граф → { byId: пусто, projectFinish: null }, без исключений', () => {
    const { byId, projectFinish } = computeCpm([], []);
    expect(byId.size).toBe(0);
    expect(projectFinish).toBeNull();
  });

  // ── S-GANTT-DEPTYPES: SS / FF / SF в обоих проходах ───────────────────────
  // На каждый тип проверяем ES/EF (прямой) И LS/LF/TF (обратный) — расчёт границы
  // «в старт» и обратный перевод «в финиш» несимметричны по коду и ломаются порознь.

  it('SS: прямой берёт ES предшественника, обратный переводит границу LS→LF', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-05'), // dur 5
      leaf('B', '2026-08-01', '2026-08-02'), // dur 2
    ];
    const { byId, projectFinish } = computeCpm(nodes, [dep('A', 'B', 'SS')]);
    expect(projectFinish).toBe('2026-08-05');
    // прямой: ES(B) = ES(A) = 08-01 (НЕ EF(A) = 08-05)
    expect(byId.get('B')).toMatchObject({ es: '2026-08-01', ef: '2026-08-02' });
    // обратный: LF(B) = PF; запас 3 дня. LF(A) капнут горизонтом (SS не держит финиш A)
    expect(byId.get('B')).toMatchObject({ ls: '2026-08-04', lf: '2026-08-05', totalFloat: 3, critical: false });
    expect(byId.get('A')).toMatchObject({ lf: '2026-08-05', ls: '2026-08-01', totalFloat: 0, critical: true });
  });

  it('SS с lag 2: ES(B) = ES(A) + 2, та же lag назад в обратном проходе', () => {
    const nodes = [leaf('A', '2026-08-01', '2026-08-05'), leaf('B', '2026-08-01', '2026-08-02')];
    const { byId } = computeCpm(nodes, [dep('A', 'B', 'SS', 2)]);
    expect(byId.get('B')!.es).toBe('2026-08-03');
    expect(byId.get('B')!.totalFloat).toBe(1);            // LS 08-04 − ES 08-03
    expect(byId.get('A')!.critical).toBe(true);
  });

  it('FF: прямой задаёт EF напрямую (старт восстановлен вычитанием длительности), оба конца критические', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-05'), // dur 5
      leaf('B', '2026-08-01', '2026-08-03'), // dur 3
    ];
    const { byId, projectFinish } = computeCpm(nodes, [dep('A', 'B', 'FF')]);
    expect(projectFinish).toBe('2026-08-05');
    // EF(B) ≥ EF(A) = 08-05 ⇒ ES(B) = 08-05 − (3−1) = 08-03 (own_start 08-01 перекрыт)
    expect(byId.get('B')).toMatchObject({ es: '2026-08-03', ef: '2026-08-05' });
    // обратный: LF(A) = LF(B) (конец к концу) ⇒ обе задачи без запаса
    expect(byId.get('A')).toMatchObject({ lf: '2026-08-05', totalFloat: 0, critical: true });
    expect(byId.get('B')).toMatchObject({ lf: '2026-08-05', totalFloat: 0, critical: true });
  });

  it('SF: прямой тянет ФИНИШ последователя к СТАРТУ предшественника', () => {
    const nodes = [
      leaf('A', '2026-08-10', '2026-08-12'), // dur 3
      leaf('B', '2026-08-01', '2026-08-02'), // dur 2, own_start далеко слева
    ];
    const { byId, projectFinish } = computeCpm(nodes, [dep('A', 'B', 'SF')]);
    expect(projectFinish).toBe('2026-08-12');
    // EF(B) ≥ ES(A) = 08-10 ⇒ ES(B) = 08-10 − 1 = 08-09
    expect(byId.get('B')).toMatchObject({ es: '2026-08-09', ef: '2026-08-10' });
    // обратный: LF(B) = PF = 08-12 ⇒ запас 2; A задаёт горизонт ⇒ критическая
    expect(byId.get('B')).toMatchObject({ lf: '2026-08-12', totalFloat: 2, critical: false });
    expect(byId.get('A')).toMatchObject({ lf: '2026-08-12', totalFloat: 0, critical: true });
  });

  it('LF не уходит за горизонт проекта при SS (иначе крит-путь исчезал бы вовсе)', () => {
    // Без капа LF(A) = LS(B) + (dur(A)−1) = 08-04 + 4 = 08-08 > PF 08-05, и у A
    // появился бы фиктивный запас 3 дня — при том, что именно A задаёт горизонт.
    const nodes = [leaf('A', '2026-08-01', '2026-08-05'), leaf('B', '2026-08-01', '2026-08-02')];
    const { byId, projectFinish } = computeCpm(nodes, [dep('A', 'B', 'SS')]);
    expect(byId.get('A')!.lf <= projectFinish!).toBe(true);
    expect(byId.get('A')!.totalFloat).toBe(0);
  });

  it('смешанный граф: у C рёбра FS и FF → выигрывает более жёсткое FF, у A появляется запас', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-03'), // dur 3
      leaf('B', '2026-08-01', '2026-08-08'), // dur 8
      leaf('C', '2026-08-01', '2026-08-02'), // dur 2
    ];
    const { byId, projectFinish } = computeCpm(nodes, [fs('A', 'C'), dep('B', 'C', 'FF')]);
    expect(projectFinish).toBe('2026-08-08');
    // FS(A) требует ES(C) ≥ 08-03, FF(B) требует EF(C) ≥ 08-08 ⇒ ES(C) = 08-07 (FF жёстче)
    expect(byId.get('C')).toMatchObject({ es: '2026-08-07', ef: '2026-08-08', totalFloat: 0, critical: true });
    expect(byId.get('B')).toMatchObject({ totalFloat: 0, critical: true });
    // A уже не критическая: её FS-ветвь получила запас
    expect(byId.get('A')).toMatchObject({ lf: '2026-08-07', totalFloat: 4, critical: false });
  });

  it('lag 0 легален для всех типов: узел ровно на границе → TF = 0, ES = own_start', () => {
    const a = leaf('A', '2026-08-01', '2026-08-05');
    const cases: Array<[string, ScheduleNode]> = [
      ['FS', leaf('B', '2026-08-05', '2026-08-06')], // start === A.end
      ['SS', leaf('B', '2026-08-01', '2026-08-02')], // start === A.start
      ['FF', leaf('B', '2026-08-04', '2026-08-05')], // end   === A.end
      ['SF', leaf('B', '2026-08-01', '2026-08-01')], // end   === A.start
    ];
    for (const [type, b] of cases) {
      const { byId } = computeCpm([a, b], [dep('A', 'B', type)]);
      expect(byId.get('B')!.es, type).toBe(b.start);     // граница не сдвинула узел
    }
  });

  it('неизвестный dep_type не участвует в графе (TF считается как без ребра)', () => {
    const nodes = [leaf('A', '2026-08-01', '2026-08-05'), leaf('B', '2026-08-01', '2026-08-02')];
    const { byId } = computeCpm(nodes, [dep('A', 'B', 'XX')]);
    expect(byId.get('B')!.es).toBe('2026-08-01');
    expect(byId.get('B')!.totalFloat).toBe(3);           // сток, LF = PF 08-05
  });
});
