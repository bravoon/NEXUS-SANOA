# Arquitetura — NEXUS OPTIMIZER

## 1. Princípio: engine-first

A **Optimization Engine** (`Nexus.Engine`) é o produto. Ela não conhece nenhuma interface; expõe
`IOptimizationEngine` e devolve **objetos estruturados** (`OptimizationRecommendation`, `AnalysisReport`,
`OptimizationTransaction`, `BenchmarkResult`…), nunca texto pronto para a tela.

```
UI ──IPC──► Application Service ──► Optimization Engine ──► System Abstraction ──► Windows
CLI ───────► Application Service ──► (a mesma engine)
```

A UI referencia apenas `Nexus.Contracts` e `Nexus.Ipc`. O teste `ArchitectureTests` falha se:

- `Nexus.UI.csproj` referenciar qualquer outro projeto;
- algum `.cs`/`.xaml` da UI contiver `Microsoft.Win32`, `System.Management`, `ServiceController`, `Registry.`,
  `PerformanceCounter`, `DllImport`, `powershell`, `Process.GetProcesses`, `.Kill(` ou namespaces da engine;
- qualquer camada acima de `Nexus.Platform` usar APIs do Windows diretamente;
- as referências entre camadas não forem estritamente descendentes.

## 2. Camadas

### Presentation — `Nexus.UI` (WPF, MVVM)
Páginas: Dashboard, Diagnostics, Optimizations, Processes, Startup, Gaming, Benchmark, Profiles, History & Restore.
Conecta-se ao host (`nexus serve`) pelo Named Pipe do usuário; se o host não estiver rodando, inicia-o com
`--idle-exit 30` (ele encerra sozinho após a última desconexão). Recebe eventos em tempo real para progresso.

### Application — `Nexus.Application`
- **Serviços de caso de uso** (`SystemService`, `OptimizationService`, `ProcessService`, `StartupService`,
  `GamingService`, `ProfileService`, `BenchmarkService`, `RestoreService`): validação de entrada e orquestração fina.
- **`ApiDispatcher`**: mapeia rotas da API para os serviços; erros viram códigos estruturados
  (`invalid_request`, `not_found`, `refused`, `unknown_route`, `internal_error`).
- **`NexusRuntime`**: raiz de composição (plataforma real ou simulada, SQLite, logs, regras JSON, broker de elevação).
- **`ProcessElevationBroker`**: elevação sob demanda (ver §6).

### Optimization Engine — `Nexus.Engine`

| Componente | Responsabilidade |
|---|---|
| `SystemAnalyzer` | **Somente observa.** Coleta SO, CPU, GPU, RAM, discos, rede, drivers, plano de energia, Game Mode/DVR/HAGS, serviços, startup, processos e séries de uso. Cada coletor é isolado: falha vira *warning*, não scan falho. |
| `DiagnosticEngine` | Converte medições em diagnósticos com `Confidence` (`CONFIRMED/LIKELY/POSSIBLE/UNKNOWN`) e avalia o gargalo principal. Agrega contribuições dos módulos (`IDiagnosticContributor`). |
| `OptimizationRuleEngine` | Registro e avaliação isolada das regras (`IOptimizationRule`). Regra que lança exceção é registrada no log e ignorada. |
| Módulos (`IOptimizationModule`) | `WindowsOptimizer`, `GamingOptimizer`, `StartupOptimizer`, `ProcessOptimizer`, `ServiceOptimizer`, `PowerOptimizer`, `NetworkOptimizer`, `StorageOptimizer`, `MemoryOptimizer`, `RegistryOptimizer`, `DebloatOptimizer`, `DriverAnalyzer`. Cada um: `Scan / Analyze / GetRecommendations / Preview / Apply / Rollback / Validate`. |
| `OptimizationPipeline` | Preview → permissão → backup → apply → verify → validate → commit; rollback atômico em falha. Transações serializadas. |
| `SafetyPolicy` | Última barreira, aplicada a **toda** alteração, independentemente da regra que a gerou. |
| `ProcessEngine` + `ProcessClassifier` | Enumeração, CPU/RAM/GPU/disco por processo, assinatura, classificação e proteção. |
| `StartupEngine` | Run keys, pastas Startup, tarefas agendadas de logon/boot, serviços automáticos de terceiros. |
| `GamingEngine` + `GameDetector` | Steam/Epic/GOG, launchers, perfis por jogo, monitor que aplica/restaura por sessão. |
| `BenchmarkEngine` | Captura de frame times (PresentMon ou CSV), carga do sistema, métricas, comparação com limiar de ruído. |
| `HardwareEngine` | Amostras de telemetria com `value/unit/timestamp/source/availability`. |
| `ProfileEngine` | Perfis como coleções de configurações, aplicados pelo mesmo pipeline. |
| `EngineEventBus` | Eventos `ScanStarted/Progress/Completed`, `Optimization*`, `Rollback*`, `Benchmark*`, `GameStarted/Stopped`… |

### Safety — `Nexus.Security`
`BackupManager`, `RestoreManager`, `RollbackEngine`, `PermissionManager` (ver [SAFETY.md](SAFETY.md)).

### System Abstraction — `Nexus.Platform`
Interfaces em `Abstractions/` (`IRegistryAccessor`, `IServiceManager`, `IProcessManager`, `IPowerManager`,
`ITaskSchedulerAccessor`, `IFileSystem`, `IHardwareSensorProvider`, `ISystemInfoProvider`, `ISignatureVerifier`,
`IPrivilegeProvider`, `IRestorePointProvider`, `IFrameTimeSource`), implementações reais em `Windows/` e a
máquina simulada em `Simulation/`.

**Primitivas de mudança** (`Changes/`): toda alteração do sistema é um `ISystemChangeHandler` com
`Capture / Apply / Matches / RequiresAdmin / Reversible`:

| Kind | Alvo | Admin |
|---|---|---|
| `registry.value` | `HKCU\…\Key\|Value` | só HKLM/HKU |
| `service.startMode` | nome do serviço | sim |
| `power.activeScheme` | `active` | não |
| `task.enabled` | caminho da tarefa | sim |
| `process.priority` / `process.affinity` | `pid:startTicks` (protege contra reuso de PID) | não |
| `process.terminate` | `pid:startTicks` — **irreversível**, só a pedido explícito | não |
| `file.quarantine` | caminho do arquivo (só dentro de pastas Temp) | não |

Como toda mudança é *dado* (kind + alvo + estado desejado), preview, backup, verificação e rollback são genéricos.

### Data — `Nexus.Data`
SQLite com migrações versionadas (`PRAGMA user_version`), WAL, uma tabela por entidade:
`SystemSnapshots`, `OptimizationRules`, `OptimizationTransactions`, `Backups`, `Profiles`, `GameProfiles`,
`Benchmarks`, `Logs`, `Settings`. Os dados ficam em `%LOCALAPPDATA%\NexusOptimizer\data` (ou `simulated`).

## 3. Fluxo de uma otimização

```
GetRecommendations
  └─ Analyzer (snapshot) → DiagnosticEngine (report) → módulos → RuleEngine.Evaluate(ctx)
        ctx = snapshot + análise + configuração + ISystemReader (somente leitura)
ExecuteOptimization(ids)
  └─ resolve ids → PlannedAction[] → Pipeline.ExecuteAsync
        1. Preview de tudo + SafetyPolicy (bloqueia antes de tocar em qualquer coisa)
        2. PermissionManager → ElevationRequired / broker
        3. Transação TX-… salva como Pending (+ ponto de restauração se risco alto e elevado)
        4. para cada ação: rule.Apply(candidate, executor)
              executor: SafetyPolicy → backup da chave inteira + do valor → Apply → Capture → Matches?
        5. rule.Validate
        6. Commit (ou rollback de todos os itens aplicados, em ordem reversa)
```

## 4. Diagnóstico e confiança

- `CONFIRMED`: fato (valor de configuração, erro de dispositivo) ou medição sustentada com amostras suficientes.
- `LIKELY`: evidência forte, mas há explicação alternativa (ex.: gargalo de thread única; pressão de memória sem medir paginação).
- `POSSIBLE`: evidência fraca ou parcial (poucas amostras, sensor ausente, driver "antigo").
- `UNKNOWN`: dados insuficientes — por exemplo, sistema ocioso: não há gargalo a medir sem carga.

Exemplo: GPU ≥ 95 % em ≥ 80 % de ≥ 5 amostras com CPU moderada → `Gpu / CONFIRMED`; o mesmo padrão com 2
amostras → `LIKELY`; CPU alta sem telemetria de GPU → `Cpu / POSSIBLE` ("GPU não pode ser descartada").

## 5. Eventos
`EngineEvent(Type, Timestamp, CorrelationId, Progress, Message, Data)` — `Data` é JSON estruturado
(ex.: uma `HardwareSample` em `BenchmarkUpdated`). A UI assina via `/events/subscribe`.

## 6. Privilégios
- UI e host rodam como usuário comum (`asInvoker`).
- Quando uma transação contém mudanças de máquina (HKLM, serviços, tarefas), o pipeline devolve `ElevationRequired`.
- Se houver broker, a engine reserva um `TX-id` e o `ProcessElevationBroker` executa
  `nexus elevated-apply --request <base64url>` via UAC (`runas`). O processo elevado executa **só aquela transação**
  (sem poder elevar de novo) e encerra; o resultado é lido do SQLite compartilhado.

## 7. Substituindo a UI
Um novo cliente (web, mobile, outro desktop) só precisa falar o protocolo de `Nexus.Ipc`
(frames `uint32 LE + JSON ApiEnvelope`) ou referenciar `Nexus.Application` em processo. Nada na engine muda.
