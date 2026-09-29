# Regras de otimização

Cada otimização é uma regra isolada com: **ID, Name, Description, Category, Conditions, Impact, Risk,
RequiresAdmin, Reversible, BackupRequired, Apply(), Rollback(), Validate()**. Adicionar uma regra não altera o
núcleo da engine.

## Regras embutidas

| ID | Módulo | Status típico | Admin | Observação |
|---|---|---|---|---|
| `startup.disable-high-impact` | Startup | Recommended (High) / Optional (Medium) | HKCU não, HKLM/tarefas sim | usa `StartupApproved` (igual ao Gerenciador de Tarefas); nunca apaga a entrada |
| `power.high-performance-plan` | Power | Recommended só se CPU medida como gargalo ou Power saver na tomada | não | NotApplicable na bateria |
| `gaming.enable-game-mode` | Gaming | Recommended se desligado | não | restaura o padrão do Windows |
| `gaming.disable-background-capture` | Gaming | Optional | não | perde o recurso de gravação |
| `gaming.hardware-gpu-scheduling` | Gaming | Optional | sim | reinício; efeito varia |
| `service.diagtrack-manual` | Service | Optional | sim | Manual, nunca Disabled |
| `storage.quarantine-old-temp-files` | Storage | Recommended se pouco espaço | não | quarentena reversível |
| `debloat.disable-consumer-suggestions` | Debloat | Optional | não | não remove apps |
| `process.deprioritize-background` | Process | Optional | não | só na sessão; nunca finaliza |
| `windows.disable-startup-delay` (JSON) | Windows | Optional | não | |
| `windows.disable-search-web-suggestions` (JSON) | Windows | Optional | não | |
| `network.delivery-optimization-lan-only` (JSON) | Network | Optional | sim | |

`DriverAnalyzer`, `MemoryOptimizer`, `NetworkOptimizer` e `RegistryOptimizer` contribuem principalmente com
**diagnósticos**: o Nexus não atualiza drivers, não "limpa" RAM e não "limpa" o registro.

## Regra em C#

```csharp
public sealed class MyRule : OptimizationRule
{
    private static readonly Condition<GamingSettingsInfo> Off =
        new("Game Mode is explicitly disabled", (g, _) => g.GameModeEnabled == false);

    public override RuleDescriptor Descriptor { get; } = Describe(
        "gaming.my-rule", "Nome", "Descrição", OptimizationCategory.Gaming,
        ImpactLevel.Low, RiskLevel.Low, requiresAdmin: false, Off.Leaves());

    public override IEnumerable<RuleCandidate> Evaluate(RuleContext ctx)
    {
        var r = Off.Evaluate(ctx.Snapshot.Gaming, ctx);
        if (!r.Passed) yield break;
        yield return Candidate(null, "Nome", "alvo", RecommendationStatus.Optional, Confidence.Possible, r.Trace,
            [new ChangeOperation("registry.value", @"HKCU\Software\Microsoft\GameBar|AutoGameModeEnabled",
                StateValue.Of("1", "DWord"), "Enable Game Mode")]);
    }
    // Apply/Validate/Rollback têm implementação padrão baseada nas operações.
}
```

Registre com `new NexusEngineBuilder().AddRule(new MyRule())` ou inclua-a no `BuiltInRules` de um módulo.
`Evaluate` recebe um `RuleContext` **somente leitura** — não há como escrever no sistema a partir de uma regra.

## Regra declarativa (JSON, sem recompilar)

Arquivos `config/rules/*.json` (objeto ou lista; comentários permitidos):

```json
{
  "id": "windows.disable-startup-delay",
  "name": "Remove startup application delay",
  "description": "…",
  "category": "Windows",
  "impact": "Low",
  "risk": "Low",
  "benefitConfidence": "Possible",
  "recommendation": "Optional",
  "conditions": [
    { "fact": "registry:HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize|StartupDelayInMSec",
      "operator": "notEquals", "value": "0" }
  ],
  "changes": [
    { "kind": "registry.value",
      "target": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize|StartupDelayInMSec",
      "value": "0", "valueKind": "DWord" }
  ],
  "notes": [ "…" ]
}
```

- **Fatos**: `registry:<chave>|<valor>`, `snapshot:power.onAcPower`, `snapshot:power.hasBattery`, `snapshot:os.build`,
  `snapshot:memory.totalGb`, `snapshot:cpu.logicalProcessors`, `snapshot:gaming.gameModeEnabled`, `snapshot:system.isSimulated`.
- **Operadores**: `equals`, `notEquals`, `exists`, `notExists`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`, `contains`.
- **Mudanças permitidas**: `registry.value` (`value`, `valueKind`, ou `delete: true`), `service.startMode`, `power.activeScheme`.
- `requiresAdmin` é calculado a partir das mudanças; a regra vira `AlreadyApplied` quando tudo já está no estado desejado.
- Arquivo inválido é ignorado e registrado no log; ele não impede a engine de iniciar.
- Regras podem ser desativadas individualmente (`OptimizationRules.Enabled = 0`).
