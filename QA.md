<!-- tools: Bash,Read -->
# QA: temporal bag

Temporal Barry bag — wraps the temporal-mcp-server (stdio via uvx), the `temporal` CLI as in-process tools, and official Temporal agent skills.

## Requirements

- `node` (v18+)
- `pnpm`
- Optional: `temporal` CLI, `uvx`, `barry` CLI — steps that need them are Online checks and are SKIPPED when absent

## Setup

```bash
pnpm install 2>&1 | grep -v ERR_PNPM || true
./setup.sh
```

## Test Steps

### 1. TypeScript compiles

```bash
npx tsc --noEmit
```

**Expected:** Exit code 0, no output (no type errors)

### 2. Tools module loads and exports all 14 tools

```bash
npx tsx -e "
  import * as tools from './src/tools.ts';
  const names = Object.values(tools).map(t => t.name);
  console.log(JSON.stringify(names.sort()));
" 2>&1 | grep -v DEP0205
```

**Expected:** JSON array of exactly these names: `temporal_cloud_account`, `temporal_cloud_namespace_get`, `temporal_cloud_namespace_list`, `temporal_cloud_whoami`, `temporal_cluster_describe`, `temporal_cluster_health`, `temporal_env_list`, `temporal_namespace_describe`, `temporal_namespace_list`, `temporal_server_start_dev`, `temporal_server_status`, `temporal_status`, `temporal_task_queue_describe`, `temporal_workflow_count`

### 3. Each tool has required fields and the temporalctl namespace

```bash
npx tsx -e "
  import * as tools from './src/tools.ts';
  for (const tool of Object.values(tools)) {
    const missing = [];
    if (tool.namespace !== 'temporalctl') missing.push('namespace!=temporalctl');
    if (!tool.access) missing.push('access');
    if (!tool.name) missing.push('name');
    if (!tool.description) missing.push('description');
    if (!tool.handler) missing.push('handler');
    if (missing.length) {
      console.log('FAIL: ' + tool.name + ' — ' + missing.join(', '));
      process.exit(1);
    }
  }
  console.log('OK — all ' + Object.keys(tools).length + ' tools valid');
" 2>&1 | grep -v DEP0205
```

**Expected:** `OK — all 14 tools valid`

### 4. Status tool handler executes (real defineTool code path)

```bash
npx tsx -e "
  import { temporalStatus } from './src/tools.ts';
  temporalStatus.handler({}).then(r => {
    console.log(JSON.stringify(r));
    if (typeof r.installed !== 'boolean') process.exit(1);
  });
" 2>&1 | grep -v DEP0205
```

**Expected:** JSON with `installed` boolean; when the temporal CLI is present also `version` (a version string) and `cloudAuth`

### 5. Exec helper throws TemporalCliError on failure

```bash
npx tsx -e "
  import { runTemporalCli } from './src/exec.ts';
  (async () => {
    try {
      await runTemporalCli(['nonexistent-subcommand']);
      console.log('FAIL: should have thrown');
      process.exit(1);
    } catch (e) {
      console.log('OK — threw: ' + e.constructor.name);
    }
  })();
" 2>&1 | grep -v DEP0205
```

**Expected:** `OK — threw: TemporalCliError`

### 6. Manifest declares all required sections

```bash
grep -q 'manifestVersion: 1' bag.yaml && grep -q 'name: temporal' bag.yaml && grep -q 'mcp-servers:' bag.yaml && grep -q 'entry: tools.ts' bag.yaml && grep -q 'traits:' bag.yaml && grep -q 'dependencies:' bag.yaml && grep -q 'auth:' bag.yaml && echo "OK"
```

**Expected:** `OK` — manifest includes auth bag (CLI-delegated OAuth via `temporal cloud login`)

### 7. Agent skills are linked

```bash
test -f skills/temporal/temporal-developer/SKILL.md && echo "temporal-developer OK"
test -f skills/temporal/temporal-design/SKILL.md && echo "temporal-design OK"
```

**Expected:** `temporal-developer OK` and `temporal-design OK`

### 8. Setup --status reports linked skills

```bash
./setup.sh --status 2>&1 | grep -c symlink
```

**Expected:** `2`

## Online Checks

Steps below need an external binary. If the binary is missing (`command -v <bin>` fails), mark the step SKIPPED, not FAILED.

### 9. Temporal CLI reports version

```bash
temporal --version
```

**Expected:** Output contains `temporal version` (skip if `temporal` not installed)

### 10. MCP server speaks MCP over stdio

Spawns the bag's MCP server exactly as barry would and performs a JSON-RPC initialize handshake. Skip if `uvx` is not installed. First run may take up to 60s while uvx resolves the package.

```bash
node -e '
const { spawn } = require("child_process");
const p = spawn("uvx", ["temporal-mcp-server"], { stdio: ["pipe", "pipe", "ignore"] });
const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "qa", version: "1.0" } } }) + "\n";
let buf = "";
p.stdout.on("data", (d) => {
  buf += d.toString();
  if (buf.includes("\"result\"")) { console.log("OK — MCP initialize succeeded"); p.kill(); process.exit(0); }
});
p.on("error", (e) => { console.log("FAIL — spawn: " + e.message); process.exit(1); });
p.stdin.write(req);
setTimeout(() => { console.log("FAIL — no initialize response"); p.kill(); process.exit(1); }, 60000);
'
```

**Expected:** `OK — MCP initialize succeeded`

### 11. Barry loads the bag (real loader path)

```bash
barry bag show temporal 2>/dev/null
```

**Expected:** Output includes `Bag: temporal`, its three traits (`temporal`, `temporal-query`, `temporal-infra` — declaring custom traits suppresses the auto `-read` variant), `MCP servers: temporal`, and a `Dependencies:` section with ✓ for `temporal` and `uvx` (skip if `barry` CLI unavailable)

## Cleanup

No cleanup needed — the handshake step kills its spawned server.

## Success Criteria

- [ ] TypeScript compiles with no errors
- [ ] All 14 tools export with the expected names
- [ ] Every tool has namespace temporalctl, access, name, description, and handler
- [ ] The real temporal_status handler executes and returns structured JSON
- [ ] Exec helper throws TemporalCliError on a failed command
- [ ] Manifest declares MCP server, tools entry, traits, dependencies, and auth
- [ ] Both official Temporal skills are symlinked
- [ ] setup.sh --status reports 2 symlinks
- [ ] MCP server completes a stdio initialize handshake (or SKIPPED without uvx)
- [ ] barry bag show loads the bag with dependencies satisfied (or SKIPPED without barry)
