# Segurança, backup e rollback

## Garantias

1. **Nada muda sem passar pelo pipeline.** Regras não recebem acesso de escrita: elas só descrevem
   `ChangeOperation`s; quem aplica é o executor transacional do pipeline.
2. **Preview completo antes de qualquer escrita** — toda a transação é avaliada (segurança + permissões) antes da
   primeira alteração. Se qualquer item estiver bloqueado, nada é aplicado.
3. **Backup antes de cada alteração**: o estado anterior do valor e, para registro, um snapshot de **todos os valores
   da chave**. Gravado no SQLite (`Backups`) e espelhado em `backups/<TX>.jsonl` legível por humanos.
4. **Verificação**: após aplicar, o estado é relido; se não bater com o desejado, a transação falha.
5. **Atomicidade**: falha em qualquer item → rollback, em ordem reversa, de tudo o que já havia sido aplicado.
6. **Rollback granular**: `nexus rollback TX-… [--item <id>]` desfaz a transação ou um único item.
7. **Proteção contra sobrescrever o usuário**: se o valor foi alterado fora do Nexus depois de aplicado, o rollback
   **pula** essa alteração e avisa (o item continua "Applied"); `--force` restaura mesmo assim.
8. **Ponto de restauração do Windows** para transações de risco alto (quando elevado) — complementar, nunca substituto.

## SafetyPolicy (aplicada a toda alteração)

| Bloqueio | Motivo |
|---|---|
| `HKLM\SAM`, `HKLM\SECURITY`, `…\Lsa`, `…\Winlogon`, `…\Image File Execution Options`, políticas do Defender, BCD | áreas de segurança/boot |
| `HKLM\SYSTEM\CurrentControlSet\Services` via registro | serviços só pelo handler de serviços (SCM) |
| Serviços críticos (RpcSs, EventLog, WinDefend, BFE, mpssvc, wuauserv, Winmgmt, …) | estabilidade/segurança |
| Terminar ou mudar afinidade de processo protegido; rebaixar prioridade de processo protegido | estabilidade |
| Prioridade `RealTime` | pode travar o sistema |
| Arquivos fora de pastas Temp | limpeza restrita |
| Tipos de mudança perigosos em regras JSON (só `registry.value`, `service.startMode`, `power.activeScheme`) | extensibilidade segura |

## Processos protegidos — por recurso, não só por nome

Um processo é protegido quando:
- é pseudo-processo do kernel (`Idle`, `System`, `Registry`, `Secure System`, `Memory Compression`);
- o Windows o marca como **crítico** (`IsProcessCritical`) — encerrá-lo derruba o sistema;
- é um componente do Windows rodando como **LocalSystem** a partir do diretório do Windows;
- consta na lista configurável **e** está no diretório esperado (`csrss.exe` em `%System32%`, `explorer.exe` em `%Windows%`…);
- é o próprio Nexus.

Um `csrss.exe`/`svchost.exe` fora do diretório esperado **não** é protegido — é classificado como **SUSPICIOUS**
(indicador, não veredito de malware). O Nexus nunca finaliza processos automaticamente.

## Classificação

`SYSTEM` (kernel, crítico, binário Microsoft no diretório do Windows) · `TRUSTED` (assinatura válida) ·
`USER` (sem assinatura em local comum) · `UNKNOWN` (caminho/assinatura ilegível) ·
`SUSPICIOUS` (nome de processo do sistema em local errado, assinatura inválida, não assinado rodando de Temp/Downloads).

A verificação de assinatura usa `WinVerifyTrust` (assinatura embutida e **catálogo**, necessário para System32),
sem checagem online de revogação.

## Menor privilégio

- UI e host: `asInvoker`. O instalador é por usuário (`PrivilegesRequired=lowest`).
- Mudanças HKCU, plano de energia, prioridades e quarentena de Temp não exigem admin.
- Mudanças de máquina retornam `ElevationRequired`; com o broker, um processo elevado de vida curta executa
  apenas aquela transação, via UAC, e encerra.

## Quarentena de arquivos

A limpeza de Temp **move** arquivos antigos (padrão: > 7 dias) para `%LOCALAPPDATA%\NexusOptimizer\data\quarantine`.
Arquivos em uso são ignorados. O rollback os devolve ao lugar original. O espaço só é liberado quando a quarentena
é esvaziada — ação explícita do usuário.

## Logs

Níveis `TRACE, DEBUG, INFO, WARNING, ERROR, CRITICAL` em SQLite e `logs/nexus-yyyyMMdd.log`.
O `LogRedactor` substitui caminho do perfil (`%USERPROFILE%`), nome do usuário (`<user>`) e da máquina (`<machine>`).
Linhas de comando de processos não são registradas. Um *sink* com falha nunca derruba a engine.
