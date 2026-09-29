# Configuração

Arquivo: `config/nexus.json` (comentários e vírgulas finais permitidos). Todo valor tem padrão seguro no código;
informe apenas o que quiser mudar. Local procurado: pasta `config` ao lado do executável ou em diretórios pais,
ou `--config-dir`.

| Chave | Padrão | Uso |
|---|---|---|
| `defaultSampleSeconds` | 5 | amostras de uso coletadas no scan |
| `sampleIntervalSeconds` | 1 | intervalo entre amostras |
| `processMeasurementMs` | 1000 | janela para medir CPU/IO por processo |
| `diagnostics.gpuSaturationPercent` | 95 | GPU "saturada" |
| `diagnostics.gpuHighPercent` | 90 | GPU alta (não sustentada) |
| `diagnostics.cpuHighPercent` | 85 | CPU alta |
| `diagnostics.coreSaturationPercent` | 95 | núcleo lógico saturado (thread única) |
| `diagnostics.memoryHighPercent` | 90 | pressão de memória |
| `diagnostics.diskActiveHighPercent` | 90 | disco ocupado |
| `diagnostics.loadThresholdPercent` | 50 | abaixo disso o sistema é considerado ocioso |
| `diagnostics.sustainedFraction` | 0.8 | fração de amostras acima do limiar para "sustentado" |
| `diagnostics.minSamplesForConfirmed` | 5 | amostras mínimas para `CONFIRMED` |
| `diagnostics.cpuTempHighCelsius` / `gpuTempHighCelsius` | 90 / 85 | alertas térmicos |
| `diagnostics.driverAgeMonthsWarning` | 12 | driver de GPU "antigo" (POSSIBLE) |
| `diagnostics.lowFreeSpacePercent` | 10 | pouco espaço livre |
| `tempCleanupMinAgeDays` | 7 | idade mínima de arquivos Temp |
| `tempCleanupMinTotalMb` | 500 | total mínimo para sugerir limpeza |
| `benchmarkNoiseThresholdPercent` | 3 | abaixo disso: "sem mudança significativa" |
| `logLevel` | `Info` | `Trace`…`Critical` |
| `logRetentionDays` | 30 | limpeza de logs |
| `snapshotRetention` | 20 | snapshots guardados |
| `rulesDirectory` | `rules` | regras JSON (relativo a `config`) |
| `protectedProcesses` | lista | `{ "name": "csrss.exe", "expectedDirectory": "%System32%" }` |
| `criticalServices` | lista | serviços que nenhuma regra pode alterar |
| `startup.criticalPatterns` | lista | nomes/publicadores nunca sugeridos para desativar |
| `startup.knownImpact` | mapa | impacto conhecido de apps (`"Discord": "High"`) |

## Diretórios de dados

`%LOCALAPPDATA%\NexusOptimizer\data\` (ou `…\simulated\` em `--simulate`), alterável com `--data-dir`:

```
nexus.db          SQLite (snapshots, regras, transações, backups, perfis, benchmarks, logs, settings)
backups\TX-….jsonl  espelho legível dos backups de cada transação
quarantine\       arquivos movidos pela limpeza de Temp
logs\             nexus-yyyyMMdd.log
```

## Ferramentas opcionais

`tools\PresentMon.exe` habilita captura de FPS/frame time. Sem ele, benchmarks medem só a carga do sistema e
informam explicitamente que FPS não pôde ser medido.
