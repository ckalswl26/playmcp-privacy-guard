# Privacy Guard MCP

메시지를 전송하기 전에 개인정보 노출 위험을 탐지하고, 마스킹 및 안전한 대체 문장을 제안하는 **Remote MCP 서버**입니다.

주민등록번호·카드번호·전화번호·주소 등 **14가지 개인정보 유형**을 탐지하며, 외부 AI API 없이 규칙 기반으로 완전히 서버 내에서 처리합니다.

---

## 서비스 정보

| 항목 | 값 |
|------|-----|
| **MCP 식별자** | `privacyguard` |
| **Server Name** | `Privacy Guard MCP` |
| **MCP Endpoint** | `https://<your-render-service>.onrender.com/mcp` |
| **Health Check** | `https://<your-render-service>.onrender.com/health` |
| **프로토콜** | Streamable HTTP (stateless, 세션 없음) |
| **MCP 버전** | 2025-03-26 ~ 2025-11-25 |
| **인증** | 없음 (공개) |

> 배포 완료 후 `<your-render-service>` 부분을 실제 Render.com 서비스 URL로 교체하세요.

---

## 도구 목록 (5개)

| 도구 이름 | 설명 |
|-----------|------|
| `check_message_privacy` | 메시지 1개를 분석하여 위험도·탐지 항목·마스킹 버전 반환 |
| `check_messages_batch` | 최대 20개 메시지 일괄 분석 |
| `mask_sensitive_info` | 개인정보를 별표(`star`) 또는 범주 태그(`tag`)로 마스킹 |
| `rewrite_safe_message` | 개인정보를 제거한 안전 버전 문장 2가지 제안 |
| `get_privacy_risk_guide` | 위험 등급·탐지 유형·컨텍스트 가중치 참조 가이드 |

---

## 탐지 항목

### CRITICAL (즉시 전송 중단)
- 주민등록번호, 신용/체크카드 번호, 계좌번호, 여권번호
- 신상털림 고위험 조합 (이름+지역+소속 동시 노출)

### HIGH (강력 자제)
- 휴대전화번호, 상세 주소, 운전면허번호
- 이름+소속 식별 조합, 이름+나이+성별 조합

### MEDIUM (주의)
- 이메일 주소, 일반 전화번호, 생년월일, SNS/메신저 계정, 사업자등록번호

### LOW (경미)
- IP 주소, 위치 좌표

---

## 개인정보 보호 설계 원칙

1. **원문 비저장** — 원본 개인정보는 메모리에서만 처리되며 응답에 포함되지 않습니다
2. **최소 처리** — 탐지·마스킹에 필요한 최소한의 처리만 수행합니다
3. **로컬 처리** — 모든 분석은 서버 내에서 이루어지며 외부 AI API로 전송하지 않습니다
4. **목적 제한** — 위험 탐지 목적 외 데이터를 활용하지 않습니다
5. **안전 로깅** — 로그에 원문 메시지를 절대 기록하지 않습니다

> **향후 인증 확장 예정**: 현재는 공개 서버로 운영됩니다. 프로덕션 전환 시 API 키 또는 OAuth 2.0 Bearer Token 방식의 인증을 추가할 수 있도록 설계되어 있습니다.

---

## 로컬 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 시작 (포트 3000)
pnpm dev

# TypeScript 빌드
pnpm build

# 빌드 후 실행
pnpm start
```

---

## MCP Inspector로 테스트

```bash
npx @modelcontextprotocol/inspector --url http://localhost:3000/mcp
```

브라우저에서 Inspector UI가 열리면:
1. 왼쪽 패널에서 5개 도구 목록을 확인합니다
2. `get_privacy_risk_guide`를 먼저 호출해 위험 등급 기준을 확인합니다
3. `check_message_privacy`에 테스트 메시지를 입력하여 탐지 결과를 확인합니다

헬스체크:
```bash
curl http://localhost:3000/health
```

도구 직접 호출 (curl):
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "check_message_privacy",
      "arguments": {
        "message": "제 번호 010-1234-5678이고 주민번호는 900101-1234567입니다.",
        "context": "messenger",
        "strictness": "strict"
      }
    }
  }'
```

---

## Render.com 배포

### 1. GitHub 저장소 생성 및 푸시

```bash
git init
git add .
git commit -m "feat: Privacy Guard MCP initial release"
git remote add origin https://github.com/<your-username>/playmcp-privacy-guard.git
git push -u origin main
```

### 2. Render.com 설정

1. [https://render.com](https://render.com) 에서 **New → Web Service** 선택
2. GitHub 저장소 연결 (`render.yaml`이 자동으로 설정을 불러옵니다)
3. 수동 설정 시 아래 값을 입력합니다:

| 항목 | 값 |
|------|-----|
| Name | `playmcp-privacy-guard` |
| Environment | `Node` |
| Region | `Singapore (Southeast Asia)` |
| Build Command | `pnpm install && pnpm build` |
| Start Command | `node dist/index.js` |
| Health Check Path | `/health` |

4. Environment Variables 추가:
   - `PORT` = `10000`
   - `HOST` = `0.0.0.0`
   - `NODE_ENV` = `production`

5. **Create Web Service** 클릭 후 배포 완료 대기

### 3. 배포 확인

```bash
curl https://<your-render-service>.onrender.com/health
```

정상 응답:
```json
{"status":"ok","service":"Privacy Guard MCP","version":"1.0.0"}
```

---

## 프로젝트 구조

```
src/
├── index.ts              # HTTP 서버 진입점 (stateless Streamable HTTP)
├── server.ts             # McpServer 팩토리 함수
├── core/
│   ├── types.ts          # 공유 타입 정의
│   ├── detectors.ts      # 14가지 패턴 탐지 + 복합 조합 감지
│   ├── masking.ts        # 마스킹 유틸리티
│   └── riskScoring.ts    # 위험 점수 계산
├── tools/
│   ├── checkMessagePrivacy.ts
│   ├── checkMessagesBatch.ts
│   ├── maskSensitiveInfo.ts
│   ├── rewriteSafeMessage.ts
│   └── getPrivacyRiskGuide.ts
└── utils/
    └── safeLogging.ts    # PII 비노출 안전 로깅
```

---

## PlayMCP 제출 전 체크리스트

- [x] Streamable HTTP 방식 사용 (`StreamableHTTPServerTransport`)
- [x] Stateless 구조 (`sessionIdGenerator: undefined`, 세션 Map 없음)
- [x] `/mcp` POST endpoint 정상 동작
- [x] `/health` GET endpoint 정상 동작
- [x] 도구 개수 5개 (≤ 20개 조건 충족)
- [x] 도구 이름 및 코드 전체에 "kakao" 미포함 (대소문자 불문)
- [x] Server Name → `"Privacy Guard MCP"` (kakao 미포함)
- [x] 모든 도구에 `name`, `description`, `inputSchema`, `annotations` 존재
- [x] 모든 `annotations`에 `title`, `readOnlyHint`, `destructiveHint`, `openWorldHint`, `idempotentHint` 존재
- [x] `destructiveHint: false` / `readOnlyHint: true` / `idempotentHint: true` / `openWorldHint: false`
- [x] `description` 영어 작성, "Privacy Guard MCP" 포함, 1,024자 이내
- [x] tool result에 raw PII 미포함 (마스킹 버전만 반환)
- [x] 로그에 개인정보 원문 미기록 (safe logging 적용)
- [x] `PORT` 환경변수 사용
- [x] `render.yaml` 배포 파일 존재
