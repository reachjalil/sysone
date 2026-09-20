import type { createClient } from "../client.js";
import { adviseComputer } from "./decision.js";
import type { BrowserSession, ComputerAction } from "./session.js";

export type RunOptions = {
  goal: string;
  maxSteps: number;
  minimumProbability: number;
  allowedOperations: ComputerAction["operation"][];
  fields: { name: string; text: string }[];
  selections: { name: string; option: string }[];
};

/** A caller-authorized short sequence. A model's DONE is never a success assertion. */
export async function runComputer(
  session: BrowserSession,
  client: ReturnType<typeof createClient>,
  options: RunOptions,
  signal?: AbortSignal,
) {
  if (
    !Number.isInteger(options.maxSteps) ||
    options.maxSteps < 1 ||
    options.maxSteps > 12
  )
    throw Error("Choose 1 to 12 decision steps.");
  if (
    !Number.isFinite(options.minimumProbability) ||
    options.minimumProbability < 0.5 ||
    options.minimumProbability > 1
  )
    throw Error("Probability threshold must be between 0.5 and 1.");
  const abort = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(90_000)])
    : AbortSignal.timeout(90_000);
  const started = performance.now();
  const steps: Record<string, unknown>[] = [];
  let stop = "step_limit",
    unchanged = 0,
    previous = "",
    requests = 0;
  // Values are supplied by the calling agent. The model cannot invent input text.
  const goal = `${options.goal}\nCaller-supplied field text: ${JSON.stringify(options.fields)}\nCaller-supplied dropdown values: ${JSON.stringify(options.selections)}\nDo not fill a field whose current value already matches. Allowed operations: ${options.allowedOperations.join(", ")}. Use review for any other required operation.`;
  try {
    for (let i = 0; i < options.maxSteps; i++) {
      abort.throwIfAborted();
      const observation = await session.observe(false);
      const fingerprint = JSON.stringify(observation.screen);
      unchanged = fingerprint === previous ? unchanged + 1 : 0;
      if (unchanged >= 2) {
        stop = "no_visible_progress";
        break;
      }
      previous = fingerprint;
      requests++;
      const advice = await adviseComputer(
        session,
        client,
        observation.observationId,
        goal,
        abort,
      );
      abort.throwIfAborted();
      const step: Record<string, unknown> = {
        step: i + 1,
        observationId: observation.observationId,
        status: advice.status,
        elapsedMs: advice.elapsedMs,
        requestId: advice.engine.requestId,
        meta: advice.engine.meta,
      };
      steps.push(step);
      if (advice.status !== "proposed" || !advice.proposal) {
        stop = advice.status;
        break;
      }
      const proposal = advice.proposal;
      step.proposal = proposal;
      if (proposal.operation === "done" || proposal.operation === "review") {
        stop = proposal.operation === "done" ? "verify_completion" : "review";
        break;
      }
      if (
        !options.allowedOperations.includes(
          proposal.operation as ComputerAction["operation"],
        )
      ) {
        stop = "operation_not_allowed";
        break;
      }
      const result = advice.engine.result as {
        answers?: Record<string, { probabilities?: Record<string, number> }>;
      };
      const operationProbability =
        result.answers?.operation?.probabilities?.[proposal.operation];
      const targetProbability = proposal.target
        ? result.answers?.[`${proposal.operation}_target`]?.probabilities?.[
            proposal.target
          ]
        : operationProbability;
      step.probabilities = {
        operation: operationProbability ?? null,
        target: targetProbability ?? null,
      };
      if (
        ![operationProbability, targetProbability].every(
          (p) =>
            typeof p === "number" &&
            Number.isFinite(p) &&
            p >= options.minimumProbability,
        )
      ) {
        stop = "uncertain";
        break;
      }
      const action: ComputerAction = {
        operation: proposal.operation as ComputerAction["operation"],
        target: proposal.target,
      };
      if (proposal.operation === "type" || proposal.operation === "select") {
        const matches = observation.screen.controls.filter(
          (c) =>
            c.name === proposal.control?.name && c.kind === proposal.operation,
        );
        if (matches.length !== 1) {
          stop = "ambiguous_field";
          break;
        }
        if (proposal.operation === "type") {
          const values = options.fields.filter(
            (f) => f.name === proposal.control?.name,
          );
          if (values.length !== 1) {
            stop = "needs_field_text";
            break;
          }
          action.text = values[0].text;
        } else {
          const values = options.selections.filter(
            (f) => f.name === proposal.control?.name,
          );
          if (values.length !== 1) {
            stop = "needs_option_value";
            break;
          }
          action.option = values[0].option;
        }
      }
      abort.throwIfAborted();
      await session.act(observation.observationId, action);
      step.executed = true;
    }
  } catch (error) {
    stop = abort.aborted ? "cancelled" : "stopped_on_error";
    steps.push({
      error:
        error instanceof Error ? error.message : "Computer operation failed.",
    });
  }
  let final: Awaited<ReturnType<BrowserSession["observe"]>> | undefined;
  try {
    final = await session.observe(true);
  } catch {
    /* A closed session has no final screen. */
  }
  return {
    stop,
    verified: false,
    elapsedMs: Math.round(performance.now() - started),
    decisionRequests: requests,
    actionsExecuted: steps.filter((s) => s.executed).length,
    steps,
    final,
    next: "Inspect the final screenshot and evidence. The calling agent must verify the requested outcome. No automatic retry.",
    policy:
      "The probability threshold only stops uncertain proposals. It is not measured accuracy or action authorization.",
  };
}
