import { z } from "zod";

export const services = ["decide", "logs", "tree", "dialogue"] as const;
export type Service = (typeof services)[number];
const id = z.string().min(1).max(160);
const text = z.string().min(1).max(12000);
const criterion = z.string().min(1).max(500);
const callerFields = {
  callerModel: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._:/-]+$/).optional().describe("Optional exact model ID making this request, when known. Do not guess from the harness name. Used only for usage comparisons."),
  reasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra", "unknown"]).optional().describe("Optional caller thinking level, when known. Self-reported attribution, not a billing multiplier."),
};
export const ChoiceQuestion = z
  .object({
    type: z.literal("choice"),
    instructions: z.string().min(1).max(1600),
    criteria: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), criterion)
      .refine(
        (v) => Object.keys(v).length >= 2 && Object.keys(v).length <= 255,
      ),
  })
  .strict();
export const Question = z.discriminatedUnion("type", [
  ChoiceQuestion,
  z
    .object({
      type: z.literal("boolean"),
      instructions: z.string().min(1).max(1600),
    })
    .strict(),
  z
    .object({
      type: z.literal("score"),
      instructions: z.string().min(1).max(1600),
      criteria: z.array(criterion).min(2).max(32),
    })
    .strict(),
]);
export const DecideInput = z
  .object({
    ...callerFields,
    state: text,
    questions: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), Question)
      .refine((v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 8),
  })
  .strict();
export type Questions = z.infer<typeof DecideInput>["questions"];
export const LogsInput = z
  .object({
    ...callerFields,
    records: z
      .array(
        z
          .object({
            id,
            body: z.string().max(8000),
            severityNumber: z.number().int().min(0).max(24).optional(),
            severityText: z.string().max(32).optional(),
            protected: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();
export const TreeInput = z
  .object({
    ...callerFields,
    state: text,
    question: z.string().min(1).max(1000),
    shape: z.unknown(),
    maxCalls: z.number().int().min(1).max(16).default(8),
  })
  .strict();
export const DialogueInput = z
  .object({
    ...callerFields,
    contextId: id,
    trigger: z.string().min(1).max(160),
    room: id,
    elapsedSeconds: z.number().finite().min(0).max(86400),
    silenceSeconds: z.number().finite().min(0).max(86400),
    completedCues: z.array(id).max(256),
    recentCues: z
      .array(z.object({ id, text: z.string().max(2000) }).strict())
      .max(8),
    candidates: z
      .array(z.object({ id, text: z.string().min(1).max(4000) }).strict())
      .min(1)
      .max(8),
    facts: z
      .record(
        z.string().max(160),
        z.union([
          z.string().max(300),
          z.boolean(),
          z.number().finite(),
          z.null(),
        ]),
      )
      .refine((v) => Object.keys(v).length <= 64),
  })
  .strict();
export type DialogueRequest = z.infer<typeof DialogueInput>;
export const inputSchemas = {
  decide: DecideInput,
  logs: LogsInput,
  tree: TreeInput,
  dialogue: DialogueInput,
};
export class ServiceError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}


export const RunPatternInput = z.object({
    ...callerFields,
  pattern: z.string().regex(/^[a-z0-9-]{1,64}$/),
  state: z.string().min(1).max(12000),
  candidates: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), z.string().min(1).max(500))
    .refine(value => Object.keys(value).length >= 1 && Object.keys(value).length <= 32 && !Object.hasOwn(value, 'review'), 'Supply 1 to 32 candidates; review is reserved.')
    .optional(),
}).strict();
export type PatternRequest = z.infer<typeof RunPatternInput>;
