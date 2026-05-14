import {
  DEFAULT_DEMO_SCENARIO_ID,
  getDemoScenario,
  listDemoScenarios,
  resolveDemoScenarioId,
  type DemoScenario,
  type DemoScenarioId,
} from "./scenarios.ts";

export {
  DEFAULT_DEMO_SCENARIO_ID,
  getDemoScenario,
  listDemoScenarios,
  resolveDemoScenarioId,
  type DemoScenario,
  type DemoScenarioId,
};

export function buildDemoRuntimeEnv(
  scenarioId: DemoScenarioId = DEFAULT_DEMO_SCENARIO_ID,
  env: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...env,
    CLAW_DEMO_SCENARIO: scenarioId,
  };
}
