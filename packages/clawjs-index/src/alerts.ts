import type { AlertRule, EntityRow, ObservationRow } from "./types.ts";
import type { IndexStore } from "./store.ts";

export interface AlertEvaluationContext {
  runId: string;
  monitorId?: string | null;
  store: IndexStore;
  observationsByEntity: Map<string, ObservationRow[]>;
  entities: EntityRow[];
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function evaluateAlertRules(rules: AlertRule[], context: AlertEvaluationContext): number {
  let fired = 0;
  for (const rule of rules) {
    for (const entity of context.entities) {
      const observations = context.observationsByEntity.get(entity.id) ?? [];
      if (observations.length === 0) continue;
      const latest = observations[0]!;

      if (rule.when === "new_entity") {
        const firstSeenInRun = observations.some((entry) => entry.runId === context.runId);
        const everSeenBefore = entity.observationCount > observations.length;
        if (firstSeenInRun && !everSeenBefore) {
          context.store.recordAlert({
            monitorId: context.monitorId,
            runId: context.runId,
            entityId: entity.id,
            ruleId: rule.id,
            ruleKind: rule.when,
            payload: { title: entity.title, summary: "New entity captured" },
          });
          fired += 1;
        }
        continue;
      }

      if (!rule.field) continue;
      const currentRaw = (latest.snapshot as Record<string, unknown>)[rule.field];
      const current = numeric(currentRaw);
      if (current === null) continue;
      const previous = numeric(context.store.fieldValueOnOrBefore(entity.id, rule.field, latest.observedAt));

      if (rule.when === "field_decrease" && previous !== null && current < previous) {
        const deltaPct = previous === 0 ? 100 : ((previous - current) / previous) * 100;
        const triggers =
          (rule.thresholdPct === undefined || deltaPct >= rule.thresholdPct) &&
          (rule.thresholdAbs === undefined || previous - current >= rule.thresholdAbs);
        if (triggers) {
          context.store.recordAlert({
            monitorId: context.monitorId,
            runId: context.runId,
            entityId: entity.id,
            ruleId: rule.id,
            ruleKind: rule.when,
            payload: { field: rule.field, before: previous, after: current, deltaPct: Number(deltaPct.toFixed(2)), title: entity.title },
          });
          fired += 1;
        }
      }

      if (rule.when === "field_increase" && previous !== null && current > previous) {
        const deltaPct = previous === 0 ? 100 : ((current - previous) / previous) * 100;
        const triggers =
          (rule.thresholdPct === undefined || deltaPct >= rule.thresholdPct) &&
          (rule.thresholdAbs === undefined || current - previous >= rule.thresholdAbs);
        if (triggers) {
          context.store.recordAlert({
            monitorId: context.monitorId,
            runId: context.runId,
            entityId: entity.id,
            ruleId: rule.id,
            ruleKind: rule.when,
            payload: { field: rule.field, before: previous, after: current, deltaPct: Number(deltaPct.toFixed(2)), title: entity.title },
          });
          fired += 1;
        }
      }

      if (rule.when === "field_match" && JSON.stringify(currentRaw) === JSON.stringify(rule.match)) {
        context.store.recordAlert({
          monitorId: context.monitorId,
          runId: context.runId,
          entityId: entity.id,
          ruleId: rule.id,
          ruleKind: rule.when,
          payload: { field: rule.field, value: currentRaw, title: entity.title },
        });
        fired += 1;
      }

      if (rule.when === "rating_drop" && rule.field === "rating" && previous !== null && current < previous) {
        const delta = previous - current;
        if (rule.thresholdAbs === undefined || delta >= rule.thresholdAbs) {
          context.store.recordAlert({
            monitorId: context.monitorId,
            runId: context.runId,
            entityId: entity.id,
            ruleId: rule.id,
            ruleKind: rule.when,
            payload: { field: "rating", before: previous, after: current, drop: delta, title: entity.title },
          });
          fired += 1;
        }
      }
    }
  }
  return fired;
}
