import { defineTool } from "@barry/tools";
import { z } from "zod";
import { execFile, spawn } from "node:child_process";
import { runTemporalCli, isTemporalCliInstalled } from "./exec.js";

// ── Status ──────────────────────────────────────────────────────────────────

export const temporalStatus = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_status",
  description:
    "Check whether the temporal CLI is installed, its version, and cloud auth status.",
  schema: {},
  handler: async () => {
    const installed = await isTemporalCliInstalled();
    if (!installed) {
      return {
        installed: false,
        installCommand: "brew install temporal",
      };
    }

    const version = await runTemporalCli(["--version"]).catch(() => "unknown");

    let cloudAuth = "unknown";
    try {
      const whoami = await runTemporalCli(["cloud", "whoami", "-o", "json"]);
      const parsed = JSON.parse(whoami);
      // whoami returns { user: { id, spec: { email } } } or { serviceAccount: ... }
      cloudAuth = parsed.user?.id || parsed.serviceAccount?.id ? "authenticated" : "not authenticated";
    } catch {
      cloudAuth = "not authenticated";
    }

    return { installed: true, version, cloudAuth };
  },
});

// ── Dev Server Management ──────────────────────────────────────────────────

export const temporalServerStartDev = defineTool({
  namespace: "temporalctl",
  access: "write",
  name: "temporal_server_start_dev",
  description:
    "Start a local Temporal development server. Spawns detached and returns once the server is accepting connections. Use temporal_server_status to check if one is already running.",
  schema: {
    port: z.number().optional().describe("gRPC port (default: 7233)"),
    httpPort: z.number().optional().describe("HTTP port (default: 8233)"),
    uiPort: z.number().optional().describe("Web UI port (default: 8233)"),
    dbFilename: z.string().optional().describe("SQLite file for persistence across restarts"),
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional().describe("Log level (default: warn)"),
    namespace: z.string().optional().describe("Default namespace (default: default)"),
  },
  handler: async ({ port, httpPort, uiPort, dbFilename, logLevel, namespace }) => {
    const args = ["server", "start-dev"];
    if (port) args.push("--port", String(port));
    if (httpPort) args.push("--http-port", String(httpPort));
    if (uiPort) args.push("--ui-port", String(uiPort));
    if (dbFilename) args.push("--db-filename", dbFilename);
    if (logLevel) args.push("--log-level", logLevel);
    if (namespace) args.push("--namespace", namespace);

    // Spawn detached so the server outlives this process
    const child = spawn("temporal", args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Wait briefly for the server to start accepting connections
    const grpcPort = port ?? 7233;
    const maxWait = 10_000;
    const start = Date.now();
    let ready = false;

    while (Date.now() - start < maxWait) {
      try {
        await runTemporalCli(
          ["operator", "cluster", "health", "--address", `localhost:${grpcPort}`],
          { timeoutMs: 2_000 },
        );
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return {
      started: ready,
      pid: child.pid,
      grpcPort,
      httpPort: httpPort ?? 8233,
      uiPort: uiPort ?? 8233,
      message: ready
        ? `Dev server running on localhost:${grpcPort} (pid ${child.pid})`
        : "Server spawned but health check timed out — it may still be starting",
    };
  },
});

export const temporalServerStatus = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_server_status",
  description:
    "Check if a local Temporal dev server is running and healthy.",
  schema: {
    address: z.string().optional().describe("Server address to check (default: localhost:7233)"),
  },
  handler: async ({ address }) => {
    const addr = address ?? "localhost:7233";
    try {
      const output = await runTemporalCli(
        ["operator", "cluster", "health", "--address", addr],
        { timeoutMs: 5_000 },
      );
      return { running: true, address: addr, health: output };
    } catch (err) {
      return {
        running: false,
        address: addr,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// ── Task Queue ─────────────────────────────────────────────────────────────

export const temporalTaskQueueDescribe = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_task_queue_describe",
  description:
    "Describe a task queue — show active pollers, worker info, and backlog. Returns JSON with poller details and task queue status.",
  schema: {
    taskQueue: z.string().describe("Name of the task queue"),
    namespace: z.string().optional().describe("Temporal namespace (default: from TEMPORAL_NAMESPACE env)"),
    address: z.string().optional().describe("Server address (default: from TEMPORAL_ADDRESS env)"),
  },
  handler: async ({ taskQueue, namespace, address }) => {
    const args = ["task-queue", "describe", "--task-queue", taskQueue, "-o", "json"];
    if (namespace) args.push("--namespace", namespace);
    if (address) args.push("--address", address);
    const output = await runTemporalCli(args);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

// ── Namespace Operations (self-hosted) ─────────────────────────────────────

export const temporalNamespaceList = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_namespace_list",
  description:
    "List all namespaces in the Temporal cluster.",
  schema: {
    address: z.string().optional().describe("Server address (default: from TEMPORAL_ADDRESS env)"),
  },
  handler: async ({ address }) => {
    const args = ["operator", "namespace", "list", "-o", "json"];
    if (address) args.push("--address", address);
    const output = await runTemporalCli(args);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

export const temporalNamespaceDescribe = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_namespace_describe",
  description:
    "Describe a specific namespace — config, retention period, replication status.",
  schema: {
    namespace: z.string().describe("Namespace name"),
    address: z.string().optional().describe("Server address (default: from TEMPORAL_ADDRESS env)"),
  },
  handler: async ({ namespace: ns, address }) => {
    const args = ["operator", "namespace", "describe", "--namespace", ns, "-o", "json"];
    if (address) args.push("--address", address);
    const output = await runTemporalCli(args);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

// ── Cluster ────────────────────────────────────────────────────────────────

export const temporalClusterHealth = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_cluster_health",
  description:
    "Check Temporal cluster health status.",
  schema: {
    address: z.string().optional().describe("Server address (default: from TEMPORAL_ADDRESS env)"),
  },
  handler: async ({ address }) => {
    const args = ["operator", "cluster", "health"];
    if (address) args.push("--address", address);
    const output = await runTemporalCli(args);
    return { health: output };
  },
});

export const temporalClusterDescribe = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_cluster_describe",
  description:
    "Describe the Temporal cluster — server version, cluster ID, persistence info.",
  schema: {
    address: z.string().optional().describe("Server address (default: from TEMPORAL_ADDRESS env)"),
  },
  handler: async ({ address }) => {
    const args = ["operator", "cluster", "describe", "-o", "json"];
    if (address) args.push("--address", address);
    const output = await runTemporalCli(args);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

// ── Workflow ───────────────────────────────────────────────────────────────

export const temporalWorkflowCount = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_workflow_count",
  description:
    "Count workflow executions matching a visibility query.",
  schema: {
    query: z.string().optional().describe("Visibility query (e.g. 'ExecutionStatus=\"Running\"')"),
    namespace: z.string().optional().describe("Temporal namespace"),
    address: z.string().optional().describe("Server address"),
  },
  handler: async ({ query, namespace, address }) => {
    const args = ["workflow", "count", "-o", "json"];
    if (query) args.push("--query", query);
    if (namespace) args.push("--namespace", namespace);
    if (address) args.push("--address", address);
    const output = await runTemporalCli(args);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

// ── Environment ────────────────────────────────────────────────────────────

export const temporalEnvList = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_env_list",
  description:
    "List configured temporal CLI environments (named connection profiles).",
  schema: {},
  handler: async () => {
    const output = await runTemporalCli(["env", "list"]);
    return { output };
  },
});

// ── Temporal Cloud ─────────────────────────────────────────────────────────

export const temporalCloudWhoami = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_cloud_whoami",
  description:
    "Display the current authenticated Temporal Cloud identity — user or service account, associated API key.",
  schema: {},
  handler: async () => {
    const output = await runTemporalCli(["cloud", "whoami", "-o", "json"]);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

export const temporalCloudNamespaceList = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_cloud_namespace_list",
  description:
    "List all Temporal Cloud namespaces in your account.",
  schema: {},
  handler: async () => {
    const output = await runTemporalCli(["cloud", "namespace", "list", "-o", "json"]);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

export const temporalCloudNamespaceGet = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_cloud_namespace_get",
  description:
    "Get detailed information about a specific Temporal Cloud namespace.",
  schema: {
    namespace: z.string().describe("Cloud namespace name (e.g. my-namespace.my-account)"),
  },
  handler: async ({ namespace: ns }) => {
    const output = await runTemporalCli(["cloud", "namespace", "get", "--namespace", ns, "-o", "json"]);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});

export const temporalCloudAccount = defineTool({
  namespace: "temporalctl",
  access: "read",
  name: "temporal_cloud_account",
  description:
    "Get Temporal Cloud account information.",
  schema: {},
  handler: async () => {
    const output = await runTemporalCli(["cloud", "account", "get", "-o", "json"]);
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  },
});
