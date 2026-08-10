# Claude Code Prompt — Fix: дубль CTA «Конвертировать» у лида

## Контекст

Гейт S-PIPELINE-COCKPIT-1, находка 🟢: у qualified-лида действие «Конвертировать»
живёт в двух местах — solid-кнопка в шапке LeadDetail и outline-кнопка в кокпите.
Одно действие — одна точка. Решение гейта: **остаётся кокпит** (там конверсия стоит
в контексте воронки, рядом с «3 из 4»), из шапки кнопка уходит. Кнопка «К сделке»
у конвертированного лида в шапке ОСТАЁТСЯ — это навигация, не действие воронки.

## РАЗВЕДКА

```bash
grep -n "Конвертировать\|convertOpen\|К сделке" src/components/leads/LeadDetail.tsx
# ожидание: convertOpen state (~105), next-объект кокпита (~171),
# кнопка в шапке (~244-252), рендер LeadConversionModal (~467)
```

## ЗАДАЧА 1: убрать кнопку «Конвертировать» из шапки

В `src/components/leads/LeadDetail.tsx` найти в шапке блок (внутри ветки
`isConverted ... : (<> ... </>)`):

```tsx
{lead.status === 'qualified' && (
  <button
    onClick={() => setConvertOpen(true)}
    className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
  >
    Конвертировать <ArrowRight size={12} />
  </button>
)}
```

Удалить его целиком, оставив на месте комментарий:

```tsx
{/* Гейт S-PIPELINE-COCKPIT-1: «Конвертировать» здесь снята — действие воронки
    живёт ТОЛЬКО в кокпите (кнопка next у qualified). Дубль CTA в шапке и в
    строке кокпита предлагал одно действие дважды. «К сделке» выше — навигация,
    она остаётся. */}
```

НЕ трогать: `convertOpen` state, `next`-объект кокпита, `LeadConversionModal`,
кнопку «К сделке», кнопку «Ред.».

### Verification

```bash
grep -c "setConvertOpen(true)" src/components/leads/LeadDetail.tsx   # ожидание: 1 (только кокпит)
npx tsc --noEmit
```

Если `ArrowRight` больше нигде в файле не используется — убрать из импорта
(проверить: `grep -n "ArrowRight" src/components/leads/LeadDetail.tsx`;
он используется в фокус-панели — тогда оставить).

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run
```

## КОММИТ

```bash
git add src/components/leads/LeadDetail.tsx
git commit -m "fix(leads): убран дубль CTA «Конвертировать» — действие воронки живёт только в кокпите (гейт S-PIPELINE-COCKPIT-1)"
```
