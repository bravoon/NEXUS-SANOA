# API interna

## Transporte

**Named Pipe local** — escolhido por ser a opção mais segura e nativa para comunicação local no Windows:

- não abre porta TCP (nada exposto na rede, nada de firewall/CSRF/DNS-rebinding como num REST local);
- ACL do pipe: acesso **somente para o SID do usuário atual** e **negação explícita a logons de rede** (`NETWORK`);
- o cliente conecta com `PipeOptions.CurrentUserOnly`, que valida que o servidor pertence ao mesmo usuário (anti-squatting);
- nome por usuário: `nexus-optimizer-<hash do usuário>` (`-sim-` no modo simulado);
- frames com prefixo de tamanho (`uint32` little-endian) + JSON UTF-8, máximo 16 MB; frame inválido encerra a conexão;
- só rotas de `ApiRoutes` são aceitas; exceções nunca vazam stack trace.

### Envelope

```json
{ "kind": "Request", "id": "3f2c…", "route": "/optimization/preview", "payload": { "id": "gaming.enable-game-mode" } }
{ "kind": "Response", "id": "3f2c…", "route": "/optimization/preview", "success": true, "payload": { … } }
{ "kind": "Response", "id": "…", "success": false, "error": { "code": "not_found", "message": "…" } }
{ "kind": "Event", "id": "…", "event": { "type": "ScanProgress", "progress": 0.4, "message": "Collecting drivers", "data": { … } } }
```

## Rotas

| Rota | Payload | Resposta |
|---|---|---|
| `/system/scan` | `ScanRequest { sampleSeconds? }` | `SystemSnapshot` |
| `/system/status` | — | `SystemStatus` |
| `/system/analyze` | — | `AnalysisReport` |
| `/system/telemetry` | — | `HardwareSample` |
| `/optimization/rules` | — | `RuleDescriptor[]` |
| `/optimization/recommendations` | — | `OptimizationRecommendation[]` |
| `/optimization/preview` | `IdRequest { id }` | `OptimizationPreview` |
| `/optimization/apply` | `ExecuteOptimizationRequest { optimizationIds[], dryRun, createRestorePoint }` | `ExecutionResult` |
| `/optimization/rollback` | `RollbackRequest { transactionId, itemId?, force }` | `RollbackResult` |
| `/processes` | `ProcessListRequest { top, includeSystem }` | `ProcessInfo[]` |
| `/processes/priority` | `SetPriorityRequest { pid, priority }` | `ProcessActionResult` |
| `/processes/terminate` | `TerminateProcessRequest { pid, userConfirmed }` | `ProcessActionResult` |
| `/startup` | — | `StartupEntryInfo[]` |
| `/startup/set-enabled` | `StartupToggleRequest { entryId, enabled }` | `ExecutionResult` |
| `/gaming/games` · `/gaming/launchers` | — | `GameInfo[]` · `LauncherInfo[]` |
| `/gaming/profiles` | — | `GameProfile[]` |
| `/gaming/profiles/save` | `GameProfile` | `GameProfile` |
| `/gaming/apply` | `GameApplyRequest { gameId, dryRun }` | `ExecutionResult` |
| `/profiles` | — | `{ profiles: ProfileDefinition[], settings: ProfileSettingDescriptor[] }` |
| `/profiles/save` | `ProfileDefinition` | `ProfileDefinition` |
| `/profiles/apply` | `ApplyProfileRequest { name, dryRun }` | `ExecutionResult` |
| `/benchmark/start` | `BenchmarkRequest { name, duration, processName?, frameTimeCsvPath? }` | `IdRequest` |
| `/benchmark/stop` | `IdRequest` | `BenchmarkResult` |
| `/benchmark/results` | — | `BenchmarkResult[]` |
| `/benchmark/compare` | `CompareRequest { baselineId, candidateId }` | `BenchmarkComparison` |
| `/restore/history` | — | `OptimizationTransaction[]` |
| `/restore/rollback` | `RollbackRequest` | `RollbackResult` |
| `/logs` | `LogQuery { take, minLevel }` | `LogEntry[]` |
| `/events/subscribe` | — | (a partir daqui o cliente recebe `Event`s) |

## Ids de otimização aceitos por preview/apply

| Forma | Exemplo |
|---|---|
| `<ruleId>` / `<ruleId>:<alvo>` | `gaming.enable-game-mode`, `startup.disable-high-impact:st-b98d1cfb8a` |
| `startup:<entryId>:on\|off` | `startup:st-b98d1cfb8a:off` |
| `profile:<nome>` | `profile:Gaming` |
| `game:<gameId>` | `game:steam:1091500` |
| `process:<pid>:priority:<p>` | `process:6100:priority:BelowNormal` |

## Exemplo de recomendação

```json
{
  "optimizationId": "startup.disable-high-impact:st-b98d1cfb8a",
  "ruleId": "startup.disable-high-impact",
  "name": "Disable startup: Discord",
  "category": "Startup",
  "target": "Discord",
  "impact": "Medium",
  "risk": "Low",
  "expectedBenefitConfidence": "Likely",
  "reversible": true,
  "requiresAdmin": false,
  "requiresReboot": false,
  "status": "Recommended",
  "justification": [
    "✓ Entry is enabled", "✓ StartupImpact >= Medium", "✓ ApplicationNotCritical == TRUE", "✓ Source is not a service",
    "Impact High (known application profile)",
    "Expected effect: faster sign-in and less background activity; in-game FPS is usually unaffected."
  ]
}
```
