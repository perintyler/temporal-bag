import { execFile } from "node:child_process";

// No TS parameter properties here — the MCP server imports pack tools under
// Node's strip-only type stripping, which can't transform that syntax.
export class TemporalCliError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(message: string, exitCode: number | null, stderr: string) {
    super(message);
    this.name = "TemporalCliError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Run a temporal CLI command and return its stdout.
 *
 * Throws TemporalCliError if the binary isn't found or the command fails.
 */
export function runTemporalCli(
  args: string[],
  options?: { timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 30_000;

  return new Promise((resolve, reject) => {
    const child = execFile("temporal", args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new TemporalCliError(
              "temporal CLI is not installed. Install it: brew install temporal",
              null,
              "",
            ),
          );
          return;
        }
        reject(
          new TemporalCliError(
            `temporal ${args.join(" ")} failed: ${stderr || error.message}`,
            error.code ? parseInt(String(error.code), 10) : null,
            stderr,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });

    child.on("error", (err) => {
      reject(new TemporalCliError(`Failed to spawn temporal: ${err.message}`, null, ""));
    });
  });
}

/**
 * Check whether the temporal CLI is installed and reachable on PATH.
 */
export async function isTemporalCliInstalled(): Promise<boolean> {
  try {
    await runTemporalCli(["--version"], { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}
