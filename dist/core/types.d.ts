export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type OverallRisk = RiskLevel | "SAFE";
export type MaskStyle = "star" | "tag";
export type MessageContext = "messenger" | "email" | "notice" | "work" | "general";
export type Strictness = "strict" | "normal" | "lenient";
export interface DetectedItem {
    type: string;
    level: RiskLevel;
    description: string;
    masked: string[];
    count: number;
}
export interface CheckResult {
    overallRisk: OverallRisk;
    riskScore: number;
    detectedItems: DetectedItem[];
    safeToSend: boolean;
    summary: string;
    recommendation: string;
    maskedMessage: string;
    safeRewrite: string;
    warnings: string[];
}
export interface PatternDef {
    name: string;
    level: RiskLevel;
    description: string;
    safeTag: string;
    regex: RegExp;
    mask: (m: string) => string;
}
export declare const LEVEL_EMOJI: Record<OverallRisk, string>;
