# NEXUS OPTIMIZER

Otimizador e ferramenta de diagnóstico para PCs Windows, construído com **arquitetura engine-first**:
toda a lógica (análise, diagnóstico, regras, execução, backup, rollback, benchmarks, perfis) vive na
**Optimization Engine**. A interface gráfica e a CLI são apenas **clientes** dela.

> **Regra fundamental: UI ≠ ENGINE.** A UI pode ser trocada inteira sem mudar uma linha da lógica de otimização.
> Isso é verificado por testes automatizados (`ArchitectureTests`).

Prioridades, nesta ordem: **segurança → estabilidade → diagnóstico → reversibilidade → performance → interface**.
O Nexus mede, diagnostica e justifica cada alteração. Ele nunca finge que o PC ficou mais rápido.

---

## Arquitetura

```
 Desktop UI (WPF)          CLI (nexus.exe)          (futuro) Web / Mobile
      │  Named Pipe (IPC)        │ in-process                │
      ▼                          ▼                           ▼
 ┌──────────────── Application Layer (Nexus.Application) ─────────────────┐
 │  SystemService · OptimizationService · ProcessService · StartupService │
 │  GamingService · ProfileService · BenchmarkService · RestoreService    │
 │  ApiDispatcher (rotas /system/scan, /optimization/apply, …)            │
 └───────────────────────────────┬────────────────────────────────────────┘
                                 ▼
 ┌──────────────── Optimization Engine (Nexus.Engine) ────────────────────┐
 │ SystemAnalyzer → DiagnosticEngine → OptimizationRuleEngine → Pipeline  │
 │ 12 módulos · ProcessEngine · StartupEngine · GamingEngine               │
 │ BenchmarkEngine · HardwareEngine · ProfileEngine · EventBus             │
 └───────────────┬───────────────────────────────┬────────────────────────┘
                 ▼                               ▼
 ┌─ Safety Layer (Nexus.Security) ─┐   ┌─ Data Layer (Nexus.Data) ─────────┐
 │ BackupManager · RestoreManager  │   │ SQLite · Configuração · Logs       │
 │ RollbackEngine · PermissionMgr  │   │ Perfis · Benchmarks · Transações   │
 └───────────────┬─────────────────┘   └────────────────────────────────────┘
                 ▼
 ┌──────── System Abstraction Layer (Nexus.Platform) ─────────────────────┐
 │ Registry · WMI · Services · Processes · Performance Counters · Power   │
 │ Task Scheduler · Authenticode · Sensors · Restore Points · PresentMon  │
 │ + SimulatedPlatform (máquina virtual em memória p/ testes e --simulate) │
 └───────────────────────────────┬────────────────────────────────────────┘
                                 ▼
                              Windows
```

| Projeto | Camada | Depende de |
|---|---|---|
| `Nexus.Contracts` | Contratos de dados (DTOs, eventos, rotas da API) | — |
| `Nexus.Platform` | System Abstraction Layer (única que chama o Windows) | Contracts |
| `Nexus.Data` | SQLite, configuração, logging | Contracts |
| `Nexus.Security` | Backup, restore, rollback, permissões | Platform, Data |
| `Nexus.Engine` | **Optimization Engine** | Platform, Data, Security |
| `Nexus.Ipc` | Transporte da API interna (Named Pipes) | Contracts |
| `Nexus.Application` | Serviços de aplicação, despachante da API, composição | Engine, Ipc |
| `Nexus.CLI` | `nexus.exe` — CLI **e** host da engine (`nexus serve`) | Application |
| `Nexus.UI` | Interface desktop WPF | **somente** Contracts + Ipc |
| `Nexus.Tests` | 96 testes da engine, sem UI | Application |

> A camada de sistema chama-se `Nexus.Platform` (e não `Nexus.System`) para não sombrear o namespace `System` do .NET.

Detalhes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · API: [docs/API.md](docs/API.md) ·
Segurança: [docs/SAFETY.md](docs/SAFETY.md) · Regras: [docs/RULES.md](docs/RULES.md) ·
Configuração: [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

---

## Pipeline seguro

Toda alteração — regra, perfil, startup, prioridade de processo — passa pelo mesmo pipeline:

```
Detect → Analyze → Recommend → Preview → Backup → Apply → Verify → Validate → Commit
                                                    └── falha ──► Rollback de toda a transação
```

Cada execução é uma **transação** (`TX-20260929-001`) com estado anterior, novo estado, backup e dados de rollback
por alteração. É possível desfazer a transação inteira **ou um único item**, sem restaurar o computador.

## Compilar e testar

Requer o .NET 8 SDK.

```bash
dotnet build NexusOptimizer.sln
dotnet test src/Nexus.Tests            # 96 testes, rodam em Windows e Linux, sem UI
```

Publicar (Windows): `pwsh installer/publish.ps1` → `publish/NexusOptimizer/` com `NexusOptimizer.exe` (UI)
e `nexus.exe` (CLI/host). Instalador opcional: `iscc installer/NexusOptimizer.iss` (instalação por usuário, sem admin).

## CLI

```text
nexus scan                         # snapshot somente-leitura
nexus analyze --seconds 30         # diagnóstico + gargalo (rode seu jogo durante a coleta)
nexus recommendations              # recomendações com justificativa e condições avaliadas
nexus preview <id>                 # exatamente o que muda: antes → depois
nexus optimize --id <id> --id <id> # aplica como UMA transação (pede confirmação)
nexus optimize --recommended       # só as "RECOMMENDED", nunca as opcionais
nexus rollback TX-20260929-001 [--item <id>]
nexus history
nexus processes | startup | games | rules | status | logs
nexus profile gaming [--dry-run]
nexus benchmark --process cs2.exe --duration 60
nexus benchmark compare <baseline> <candidate>
nexus serve                        # API para a UI (Named Pipe restrito ao usuário atual)
```

`--json` em qualquer comando devolve os objetos estruturados da engine. `--simulate` usa a máquina simulada.

### Modo simulado

Fora do Windows (ou com `--simulate`) a engine roda sobre `SimulatedPlatform`, uma máquina Windows virtual em memória
com problemas típicos (Game Mode desligado, apps pesados no startup, arquivos temporários antigos, um processo suspeito,
driver com erro). **Nada do computador real é lido ou alterado**, e todas as leituras são rotuladas como `simulated`.
É o mesmo mecanismo usado como *mock* das APIs do Windows nos testes.

## O que o Nexus deliberadamente NÃO faz

- **Limpeza de registro** — sem benefício mensurável, risco real.
- **"RAM cleaner"** (forçar trimming de working set) — piora a performance.
- **Finalizar processos automaticamente** — só com pedido explícito, nunca processos protegidos.
- **Desativar Defender, firewall, Windows Update ou serviços críticos.**
- **Prioridade RealTime** — pode travar o sistema.
- **Inventar sensores** — temperatura/GPU indisponíveis aparecem como *unavailable*.
- **Afirmar ganho de FPS** — comparações dentro do ruído são reportadas como "sem mudança significativa".

## Estado atual e limitações

- A engine, as regras, o pipeline transacional, rollback, IPC, CLI e diagnósticos são exercitados por 96 testes
  automatizados sobre a plataforma simulada, e a CLI foi executada ponta a ponta no modo simulado.
- As implementações Windows (`Nexus.Platform/Windows`: Registry, WMI, SCM, powrprof, Task Scheduler COM,
  Authenticode/catálogo, Performance Counters, nvidia-smi, System Restore) e a UI WPF **compilam**, mas devem ser
  validadas em uma máquina Windows 10/11 real antes de uso em produção (o CI inclui um job `windows-latest`).
- FPS/frame times exigem o [PresentMon](https://github.com/GameTechDev/PresentMon) em `tools\` (não distribuído)
  ou a importação de um CSV (PresentMon, CapFrameX, OCAT).
- Temperatura de CPU via WMI (`MSAcpi_ThermalZoneTemperature`) requer administrador e nem toda placa expõe;
  temperatura/potência de GPU só para NVIDIA (via `nvidia-smi`). Nos demais casos o valor é reportado como indisponível.
