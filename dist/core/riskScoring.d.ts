import type { RiskLevel, OverallRisk, DetectedItem, MessageContext, Strictness } from "./types.js";
export declare const LEVEL_SCORES: Record<RiskLevel, number>;
export declare const CONTEXT_MULTIPLIERS: Record<MessageContext, number>;
export declare const STRICTNESS_MULTIPLIERS: Record<Strictness, number>;
export declare function calcScore(items: DetectedItem[], context?: MessageContext, strictness?: Strictness): number;
export declare function overallLevel(score: number): OverallRisk;
export declare const RECOMMENDATIONS: Record<OverallRisk, string>;
