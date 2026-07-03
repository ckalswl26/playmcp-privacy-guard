# Privacy Guard MCP — 구현 계획서

> **상태:** 승인 대기 중 | 작성일: 2026-07-01  
> **목적:** plan.md 승인 후 실제 구현 진행  
> **원칙:** 이 문서를 승인받기 전까지 `src/` 내 파일을 수정하지 않는다.

---

## 1. 프로젝트 목표 요약

### 서비스 기획 의도

카카오톡·이메일·업무 메시지·공지문을 보내기 전, 개인정보와 민감정보가 포함되어 있는지 사용자가 스스로 알기 어렵다. 전화번호, 주민등록번호, 계좌번호, 카드번호, 주소 등이 무심코 유출되는 상황을 AI가 사전에 감지하고 안전한 대체 문장까지 제안하는 **정보보호 MCP 서버**를 만든다.

### 핵심 목표

| 목표 | 설명 |
|------|------|
| **탐지** | 15가지 이상 개인정보 유형을 정규식 + 복합 패턴으로 탐지 |
| **위험 등급화** | CRITICAL / HIGH / MEDIUM / LOW / SAFE 5단계로 분류 |
| **마스킹** | 별표(`*`) 마스킹 또는 범주 태그(`[전화번호 생략]`) 2가지 방식 제공 |
| **안전 재작성** | 원문 의도를 유지하면서 개인정보를 제거한 대체 문장 제안 |
| **Remote MCP** | Streamable HTTP 방식으로 외부에서 URL로 접속 가능한 서버 구축 |
| **개인정보 보호** | 원문을 저장하지 않고 요청-응답 단위로만 처리 |

### 서비스명 최종 후보 (승인 시 결정)
- **Privacy Guard MCP** ← 추천 (명확하고 국제적)
- SafeSend MCP
- 톡실드 MCP

---

## 2. 현재 코드 구조 분석

### 2-1. 파일 구조

```
playmcp-privacy-guard/
├── src/
│   └── index.ts          ← 모든 로직이 한 파일에 집중 (리팩토링 필요)
├── dist/                  ← tsc 빌드 결과
├── package.json
├── tsconfig.json
├── pnpm-workspace.yaml
├── .npmrc
├── README.md
└── claude_desktop_config.json
```

### 2-2. 현재 구현 상태

| 항목 | 현재 상태 | 변경 필요 여부 |
|------|-----------|---------------|
| Transport | `StdioServerTransport` (로컬 전용) | ✅ 변경 필요 → `StreamableHTTPServerTransport` |
| MCP API | `server.registerTool()` (최신 API) | ✅ 유지 |
| 레이어 분리 | 없음 (단일 파일) | ✅ 분리 필요 |
| HTTP 서버 | 없음 | ✅ 추가 필요 (Express) |
| `/health` 엔드포인트 | 없음 | ✅ 추가 필요 |
| 탐지 패턴 수 | 10가지 단일 + 2가지 복합 | ✅ 추가 (여권, 운전면허 등) |
| Tool 수 | 5개 | 유지 또는 확장 |
| `context`, `strictness` 파라미터 | 없음 | ✅ 추가 필요 |
| 에러 처리 | 기본 try-catch 없음 | ✅ 추가 필요 |
| 안전 로깅 | 없음 | ✅ 추가 필요 |

### 2-3. 현재 코드의 강점 (유지할 부분)

```typescript
// ✅ 유지: registerTool 최신 API
server.registerTool("check_message_privacy", {
  description: "...",
  inputSchema: { message: z.string().min(1) },
}, async ({ message }) => { ... });

// ✅ 유지: RiskLevel 타입 체계 (CRITICAL/HIGH/MEDIUM/LOW)
type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ✅ 유지: PatternDef 인터페이스 (name, level, regex, mask, safeTag)
// ✅ 유지: LEVEL_SCORES 점수 체계
// ✅ 유지: 원문 비저장 원칙 (matches 필드 없이 masked만 저장)
// ✅ 유지: detectContextRisks() 복합 패턴 탐지
```

### 2-4. 현재 코드의 약점 (변경할 부분)

```typescript
// ❌ 변경: stdio 전용이라 Remote MCP 불가
const transport = new StdioServerTransport();
await server.connect(transport);

// ❌ 변경: 모든 로직이 index.ts에 집중되어 테스트 불가
// ❌ 변경: context, strictness 파라미터 없음
// ❌ 변경: 여권번호, 운전면허번호 미탐지
// ❌ 변경: 에러 발생 시 서버 다운 가능성
// ❌ 변경: 원문 텍스트 미리보기가 응답에 노출될 수 있음
```

---

## 3. 공식 MCP 레퍼런스 분석

### 3-1. TypeScript SDK (`@modelcontextprotocol/sdk` v1.x)

**현재 권장 버전**: v1.x (v2는 2026 Q3 예정)  
**핵심 클래스**:

```typescript
// 현재 사용 중 — McpServer (고수준 추상화)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// stdio transport (현재)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// HTTP transport (추가 필요)
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
```

**registerTool 최신 API** (현재 프로젝트에서 이미 올바르게 사용 중):
```typescript
server.registerTool(
  "tool_name",
  {
    title: "도구 표시명",          // 선택 — Claude UI에 표시
    description: "도구 설명",
    inputSchema: z.object({        // Zod v4 스키마 지원
      param: z.string().describe("설명"),
    }),
    // outputSchema: z.object({...}) // 선택적 출력 스키마
  },
  async ({ param }) => ({
    content: [{ type: "text", text: "결과" }],
    // isError: true,  // 비즈니스 에러 표시
  })
);
```

**주의**: `server.tool()` (구 API)은 deprecated. `server.registerTool()`만 사용할 것.

### 3-2. Streamable HTTP Transport

원격 MCP 서버를 위한 핵심 transport. 단일 `/mcp` 엔드포인트에서 POST/GET/DELETE를 모두 처리한다.

**세션 흐름**:
```
Client → POST /mcp (InitializeRequest)
Server → InitializeResponse + Mcp-Session-Id: <uuid>
Client → POST /mcp (tools/call) + Mcp-Session-Id: <uuid>
Server → tool 결과 (JSON 또는 SSE 스트림)
Client → DELETE /mcp + Mcp-Session-Id: <uuid>  (세션 종료)
```

**서버 구현 패턴** (Express 기반):
```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import express from "express";

const sessions = new Map<string, StreamableHTTPServerTransport>();

// POST: 요청 처리 (initialize, tool call, etc.)
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    // 기존 세션
    await sessions.get(sessionId)!.handleRequest(req, res);
  } else {
    // 신규 세션
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => sessions.set(sid, transport),
    });
    transport.onclose = () => {
      // 세션 삭제 (메모리 정리)
      for (const [id, t] of sessions) {
        if (t === transport) sessions.delete(id);
      }
    };
    await privacyGuardServer.connect(transport);
    await transport.handleRequest(req, res);
  }
});

// GET: SSE 스트림 (서버→클라이언트 알림)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = sessions.get(sessionId);
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handleRequest(req, res);
});

// DELETE: 세션 종료
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = sessions.get(sessionId);
  if (transport) {
    await transport.close();
    sessions.delete(sessionId);
  }
  res.status(200).json({ terminated: true });
});
```

### 3-3. Tool 에러 처리 방식

MCP는 에러를 두 가지로 구분한다:

```typescript
// ① 프로토콜 에러 (잘못된 tool 이름, 파라미터 파싱 실패 등)
// SDK가 자동 처리 → JSON-RPC error response

// ② 비즈니스 에러 (tool 실행 중 발생한 오류)
// isError: true 로 반환 — 서버는 계속 동작
return {
  content: [{ type: "text", text: "처리 중 오류가 발생했습니다." }],
  isError: true,
};

// ③ 입력 검증 에러 — zod가 자동 처리 (파라미터 불일치 시 400)
```

### 3-4. Remote MCP 등록 방식 (PlayMCP)

PlayMCP/Claude.ai Custom Connector는 URL 기반:
```
https://your-server.com/mcp
```
- HTTPS 필수
- 인증 없이 공개 접근 허용 (공모전 제출 시) 또는 Bearer Token 사용
- `Origin` 헤더 검증 권장 (DNS rebinding 방지)
- `MCP-Protocol-Version: 2025-06-18` 헤더를 클라이언트가 전송함

### 3-5. MCP Inspector 테스트

```bash
# stdio 모드 (현재)
npx @modelcontextprotocol/inspector node dist/index.js

# HTTP 모드 (Remote MCP 전환 후)
npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp
```

### 3-6. 배포 서버 권장 구조

공식 레퍼런스에서 Remote MCP 서버의 권장 배포 경로:
- **Cloudflare Workers** (Edge 배포, Zero cold start)
- **Express + Node.js** (일반 서버, Render/Railway/Fly.io)
- **FastMCP** (Python)

공모전 제출용으로는 **Express + Render.com 또는 Railway** 추천:
- 무료 플랜 존재
- HTTPS 자동 제공
- Node.js 네이티브 지원

---

## 4. 레퍼런스 코드 패턴 정리 표

| Reference | File/URL | Pattern | 핵심 코드 스니펫 | 우리 프로젝트 적용 | 주의할 점 |
|-----------|----------|---------|----------------|-----------------|----------|
| `typescript-sdk` | `server/mcp.js` | `registerTool()` | `server.registerTool(name, { description, inputSchema: z.object({...}) }, cb)` | 이미 사용 중 — 유지 | `server.tool()` deprecated, 절대 사용 금지 |
| `typescript-sdk` | `server/streamableHttp.js` | Streamable HTTP Transport | `new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })` | `src/index.ts`에서 stdio → HTTP 전환 시 사용 | Express 의존성 추가 필요 (`pnpm add express @types/express`) |
| MCP Spec | transports doc | 세션 관리 | `Mcp-Session-Id` 헤더 기반 세션 Map | `sessions: Map<string, StreamableHTTPServerTransport>` | 세션 누수 방지 — `onclose` 콜백에서 반드시 삭제 |
| MCP Spec | transports doc | Origin 검증 | `if (origin !== ALLOWED_ORIGIN) return res.status(403)` | middleware로 구현 | 개발 중에는 완화, 배포 시 활성화 |
| MCP Spec | tools doc | 에러 응답 | `{ content: [...], isError: true }` | 탐지 실패, 입력 오류 시 isError 반환 | JSON-RPC 에러(throw)와 비즈니스 에러(isError)를 혼동하지 말 것 |
| MCP Spec | tools doc | `title` 필드 | `{ title: "도구 표시명", description: "..." }` | 각 tool에 `title` 추가 (Claude UI에 표시됨) | `description`과 중복되지 않게 간결하게 작성 |
| MCP Inspector | CLI | HTTP 테스트 | `npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp` | 로컬 테스트 용도 | Inspector는 stdio/HTTP 자동 감지 |
| MCP Registry | registry/quickstart | 등록 형식 | `{ name, description, url, version }` | PlayMCP 제출 시 참고 | PlayMCP 자체 제출 형식 별도 확인 필요 |

---

## 5. 최종 아키텍처 제안

### 5-1. 전체 구조

```
┌─────────────────────────────────────────────────────┐
│              PlayMCP Privacy Guard Server             │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              HTTP Layer (Express)                │ │
│  │                                                  │ │
│  │  GET  /health    → 서버 상태 확인                │ │
│  │  POST /mcp       → MCP 요청 처리 (신규/기존 세션)│ │
│  │  GET  /mcp       → SSE 스트림 (서버→클라이언트)  │ │
│  │  DELETE /mcp     → 세션 종료                     │ │
│  └─────────────────────────────────────────────────┘ │
│                         ↕                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │         MCP Layer (McpServer + Transport)        │ │
│  │   StreamableHTTPServerTransport × N sessions     │ │
│  └─────────────────────────────────────────────────┘ │
│                         ↕                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │                  Tool Layer                      │ │
│  │  check_message_privacy  check_messages_batch     │ │
│  │  mask_sensitive_info    rewrite_safe_message      │ │
│  │  get_privacy_risk_guide                          │ │
│  └─────────────────────────────────────────────────┘ │
│                         ↕                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Detector    │  │  Masking     │  │  Rewrite   │ │
│  │  Layer       │  │  Layer       │  │  Layer     │ │
│  │  (regex +    │  │  (star/tag   │  │  (safe     │ │
│  │  context)    │  │  masking)    │  │  text gen) │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
│                         ↕                             │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │  Risk Score  │  │  Safe        │                  │
│  │  Layer       │  │  Logging     │                  │
│  │  (CRITICAL→  │  │  (원문 제외) │                  │
│  │   SAFE)      │  │              │                  │
│  └──────────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────────┘
```

### 5-2. 세션 라이프사이클

```
Client                  Server
  │                        │
  ├─── POST /mcp ──────────►│  (InitializeRequest, 세션 ID 없음)
  │◄── 200 OK ─────────────┤  (InitializeResult + Mcp-Session-Id: uuid-1)
  │                        │
  ├─── POST /mcp ──────────►│  (tools/call, Mcp-Session-Id: uuid-1)
  │◄── 200 OK ─────────────┤  (tool result)
  │                        │
  ├─── DELETE /mcp ─────────►│  (Mcp-Session-Id: uuid-1)
  │◄── 200 OK ─────────────┤  (세션 삭제, 메모리 정리)
```

---

## 6. 파일별 구현 계획

### 6-1. 전체 파일 구조 (목표)

```
src/
├── index.ts                       ← HTTP 서버 진입점 (Express + /health + /mcp 라우팅)
├── server.ts                      ← McpServer 인스턴스 생성 + 모든 tool 등록
├── tools/
│   ├── checkMessagePrivacy.ts     ← check_message_privacy tool 정의
│   ├── checkMessagesBatch.ts      ← check_messages_batch tool 정의
│   ├── maskSensitiveInfo.ts       ← mask_sensitive_info tool 정의
│   ├── rewriteSafeMessage.ts      ← rewrite_safe_message tool 정의
│   └── getPrivacyRiskGuide.ts     ← get_privacy_risk_guide tool 정의
├── core/
│   ├── types.ts                   ← 공통 타입 정의
│   ├── detectors.ts               ← 패턴 정의 + 탐지 함수
│   ├── masking.ts                 ← 마스킹 함수
│   └── riskScoring.ts             ← 점수 계산 + 등급 산정
└── utils/
    └── safeLogging.ts             ← 개인정보 제거 로깅 유틸
```

### 6-2. `src/core/types.ts`

```typescript
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type OverallRisk = RiskLevel | "SAFE";
export type MaskStyle = "star" | "tag";
export type MessageContext = "kakao" | "email" | "notice" | "work" | "general";
export type Strictness = "strict" | "normal" | "lenient";

export interface DetectedItem {
  type: string;
  level: RiskLevel;
  description: string;
  reason: string;           // 탐지 이유 (사람이 읽기 좋은 형태)
  masked: string[];         // 마스킹된 형태만 저장 (원문 비저장 원칙)
  count: number;            // 탐지된 개수
}

export interface CheckResult {
  overallRisk: OverallRisk;
  riskScore: number;        // 0~100
  detectedItems: DetectedItem[];
  safeToSend: boolean;
  summary: string;
  recommendation: string;
  maskedMessage: string;    // star 마스킹
  safeRewrite: string;      // tag 마스킹 (범주 태그 대체)
  warnings: string[];       // 추가 경고 메시지
}

export interface PatternDef {
  name: string;
  level: RiskLevel;
  description: string;
  reason: string;
  safeTag: string;
  regex: RegExp;
  mask: (m: string) => string;
  contextMultiplier?: Partial<Record<MessageContext, number>>; // 컨텍스트별 가중치
}
```

### 6-3. `src/core/detectors.ts`

전체 패턴 정의와 탐지 함수. 현재 파일에서 분리.

**추가할 패턴 (현재 미구현)**:
```typescript
// 여권번호 (CRITICAL)
{
  name: "여권번호",
  level: "CRITICAL",
  description: "여권번호는 신원도용에 직결됩니다.",
  reason: "여권번호 패턴이 감지되었습니다",
  safeTag: "[여권번호 생략]",
  regex: /\b[MmRr]?\d{8,9}\b|\b[A-Z]{2}\d{7}\b/g,
  mask: (m) => m.slice(0, 2) + "*".repeat(m.length - 2),
},

// 운전면허번호 (HIGH)  
{
  name: "운전면허번호",
  level: "HIGH",
  description: "운전면허번호는 개인 식별에 사용될 수 있습니다.",
  reason: "운전면허번호 패턴이 감지되었습니다",
  safeTag: "[운전면허번호 생략]",
  regex: /\b(\d{2})[-–](\d{6})[-–](\d{2})\b/g,
  mask: (m) => m.slice(0, 2) + "-******-**",
},
```

**탐지 함수 시그니처**:
```typescript
export function detectPatterns(
  text: string,
  options?: { context?: MessageContext; strictness?: Strictness }
): { items: DetectedItem[]; maskedText: string; safeText: string }
```

### 6-4. `src/core/masking.ts`

```typescript
// 공통 마스킹 유틸
export function maskString(value: string, keepFirst = 2, keepLast = 0): string
export function applyMasking(text: string, pattern: PatternDef): string
export function applyTagReplacement(text: string, pattern: PatternDef): string
```

### 6-5. `src/core/riskScoring.ts`

```typescript
export const LEVEL_SCORES: Record<RiskLevel, number> = {
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 3,
};

export function calcScore(
  items: DetectedItem[],
  strictness: Strictness = "normal"
): number

export function overallLevel(score: number): OverallRisk

// 컨텍스트별 가중치 (예: 카카오톡에서 전화번호 = HIGH 이상)
export const CONTEXT_MULTIPLIERS: Record<MessageContext, number> = {
  kakao:   1.2,  // 개인 메시지 — 위험도 높임
  email:   1.0,
  notice:  1.3,  // 공지문 배포 — 더 엄격
  work:    1.1,
  general: 1.0,
};
```

### 6-6. `src/utils/safeLogging.ts`

개인정보가 로그에 노출되지 않도록 필터링.

```typescript
// 원칙: 원문 텍스트를 절대 로그에 남기지 않는다
export function safeLog(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  // meta 내 개인정보 가능 필드는 "[REDACTED]"로 치환
  const safeMeta = sanitizeMeta(meta);
  process.stderr.write(JSON.stringify({ level, message, ...safeMeta, ts: Date.now() }) + "\n");
}

// 로그에서 제거할 필드
const SENSITIVE_FIELDS = ["message", "text", "content", "body", "raw", "original"];
function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> { ... }
```

### 6-7. `src/index.ts` (HTTP 서버 진입점)

```typescript
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { privacyGuardServer } from "./server.js";
import { safeLog } from "./utils/safeLogging.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

// 세션 관리
const sessions = new Map<string, StreamableHTTPServerTransport>();

app.use(express.json({ limit: "1mb" }));  // 너무 큰 요청 차단

// CORS (PlayMCP 연동 위해 허용)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, MCP-Protocol-Version");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

// 헬스체크
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "playmcp-privacy-guard",
    version: "1.0.0",
    sessions: sessions.size,
    ts: new Date().toISOString(),
  });
});

// MCP 엔드포인트 (POST, GET, DELETE)
// ... (§3-2 패턴 참조)

app.listen(PORT, () => {
  safeLog("info", `PlayMCP Privacy Guard started on port ${PORT}`);
});
```

### 6-8. `src/server.ts` (MCP 서버 + Tool 등록)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCheckMessagePrivacy } from "./tools/checkMessagePrivacy.js";
import { registerCheckMessagesBatch } from "./tools/checkMessagesBatch.js";
// ... 나머지 tool import

export const privacyGuardServer = new McpServer({
  name: "playmcp-privacy-guard",
  version: "1.0.0",
});

registerCheckMessagePrivacy(privacyGuardServer);
registerCheckMessagesBatch(privacyGuardServer);
registerMaskSensitiveInfo(privacyGuardServer);
registerRewriteSafeMessage(privacyGuardServer);
registerGetPrivacyRiskGuide(privacyGuardServer);
```

### 6-9. `src/tools/checkMessagePrivacy.ts` (예시)

```typescript
export function registerCheckMessagePrivacy(server: McpServer) {
  server.registerTool(
    "check_message_privacy",
    {
      title: "메시지 개인정보 위험 검사",
      description: "메시지에서 개인정보 위험 요소를 검사합니다...",
      inputSchema: {
        message: z.string().min(1).max(10000).describe("검사할 메시지"),
        context: z.enum(["kakao","email","notice","work","general"]).optional().default("general"),
        strictness: z.enum(["strict","normal","lenient"]).optional().default("normal"),
        showMasked: z.boolean().optional().default(true),
      },
    },
    async ({ message, context, strictness, showMasked }) => {
      try {
        const result = checkPrivacyRisk(message, { context, strictness });
        return { content: [{ type: "text", text: formatCheckResult(result, showMasked) }] };
      } catch (err) {
        safeLog("error", "check_message_privacy 처리 오류", { err: String(err) });
        return { content: [{ type: "text", text: "처리 중 오류가 발생했습니다." }], isError: true };
      }
    }
  );
}
```

---

## 7. 각 Tool의 Input/Output Schema 상세 설계

### 7-1. `check_message_privacy`

**Input Schema**:
```typescript
{
  message:    z.string().min(1).max(10000),  // 검사할 메시지
  context:    z.enum(["kakao","email","notice","work","general"]).optional().default("general"),
  strictness: z.enum(["strict","normal","lenient"]).optional().default("normal"),
  showMasked: z.boolean().optional().default(true),
}
```

**Output (text 형식)**:
```
## 개인정보 위험 검사 결과

**종합 위험도:** 🚨 CRITICAL (점수: 80/100)
**전송 권장 여부:** 🚫 전송 위험
**컨텍스트:** kakao

### 탐지 요약
🚨 CRITICAL: 주민등록번호, 계좌번호
⚠️ HIGH: 휴대전화번호

### 상세 탐지 내역
[🚨 주민등록번호]
- 위험 등급: CRITICAL
- 탐지 이유: 주민등록번호는 금융사기·신원도용에 직결됩니다
- 탐지 개수: 1건
- 마스킹 결과: 901010-●●●●●●

### 마스킹된 안전 버전 (별표)
"제 주민번호 901010-●●●●●● 입니다"

### 안전 재작성 (태그 대체)
"제 주민번호 [주민등록번호 생략] 입니다"

### 경고
⚠️ 주민등록번호는 어떤 채널로도 전송하지 마세요.

### 권고사항
즉시 전송을 중단하세요!...
```

**주의**: 응답에 원문 개인정보 절대 포함 금지. `masked` 형태만 포함.

### 7-2. `check_messages_batch`

**Input Schema**:
```typescript
{
  messages:   z.array(z.string().min(1).max(10000)).min(1).max(20),
  context:    z.enum(["kakao","email","notice","work","general"]).optional().default("general"),
  strictness: z.enum(["strict","normal","lenient"]).optional().default("normal"),
}
```

**Output**:
```
## 배치 검사 결과 (5개)

### 메시지 1 ✅ — 전송 가능
- 위험도: SAFE (0점)

### 메시지 2 🚨 — **전송 위험**
- 위험도: CRITICAL (80점)
- 탐지 항목: 주민등록번호(CRITICAL), 계좌번호(CRITICAL)

...

---
총 5개 중 2개 위험 (3개 안전)
```

### 7-3. `mask_sensitive_info`

**Input Schema**:
```typescript
{
  text:      z.string().min(1).max(10000),
  maskStyle: z.enum(["star","tag"]).optional().default("star"),
  types:     z.array(z.string()).optional(),  // 특정 유형만 마스킹 (미지정 시 전체)
}
```

**Output**:
```
## 마스킹 결과

**탐지 항목 수:** 2개
**변경 여부:** 마스킹 적용됨

### 마스킹된 텍스트
"제 연락처는 010-****-5678이고 이메일은 ho**@example.com입니다."
```

### 7-4. `rewrite_safe_message`

**Input Schema**:
```typescript
{
  message: z.string().min(1).max(10000),
  context: z.enum(["kakao","email","notice","work","general"]).optional().default("general"),
}
```

**Output**:
```
## 안전 메시지 재작성

**원본 위험도:** ⚠️ HIGH (30점)

### 탐지된 개인정보
- ⚠️ 휴대전화번호 (HIGH): 마스킹 → 010-****-5678
- ⚡ 이메일 (MEDIUM): 마스킹 → ho**@example.com

### 재작성 옵션

**옵션 1 — 별표 마스킹**
"제 연락처는 010-****-5678이고 이메일은 ho**@example.com입니다."

**옵션 2 — 범주 태그 (권장)**
"제 연락처는 [전화번호 생략]이고 이메일은 [이메일 생략]입니다."

### 권고사항
개인정보 전달이 꼭 필요하다면 안전한 채널을 이용하세요.
```

**중요**: `rewrite_safe_message`는 현재 단순 마스킹 2가지 제안이지만, 추후 LLM 연동 시 자연스러운 문장 재작성으로 고도화 가능.

### 7-5. `get_privacy_risk_guide`

**Input Schema**: 없음 (`{}`)

**Output**: 위험 등급 표 + 탐지 항목 목록 + 보호 원칙 (현재 구현 유지)

---

## 8. 개인정보 탐지 정규식/규칙 설계

### 8-1. 단일 패턴 탐지 (15가지)

| # | 유형 | 위험 등급 | 정규식 | 마스킹 예시 |
|---|------|-----------|--------|------------|
| 1 | 주민등록번호 | CRITICAL | `/\b(\d{6})[-–—]([0-9]\d{6})\b/g` | `901010-●●●●●●` |
| 2 | 신용/체크카드 번호 | CRITICAL | `/\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g` | `1234-****-****-5678` |
| 3 | 계좌번호 | CRITICAL | `/\b(\d{3,4})[-–—](\d{2,6})[-–—](\d{2,7})(?:[-–—]\d{1,3})?\b/g` | `123-****-***` |
| 4 | 여권번호 | CRITICAL | `/\b[A-Z]{1,2}\d{7,8}\b/g` | `M*******` |
| 5 | 휴대전화번호 | HIGH | `/\b(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})\b/g` | `010-****-5678` |
| 6 | 상세 주소 | HIGH | `/(서울|부산|...|제주)[가-힣\s\d\-]+?(로|길|가|동|읍|면|리)\s*\d+/g` | `서울 ●●● (마스킹됨)` |
| 7 | 운전면허번호 | HIGH | `/\b(\d{2})[-–](\d{6})[-–](\d{2})\b/g` | `12-******-**` |
| 8 | 이메일 주소 | MEDIUM | `/\b([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g` | `ho**@example.com` |
| 9 | 일반 전화번호 | MEDIUM | `/\b(0[2-9]\d{1,2})[-.\s](\d{3,4})[-.\s](\d{4})\b/g` | `02-****-5678` |
| 10 | 생년월일 | MEDIUM | `/\b(19\|20)\d{2}[년./-](0?[1-9]\|1[0-2])[월./-](0?[1-9]\|[12]\d\|3[01])일?\b/g` | `1990년 **월 **일` |
| 11 | SNS 계정 | MEDIUM | `/(카카오아이디\|인스타그램\|페이스북\|...) *[:：]? *(\w{3,30})/gi` | `인스타그램: id**` |
| 12 | IP 주소 | LOW | `/\b((?:25[0-5]\|2[0-4]\d\|[01]?\d\d?)\.){3}(?:25[0-5]\|...)\b/g` | `192.168.***.***` |
| 13 | 위치 좌표 | LOW | `/\b(3[4-8]\.\d{4,6})[,\s]+(12[5-9]\.\d{4,6})\b/g` | `[위도 생략], [경도 생략]` |
| 14 | 사업자번호 | MEDIUM | `/\b\d{3}-\d{2}-\d{5}\b/g` | `123-**-*****` |
| 15 | 이름+직위 | MEDIUM | `/[가-힣]{2,4}(씨\|님\|대표\|이사\|팀장\|부장\|과장\|대리)/g` (컨텍스트 기반) | — |

### 8-2. 복합 패턴 탐지 (조합 탐지)

```typescript
// 신상털림 고위험 조합
hasKoreanName && hasRegion && hasOrg → CRITICAL "이름+지역+소속 동시 노출"

// 개인 식별 조합
hasKoreanName && (hasRegion || hasOrg) → HIGH "이름+소속 조합"

// 인적사항 조합
hasAge && hasGender && hasKoreanName → HIGH "이름+나이+성별 조합"
```

### 8-3. 탐지 우선순위 처리

카드번호(16자리)와 계좌번호(숫자+구분자)는 패턴이 겹칠 수 있다. 처리 순서:
```
1. 카드번호 (16자리 우선 탐지)
2. 주민등록번호
3. 계좌번호
4. 나머지 순서대로
```

중복 매칭 방지: 이미 마스킹된 텍스트에서 다음 패턴 적용.

### 8-4. `strictness` 파라미터 영향

```typescript
// strict: 점수 가중치 1.5배, MEDIUM도 경고 대상
// normal: 기본값
// lenient: 점수 가중치 0.7배, CRITICAL/HIGH만 경고
const STRICTNESS_MULTIPLIER = { strict: 1.5, normal: 1.0, lenient: 0.7 };
```

---

## 9. 위험 등급 산정 로직

### 9-1. 기본 점수 체계

```typescript
const LEVEL_SCORES: Record<RiskLevel, number> = {
  CRITICAL: 40,   // 1개만 있어도 CRITICAL
  HIGH:     20,   // 2개면 CRITICAL 초과
  MEDIUM:   10,
  LOW:       3,
};

// 최대 점수: 100점 (cap)
// 동일 유형 중복 감지: 첫 번째는 full score, 추가는 50%
```

### 9-2. 등급 판정 기준

```typescript
function overallLevel(score: number): OverallRisk {
  if (score === 0)   return "SAFE";
  if (score >= 40)   return "CRITICAL";
  if (score >= 20)   return "HIGH";
  if (score >= 10)   return "MEDIUM";
  return "LOW";
}
```

### 9-3. `safeToSend` 기준

```typescript
const safeToSend = overall === "SAFE" || (overall === "LOW" && strictness !== "strict");
```

### 9-4. 컨텍스트별 가중치 적용 예시

```typescript
// 카카오톡 공지에서 전화번호 → HIGH × 1.3 = 실질 26점
const effectiveScore = baseScore * CONTEXT_MULTIPLIERS[context];
```

---

## 10. 에러 처리 전략

### 10-1. 에러 유형별 처리

| 에러 유형 | 원인 | 처리 방법 |
|-----------|------|-----------|
| 입력 스키마 에러 | Zod 파싱 실패 | SDK 자동 처리 (JSON-RPC error) |
| 메시지 너무 긴 경우 | `max(10000)` 초과 | Zod가 거부 → 에러 메시지 반환 |
| 빈 메시지 | `min(1)` 미만 | Zod가 거부 |
| 정규식 오류 | 특수문자 패턴 | try-catch + `isError: true` 반환 |
| 배치 20개 초과 | `max(20)` 초과 | Zod가 거부 |
| 세션 없음 | 잘못된 session ID | HTTP 404 반환 |
| 서버 내부 오류 | 예상치 못한 exception | try-catch + `isError: true` + safeLog |

### 10-2. 안전 에러 메시지 원칙

```typescript
// ❌ 절대 하지 말 것
return { content: [{ type: "text", text: `오류: "${message.slice(0,50)}"에서 에러 발생` }], isError: true };
// 원문 일부라도 에러 응답에 포함하면 개인정보 노출 위험

// ✅ 올바른 방식
return { content: [{ type: "text", text: "입력 처리 중 오류가 발생했습니다. 메시지를 확인하세요." }], isError: true };
```

### 10-3. HTTP 레벨 에러

```typescript
// 세션 없는 POST → 새 세션 생성 (에러 아님)
// 세션 없는 GET/DELETE → 404
// 잘못된 JSON body → 400
// 요청 크기 초과 → 413 (express.json({ limit: "1mb" }))
```

---

## 11. 테스트 계획

### 11-1. MCP Inspector 테스트 (수동)

```bash
# 1. 서버 실행
pnpm dev  # HTTP 모드에서

# 2. Inspector 연결
npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp

# 3. Inspector UI에서 각 tool 직접 호출 + 결과 확인
```

### 11-2. 정상 케이스

| 테스트 | 입력 | 기대 결과 |
|--------|------|-----------|
| 안전한 메시지 | "오늘 날씨 좋네요" | overallRisk: SAFE |
| 인사말 | "안녕하세요 김부장님" | overallRisk: SAFE (이름+직위만으론 LOW) |

### 11-3. 개인정보 포함 케이스

| 테스트 | 입력 | 기대 결과 |
|--------|------|-----------|
| 전화번호 단독 | "제 번호는 010-1234-5678입니다" | HIGH, 마스킹 `010-****-5678` |
| 이메일 단독 | "hong@example.com으로 연락주세요" | MEDIUM |
| 주민번호 | "901010-1234567" | CRITICAL |
| 계좌번호 | "110-123-456789로 입금" | CRITICAL |
| 카드번호 | "1234 5678 9012 3456" | CRITICAL |

### 11-4. 복합 위험 케이스

| 테스트 | 입력 | 기대 결과 |
|--------|------|-----------|
| 이름+전화+주소 | "홍길동(서울 강남구 테헤란로 1, 010-0000-1234)" | CRITICAL |
| 이름+소속 | "홍길동 삼성전자 부장님" | HIGH |
| 전화+이메일 | 두 가지 동시 | HIGH (20+10=30점) |

### 11-5. 엣지 케이스

| 테스트 | 입력 | 기대 결과 |
|--------|------|-----------|
| 빈 문자열 | `""` | Zod 에러 (min(1) 위반) |
| 10001자 메시지 | 긴 문자열 | Zod 에러 (max(10000) 위반) |
| 숫자만 | "1234567890" | SAFE (전화번호 포맷 아님) |
| 이모지 포함 | "😀 010-1234-5678" | HIGH (전화번호 탐지) |
| 배치 21개 | 21개 메시지 배열 | Zod 에러 |

### 11-6. 마스킹 검증

```typescript
// 마스킹 결과가 원문과 달라야 함
assert(result.maskedMessage !== input.message);

// 마스킹 결과에 원문 개인정보가 없어야 함
assert(!result.maskedMessage.includes("1234567890"));  // 실제 계좌번호

// safeText(태그 치환)에 개인정보 패턴이 없어야 함
for (const pattern of PATTERN_DEFS) {
  const regex = new RegExp(pattern.regex.source);
  assert(!regex.test(result.safeRewrite));
}
```

---

## 12. PlayMCP 제출용 README 구성안

```markdown
# PlayMCP Privacy Guard 🛡️

> 메시지 보내기 전에 개인정보 유출 위험을 검사하고 안전한 대체 문장을 제안하는 Remote MCP 서버

## 🌐 Remote MCP URL
https://playmcp-privacy-guard.onrender.com/mcp

## 🛠 MCP Tools (5가지)
| Tool | 설명 |
|------|------|
| check_message_privacy | 단일 메시지 개인정보 위험 검사 |
| check_messages_batch  | 최대 20개 메시지 일괄 검사 |
| mask_sensitive_info   | 개인정보 마스킹 (별표/태그) |
| rewrite_safe_message  | 안전한 대체 문장 2가지 제안 |
| get_privacy_risk_guide| 위험 등급 기준 및 탐지 항목 가이드 |

## 🔍 탐지 대상 (15가지)
주민등록번호, 전화번호, 이메일, 주소, 계좌번호, 카드번호,
여권번호, 운전면허번호, 생년월일, IP 주소, SNS 계정,
이름+소속 조합, 위치 좌표, 사업자번호, 위치 정보

## 🏷️ 위험 등급
🚨 CRITICAL | ⚠️ HIGH | ⚡ MEDIUM | ℹ️ LOW | ✅ SAFE

## 🔒 개인정보 보호 설계 원칙
- 원문 메시지를 서버에 저장하지 않음
- 로그에 개인정보 미기록
- 응답에 마스킹된 형태만 포함
- 요청-응답 단위로만 처리 (상태 비저장)
- 외부 LLM API 미사용 (완전 로컬 처리)

## 📋 사용 예시
[README에 구체적인 입/출력 예시 포함]

## 🚀 배포 정보
- 플랫폼: Render.com (무료 플랜)
- 프레임워크: Express + @modelcontextprotocol/sdk
- 언어: TypeScript
- Node.js 20+
```

---

## 13. 배포 계획

### 13-1. 로컬 개발

```bash
# 의존성 추가 (계획 승인 후 실행)
pnpm add express
pnpm add -D @types/express

# 개발 서버 (HTTP 모드)
pnpm dev

# 빌드 + 실행
pnpm build
pnpm start
```

### 13-2. MCP Inspector 테스트

```bash
# HTTP 서버 실행 후 Inspector 연결
npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp
```
Inspector UI에서:
1. Tools 탭 → tool 목록 확인
2. 각 tool 클릭 → 파라미터 입력 → 호출 → 결과 확인
3. Notifications 탭 → 서버 로그 확인

### 13-3. 외부 HTTPS 배포 (Render.com)

```yaml
# render.yaml
services:
  - type: web
    name: playmcp-privacy-guard
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: node dist/index.js
    envVars:
      - key: PORT
        value: 10000
      - key: NODE_ENV
        value: production
```

Render.com에서 자동으로 HTTPS URL 제공:
```
https://playmcp-privacy-guard.onrender.com
```

### 13-4. PlayMCP 등록

1. PlayMCP 공모전 제출 페이지에서 URL 등록:
   ```
   https://playmcp-privacy-guard.onrender.com/mcp
   ```
2. 서버 이름, 설명, 카테고리 입력
3. Tool 목록 자동 감지 확인
4. README.md 업로드

### 13-5. Claude Desktop 연동 (로컬 테스트용)

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "privacy-guard-remote": {
      "url": "https://playmcp-privacy-guard.onrender.com/mcp"
    }
  }
}
```

---

## 14. 구현 순서 체크리스트

### Phase 1: 프로젝트 구조 분리 (현재 → 멀티 파일)
- [ ] `src/core/types.ts` 생성 (타입 정의 분리)
- [ ] `src/core/detectors.ts` 생성 (패턴 정의 이동 + 신규 추가)
- [ ] `src/core/masking.ts` 생성 (마스킹 함수 분리)
- [ ] `src/core/riskScoring.ts` 생성 (점수 계산 분리)
- [ ] `src/utils/safeLogging.ts` 생성

### Phase 2: 탐지 패턴 보완
- [ ] 여권번호 패턴 추가 (CRITICAL)
- [ ] 운전면허번호 패턴 추가 (HIGH)
- [ ] 위치 좌표 패턴 추가 (LOW)
- [ ] 사업자번호 패턴 추가 (MEDIUM)
- [ ] `context` 파라미터 가중치 로직 구현
- [ ] `strictness` 파라미터 영향 로직 구현

### Phase 3: Tool 분리 + 파라미터 확장
- [ ] `src/tools/checkMessagePrivacy.ts` 생성 (`context`, `strictness` 추가)
- [ ] `src/tools/checkMessagesBatch.ts` 생성 (`context`, `strictness` 추가)
- [ ] `src/tools/maskSensitiveInfo.ts` 생성 (`types` 필터 파라미터 추가)
- [ ] `src/tools/rewriteSafeMessage.ts` 생성
- [ ] `src/tools/getPrivacyRiskGuide.ts` 생성

### Phase 4: HTTP 서버 전환 (핵심)
- [ ] `pnpm add express @types/express` 실행
- [ ] `src/server.ts` 생성 (McpServer + tool 등록)
- [ ] `src/index.ts` 전면 수정:
  - [ ] Express 설정 + CORS middleware
  - [ ] `GET /health` 엔드포인트
  - [ ] `POST /mcp` 핸들러 (세션 관리 포함)
  - [ ] `GET /mcp` 핸들러 (SSE)
  - [ ] `DELETE /mcp` 핸들러 (세션 종료)
- [ ] `tsconfig.json` 확인 (NodeNext module 설정 유지)

### Phase 5: 빌드 & 로컬 테스트
- [ ] `pnpm build` 에러 없이 완료 확인
- [ ] `pnpm dev` 서버 시작 확인 (stderr 로그 확인)
- [ ] `curl http://localhost:3000/health` 응답 확인
- [ ] MCP Inspector로 각 tool 테스트

### Phase 6: 배포 & 제출
- [ ] Render.com 계정 생성 + 레포 연결
- [ ] 배포 후 `https://[서버명].onrender.com/health` 확인
- [ ] `https://[서버명].onrender.com/mcp` Inspector 테스트
- [ ] README.md 최종 업데이트
- [ ] PlayMCP 제출

---

## 15. 구현 전 확인사항 및 리스크

### 15-1. 결정이 필요한 사항

| 항목 | 선택지 | 권장 |
|------|--------|------|
| 서비스명 | Privacy Guard / SafeSend / 톡실드 | Privacy Guard MCP (명확) |
| HTTP 프레임워크 | Express / Hono / Node http | Express (SDK 예제 기준, 문서 풍부) |
| 배포 플랫폼 | Render / Railway / Fly.io / Vercel | Render.com (Node.js 무료, HTTPS 자동) |
| 인증 방식 | 없음 (공개) / Bearer Token | 공모전 제출용 → 없음 (공개) |
| LLM 연동 | 없음 (규칙 기반) / Claude API 추가 | 현재는 없음, 추후 고도화 가능 |
| 테스트 도구 | MCP Inspector / Jest | Inspector (수동) + Jest (단위) |

### 15-2. 기술적 리스크

| 리스크 | 가능성 | 대응 방안 |
|--------|--------|-----------|
| Render.com 콜드 스타트 (무료 플랜) | 높음 | 첫 요청 느릴 수 있음 — README에 명시 |
| 정규식 성능 (10000자 메시지) | 중간 | 성능 테스트 + 필요 시 `max(5000)` 조정 |
| 카드번호·계좌번호 패턴 충돌 | 중간 | 처리 순서 명확히 (카드번호 우선) |
| 세션 메모리 누수 | 낮음 | `onclose` 콜백에서 세션 삭제 + 주기적 정리 |
| PlayMCP URL 등록 형식 미확인 | 낮음 | PlayMCP 공모전 규정 직접 확인 필요 |
| `StreamableHTTPServerTransport` 정확한 API | 중간 | SDK 설치 후 타입 정의 파일로 확인 필요 |

### 15-3. 정규식 한계

- 맞춤법 오류, 특수문자 삽입된 변형 패턴 탐지 불가 (예: `010.1234.5678` 일부)
- 영어권 전화번호 (+1-555-0100) 미탐지 (국내 서비스 범위 밖)
- 텍스트 이미지(스크린샷) 내 개인정보 탐지 불가 (OCR 미구현)
- 아주 짧은 한국 이름("이민" 등) 오탐 가능성

### 15-4. 개인정보 보호 규정 준수

이 서버 자체가 개인정보를 처리하는 도구이므로:
- 입력받은 텍스트를 로그에 남기지 않는 것이 핵심
- 데이터가 외부 LLM API로 전송되지 않음을 명확히 표시
- Render.com 서버 로그에도 개인정보가 남지 않도록 safeLogging 철저히 적용

---

## 다음 단계: plan.md 승인 후 구현할 작업 순서

```
1. plan.md 검토 및 승인
   → 서비스명, 배포 플랫폼, 인증 방식 최종 결정

2. Phase 1 실행: 프로젝트 구조 분리
   src/core/types.ts
   src/core/detectors.ts
   src/core/masking.ts
   src/core/riskScoring.ts
   src/utils/safeLogging.ts

3. Phase 2 실행: 탐지 패턴 보완
   여권번호, 운전면허번호 추가
   context/strictness 가중치 로직 구현

4. Phase 3 실행: Tool 파일 분리
   src/tools/ 하위 5개 파일 생성

5. Phase 4 실행: HTTP 서버 전환 (가장 중요)
   pnpm add express @types/express
   src/index.ts (HTTP 서버)
   src/server.ts (McpServer)

6. Phase 5: 빌드 및 로컬 테스트
   pnpm build / pnpm dev
   MCP Inspector 연결 테스트
   각 tool 기능 검증

7. Phase 6: 배포 및 PlayMCP 제출
   Render.com 배포
   https://[서버].onrender.com/mcp 확인
   PlayMCP 공모전 제출
```

---

*이 계획서를 검토하고 수정 또는 승인해 주시면 구현을 시작하겠습니다.*
