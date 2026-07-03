import type { PatternDef, MessageContext, Strictness, CheckResult } from "./types.js";
export declare const PATTERN_DEFS: PatternDef[];
export declare function checkPrivacyRisk(text: string, context?: MessageContext, strictness?: Strictness): CheckResult;
