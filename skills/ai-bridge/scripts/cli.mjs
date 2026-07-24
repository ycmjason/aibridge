// generated — do not edit; rebuild with pnpm build:skill
import { parseArgs } from "node:util";
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

//#region packages/ai-bridge/src/models.ts
const MODELS = {
	"xai-grok/grok-4.5": {
		slug: "xai-grok/grok-4.5",
		backend: "grok",
		backendModel: "grok-4.5",
		efforts: [
			"low",
			"medium",
			"high"
		],
		brief: "xAI Grok 4.5 via grok CLI — default for plan & review; off-budget"
	},
	"google-antigravity/gemini-3.6-flash": {
		slug: "google-antigravity/gemini-3.6-flash",
		backend: "agy",
		backendModel: "gemini-3.6-flash",
		efforts: [
			"low",
			"medium",
			"high"
		],
		defaultEffort: "high",
		brief: "Google Gemini 3.6 Flash via agy — default for implement; off-budget"
	},
	"google-antigravity/claude-sonnet-4-6": {
		slug: "google-antigravity/claude-sonnet-4-6",
		backend: "agy",
		backendModel: "claude-sonnet-4-6",
		efforts: null,
		brief: "Claude Sonnet 4.6 (thinking) via agy — off-budget"
	},
	"google-antigravity/claude-opus-4-6-thinking": {
		slug: "google-antigravity/claude-opus-4-6-thinking",
		backend: "agy",
		backendModel: "claude-opus-4-6-thinking",
		efforts: null,
		brief: "Claude Opus 4.6 (thinking) via agy — off-budget heavyweight"
	},
	"google-antigravity/gpt-oss-120b-medium": {
		slug: "google-antigravity/gpt-oss-120b-medium",
		backend: "agy",
		backendModel: "gpt-oss-120b-medium",
		efforts: null,
		brief: "GPT-OSS 120B (medium) via agy — off-budget"
	},
	"openai-codex/gpt-5.6-sol": {
		slug: "openai-codex/gpt-5.6-sol",
		backend: "codex",
		backendModel: "gpt-5.6-sol",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh"
		],
		brief: "OpenAI Codex gpt-5.6-sol via codex CLI"
	},
	"anthropic-claude/sonnet": {
		slug: "anthropic-claude/sonnet",
		backend: "claude",
		backendModel: "sonnet",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		brief: "Claude Sonnet via claude CLI — bills your Claude subscription"
	},
	"anthropic-claude/opus": {
		slug: "anthropic-claude/opus",
		backend: "claude",
		backendModel: "opus",
		efforts: [
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		],
		defaultEffort: "high",
		brief: "Claude Opus via claude CLI (default effort: high) — bills subscription"
	}
};
const DEFAULT_MODEL = "xai-grok/grok-4.5";
const DEFAULT_IMPLEMENTER = "google-antigravity/gemini-3.6-flash";
const DEFAULT_IMAGE_GEN = "openai-codex/gpt-5.6-sol";
const IMAGE_GEN_BACKENDS = /* @__PURE__ */ new Set(["codex", "grok"]);
function supportsImageGen(resolved) {
	return IMAGE_GEN_BACKENDS.has(resolved.spec.backend);
}
const EFFORTS_SET = /* @__PURE__ */ new Set([
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
]);
function resolveModel(input) {
	if (MODELS[input]) {
		const spec = MODELS[input];
		return {
			spec,
			effort: spec.defaultEffort
		};
	}
	const lastDashIdx = input.lastIndexOf("-");
	if (lastDashIdx > 0) {
		const prefix = input.slice(0, lastDashIdx);
		const token = input.slice(lastDashIdx + 1);
		const spec = MODELS[prefix];
		if (spec && EFFORTS_SET.has(token) && spec.efforts && spec.efforts.includes(token)) return {
			spec,
			effort: token
		};
	}
}
function backendModelId(resolved) {
	if (!resolved.spec.backendModel) return;
	if (resolved.spec.backend === "agy") {
		const effort = resolved.effort ?? resolved.spec.defaultEffort;
		if (effort) return `${resolved.spec.backendModel}-${effort}`;
	}
	return resolved.spec.backendModel;
}
function listModelHelpLines(opts = {}) {
	const lines = [];
	for (const [slug, spec] of Object.entries(MODELS)) {
		if (opts.imageOnly && !IMAGE_GEN_BACKENDS.has(spec.backend)) continue;
		lines.push(`  ${slug}`);
		lines.push(`    ${spec.brief}`);
	}
	return lines;
}
function formatUnknownModelError(input) {
	return [
		`Unknown model "${input}".`,
		"Available models:",
		...listModelHelpLines()
	].join("\n");
}
function formatImageGenModelError(input, resolved) {
	return [
		`Model "${input}" (${resolved.spec.slug}) cannot generate images — backend "${resolved.spec.backend}" has no image path.`,
		"Image-gen seats (canonical slug):",
		...listModelHelpLines({ imageOnly: true })
	].join("\n");
}

//#endregion
//#region packages/ai-bridge/src/parsers.ts
/**
* stricli `parse` functions (string -> T). Throwing inside one makes stricli
* reject the argument up-front with a clean, flag-named error — instead of
* silently letting a bad value (NaN, Infinity, "") flow into an impl where it
* gets masked or, worse, breaks `setTimeout`.
*/
function positiveIntSeconds(input) {
	const n = Number(input);
	if (!Number.isInteger(n) || n <= 0) throw new RangeError(`expected a positive whole number of seconds, got "${input}"`);
	if (n > 86400) throw new RangeError(`timeout too large: ${n}s (max 86400 = 24h)`);
	return n;
}
function nonEmptyPrompt(input) {
	if (input.trim().length === 0) throw new Error("prompt must not be empty");
	return input;
}

//#endregion
//#region packages/proc/src/proc.ts
/**
* Spawn a command, capture stdout/stderr as UTF-8 strings, and resolve when it
* exits. Rejects only if the process cannot be spawned at all (e.g. ENOENT) —
* a non-zero exit resolves normally with the captured streams.
*/
function runCaptured(command, args, opts = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			cwd: opts.cwd,
			env: opts.env,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		if (child.pid !== void 0) opts.onSpawn?.(child.pid);
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (d) => {
			stdout += d;
			opts.onStdout?.(d);
		});
		child.stderr.on("data", (d) => {
			stderr += d;
			opts.onStderr?.(d);
		});
		let timer;
		let hardKillTimer;
		if (opts.timeoutMs && opts.timeoutMs > 0) {
			const ms = Math.min(opts.timeoutMs, 2147483647);
			timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
				hardKillTimer = setTimeout(() => child.kill("SIGKILL"), 3e3);
				hardKillTimer.unref();
			}, ms);
			timer.unref();
		}
		const clearTimers = () => {
			if (timer) clearTimeout(timer);
			if (hardKillTimer) clearTimeout(hardKillTimer);
		};
		child.on("error", (err) => {
			clearTimers();
			reject(err);
		});
		child.on("close", (code, signal) => {
			clearTimers();
			resolve({
				code,
				signal,
				stdout,
				stderr,
				timedOut
			});
		});
	});
}
/** True if the spawn error means the binary was not found on PATH. */
function isNotFound(err) {
	return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}
/**
* Probe a binary's `--version`. Returns the raw first line of stdout (trimmed),
* or null if the binary is missing / does not respond in time.
*/
async function probeVersion(command, runner = runCaptured) {
	try {
		const r = await runner(command, ["--version"], { timeoutMs: 1e4 });
		if (r.timedOut) return null;
		const line = (r.stdout || r.stderr).split("\n")[0]?.trim();
		return line && line.length > 0 ? line : null;
	} catch (err) {
		if (isNotFound(err)) return null;
		throw err;
	}
}
/** Extract the first `major.minor.patch` triple from a version string. */
function parseSemver(s) {
	const m = s.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!m) return null;
	return [
		Number(m[1]),
		Number(m[2]),
		Number(m[3])
	];
}
/** True if version `a` is >= version `b` (both as [major, minor, patch]). */
function semverGte(a, b) {
	for (let i = 0; i < 3; i++) {
		const av = a[i] ?? 0;
		const bv = b[i] ?? 0;
		if (av > bv) return true;
		if (av < bv) return false;
	}
	return true;
}
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
/** Strip ANSI/VT escape sequences from a string. */
function stripAnsi(s) {
	return s.replace(ANSI_RE, "");
}

//#endregion
//#region packages/agy/src/agy.ts
/**
* Assemble the `agy -p …` argv.
*/
function buildAgyPrintArgs(prompt, opts) {
	const args = [
		"-p",
		prompt,
		"--model",
		opts.model,
		"--print-timeout",
		`${opts.printTimeoutSec}s`
	];
	if (opts.skipPermissions) args.push("--dangerously-skip-permissions");
	for (const dir of opts.addDirs ?? []) args.push("--add-dir", dir);
	return args;
}

//#endregion
//#region packages/agy/src/registry.ts
const AGY_CANONICAL_TO_NATIVE = {
	"google/gemini-3-6-flash-high": "Gemini 3.6 Flash (High)",
	"google/gemini-3-6-flash-medium": "Gemini 3.6 Flash (Medium)",
	"google/gemini-3-6-flash-low": "Gemini 3.6 Flash (Low)",
	"google/gemini-3-5-flash-high": "Gemini 3.5 Flash (High)",
	"google/gemini-3-5-flash-low": "Gemini 3.5 Flash (Low)",
	"google/gemini-3-5-pro-high": "Gemini 3.5 Pro (High)"
};

//#endregion
//#region packages/agy/src/agyQuota.ts
/**
* agy quota via the Google Cloud Code API, reusing agy's OWN cached OAuth
* token — no separate login. Mechanism learned from
* github.com/skainguyen1412/antigravity-usage (reimplemented, not vendored):
*
*   1. Read `~/.gemini/antigravity-cli/antigravity-oauth-token`
*      ({ token: { access_token, refresh_token, expiry } }) — agy refreshes
*      this file itself whenever it runs. If expired, refresh in-memory via
*      Google's token endpoint with Antigravity's installed-app client
*      (public by design for installed apps); we NEVER write agy's file.
*   2. POST cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
*      (metadata ideType ANTIGRAVITY / pluginType GEMINI) → project id.
*   3. POST /v1internal:fetchAvailableModels { project } — the
*      `User-Agent: antigravity` header is MANDATORY (403 without it).
*      → models keyed by id, each with quotaInfo.remainingFraction (0..1)
*      and quotaInfo.resetTime (ISO timestamp).
*
* Model `label`s match the names agy uses (e.g. "Gemini 3.5 Flash (Low)").
*/
const CLOUDCODE_BASE = "https://cloudcode-pa.googleapis.com";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const OAUTH_CLIENT_ID = process.env.ANTIGRAVITY_OAUTH_CLIENT_ID ?? "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const OAUTH_CLIENT_SECRET = process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET ?? "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";
function parseQuotaGroups(groups) {
	return groups.map((g) => ({
		displayName: g.displayName ?? "?",
		description: g.description,
		buckets: (g.buckets ?? []).map((b) => ({
			bucketId: b.bucketId ?? "?",
			displayName: b.displayName ?? b.window ?? "?",
			window: b.window ?? "?",
			remainingFraction: typeof b.remainingFraction === "number" ? b.remainingFraction : 0,
			resetTime: typeof b.resetTime === "string" ? b.resetTime : void 0
		}))
	}));
}
function agyTokenPath() {
	return process.env.AGY_OAUTH_TOKEN_PATH ?? join(homedir(), ".gemini", "antigravity-cli", "antigravity-oauth-token");
}
async function getAccessToken() {
	const raw = readFileSync(agyTokenPath(), "utf8");
	const parsed = JSON.parse(raw);
	const access = parsed.token?.access_token;
	const refresh = parsed.token?.refresh_token;
	const expiry = parsed.token?.expiry;
	if (!access) throw new Error("agy token file has no access_token");
	if (!(expiry ? new Date(expiry).getTime() - Date.now() < 6e4 : false)) return access;
	if (!refresh) throw new Error("agy token expired and no refresh_token present");
	const res = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			refresh_token: refresh,
			client_id: OAUTH_CLIENT_ID,
			client_secret: OAUTH_CLIENT_SECRET,
			grant_type: "refresh_token"
		})
	});
	if (!res.ok) throw new Error(`agy token refresh failed: HTTP ${res.status}`);
	const data = await res.json();
	if (!data.access_token) throw new Error("agy token refresh returned no access_token");
	return data.access_token;
}
async function cloudcode(access, endpoint, body) {
	const res = await fetch(`${CLOUDCODE_BASE}/v1internal:${endpoint}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${access}`,
			"Content-Type": "application/json",
			"User-Agent": "antigravity"
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`cloudcode ${endpoint} failed: HTTP ${res.status}`);
	return res.json();
}
function isRelevantModel(modelId, m) {
	if (modelId.startsWith("chat_") || modelId.startsWith("tab_") || modelId.startsWith("rev")) return false;
	if (modelId.includes("image") || modelId.includes("mquery")) return false;
	return m.quotaInfo !== void 0;
}
function parseModels(modelsById) {
	const out = [];
	for (const [modelId, m] of Object.entries(modelsById)) {
		if (!isRelevantModel(modelId, m)) continue;
		const qi = m.quotaInfo;
		const remainingFraction = typeof qi?.remainingFraction === "number" ? qi.remainingFraction : 0;
		out.push({
			modelId,
			label: m.displayName ?? m.label ?? modelId,
			remainingFraction,
			exhausted: qi?.isExhausted ?? remainingFraction === 0,
			resetTime: typeof qi?.resetTime === "string" ? qi.resetTime : void 0
		});
	}
	out.sort((a, b) => a.label.localeCompare(b.label) || a.modelId.localeCompare(b.modelId));
	return out;
}
let cache = null;
const CACHE_TTL_MS = 6e4;
async function fetchAgyQuota() {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.snapshot;
	const access = await getAccessToken();
	const proj = (await cloudcode(access, "loadCodeAssist", { metadata: {
		ideType: "ANTIGRAVITY",
		platform: "PLATFORM_UNSPECIFIED",
		pluginType: "GEMINI"
	} })).cloudaicompanionProject;
	const projectId = typeof proj === "string" ? proj : proj?.id;
	const [modelsRes, summaryRes] = await Promise.all([cloudcode(access, "fetchAvailableModels", projectId ? { project: projectId } : {}), cloudcode(access, "retrieveUserQuotaSummary", projectId ? { project: projectId } : {}).catch(() => ({}))]);
	const snapshot = {
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
		groups: parseQuotaGroups(summaryRes.groups ?? []),
		models: parseModels(modelsRes.models ?? {})
	};
	cache = {
		at: Date.now(),
		snapshot
	};
	return snapshot;
}
function findModelQuota(snapshot, labelOrId) {
	const nativeLabel = AGY_CANONICAL_TO_NATIVE[labelOrId] ?? labelOrId;
	const matches = snapshot.models.filter((m) => m.label === labelOrId || m.modelId === labelOrId || m.label === nativeLabel || m.modelId === nativeLabel);
	if (matches.length === 0) return void 0;
	return matches.find((m) => m.exhausted) ?? matches[0];
}

//#endregion
//#region packages/agy/src/probe.ts
const INSTALL_HINT$7 = "Install the Antigravity CLI and sign in.";
async function probe$3(run = runCaptured) {
	try {
		const res = await run("agy", ["--version"], { timeoutMs: 1e4 });
		if (res.timedOut) return {
			ok: false,
			error: "ai-bridge: \"agy\" timed out probing version."
		};
		const line = (res.stdout || res.stderr).split("\n")[0]?.trim();
		if (line && line.length > 0) return {
			ok: true,
			version: line
		};
		return {
			ok: false,
			error: `ai-bridge: "agy" returned no version output. ${INSTALL_HINT$7}`
		};
	} catch (err) {
		if (isNotFound(err)) return {
			ok: false,
			error: `ai-bridge: "agy" not found on PATH. ${INSTALL_HINT$7}`
		};
		return {
			ok: false,
			error: `ai-bridge: failed to probe agy: ${err.message}`
		};
	}
}

//#endregion
//#region packages/agy/src/run.ts
const NOISE_RE$3 = /^Shell cwd was reset[^\n]*$/gm;
const INSTALL_HINT$6 = "Install the Antigravity CLI and sign in.";
function clean$3(s) {
	return stripAnsi(s).replace(NOISE_RE$3, "").trim();
}
async function run$3(task, exec = runCaptured) {
	let tempDir;
	let answerPath;
	let taskPrompt = task.prompt;
	const addDirs = [];
	if (task.tools) {
		tempDir = mkdtempSync(join(tmpdir(), "ai-bridge-agy-"));
		answerPath = join(tempDir, "answer.md");
		taskPrompt = `${task.prompt}\n\nYou are working in the repository rooted at ${task.cwd}; make ALL file edits there (any relative paths in the task are relative to that root). When the task is complete, write ONLY your final answer (the exact text you would otherwise print as your response, with no narration of your steps) to the file ${answerPath} — nothing else in that file. This is how your answer is captured; do not mention the file in the answer.`;
		addDirs.push(task.cwd, tempDir);
	}
	const modelId = task.backendModel ?? "";
	const args = buildAgyPrintArgs(taskPrompt, {
		model: modelId,
		printTimeoutSec: task.timeoutSec,
		skipPermissions: task.tools,
		addDirs: addDirs.length > 0 ? addDirs : void 0
	});
	try {
		let result;
		try {
			result = await exec("agy", args, {
				cwd: task.cwd,
				timeoutMs: (task.timeoutSec + 20) * 1e3,
				onStdout: task.onStdout,
				onStderr: task.onStderr,
				onSpawn: task.onSpawn
			});
		} catch (err) {
			if (isNotFound(err)) return {
				ok: false,
				kind: "not-found",
				message: `ai-bridge: "agy" not found on PATH. ${INSTALL_HINT$6}`,
				exitCode: null
			};
			return {
				ok: false,
				kind: "spawn",
				message: `ai-bridge: failed to run agy: ${err.message}`,
				exitCode: null
			};
		}
		if (result.timedOut) return {
			ok: false,
			kind: "timeout",
			message: `ai-bridge: agy timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
			exitCode: result.code
		};
		let response = "";
		if (answerPath && existsSync(answerPath)) {
			response = clean$3(readFileSync(answerPath, "utf8"));
			if (response.length > 0) task.onStdout?.(`\n--- final answer ---\n${response}\n`);
		}
		if (response.length === 0) response = clean$3(result.stdout);
		if (result.code !== 0 || response.length === 0) return {
			ok: false,
			kind: "no-answer",
			message: `ai-bridge: agy returned no usable answer (${clean$3(result.stderr) || `exit code ${result.code}`}).`,
			exitCode: result.code
		};
		return {
			ok: true,
			response,
			exitCode: result.code ?? 0
		};
	} finally {
		if (tempDir) rmSync(tempDir, {
			recursive: true,
			force: true
		});
	}
}

//#endregion
//#region packages/claude/src/claude.ts
async function ensureClaude(run = runCaptured) {
	const version = await probeVersion("claude", run);
	if (version === null) return {
		ok: false,
		error: "\"claude\" not found on PATH. Install Claude Code and sign in."
	};
	return {
		ok: true,
		version
	};
}
function buildClaudePrintArgs(prompt, opts) {
	const args = [
		"-p",
		prompt,
		"--model",
		opts.model
	];
	if (opts.effort) args.push("--effort", opts.effort);
	if (opts.skipPermissions) args.push("--dangerously-skip-permissions");
	for (const dir of opts.addDirs ?? []) args.push("--add-dir", dir);
	if (opts.jsonSchema) args.push("--json-schema", opts.jsonSchema);
	return args;
}

//#endregion
//#region packages/claude/src/claudeQuota.ts
const WINDOW_RE = /^Current (session|week \([^)]+\)):\s+(\d+)% used(?:\s*·\s*resets\s+(.+))?$/;
function parseClaudeUsageOutput(stdout) {
	const windows = [];
	for (const line of stdout.split("\n")) {
		const m = line.trim().match(WINDOW_RE);
		if (!m || m[1] === void 0 || m[2] === void 0) continue;
		windows.push({
			window: m[1],
			usedPercent: Number(m[2]),
			resetsText: m[3]?.trim() ?? ""
		});
	}
	return windows;
}
async function fetchClaudeQuota() {
	const result = await runCaptured("claude", ["-p", "/usage"], { timeoutMs: 9e4 });
	if (result.timedOut) throw new Error("claude -p \"/usage\" timed out");
	if (result.code !== 0) throw new Error(`claude -p "/usage" exited ${result.code}`);
	const windows = parseClaudeUsageOutput(result.stdout);
	if (windows.length === 0) throw new Error("could not parse any usage windows from claude /usage output (format change?)");
	return {
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
		windows
	};
}

//#endregion
//#region packages/claude/src/probe.ts
const INSTALL_HINT$5 = "Install Claude Code and sign in.";
async function probe$2(_run = runCaptured) {
	try {
		const check = await ensureClaude();
		if (check.ok) return {
			ok: true,
			version: check.version
		};
		return {
			ok: false,
			error: `ai-bridge: ${check.error}`
		};
	} catch (err) {
		if (isNotFound(err)) return {
			ok: false,
			error: `ai-bridge: "claude" not found on PATH. ${INSTALL_HINT$5}`
		};
		return {
			ok: false,
			error: `ai-bridge: failed to probe claude: ${err.message}`
		};
	}
}

//#endregion
//#region packages/claude/src/run.ts
const NOISE_RE$2 = /^Shell cwd was reset[^\n]*$/gm;
const INSTALL_HINT$4 = "Install Claude Code and sign in.";
function clean$2(s) {
	return stripAnsi(s).replace(NOISE_RE$2, "").trim();
}
async function run$2(task, exec = runCaptured) {
	const modelId = task.backendModel ?? "sonnet";
	const args = buildClaudePrintArgs(task.prompt, {
		model: modelId,
		effort: task.effort,
		skipPermissions: task.tools
	});
	try {
		let result;
		try {
			result = await exec("claude", args, {
				cwd: task.cwd,
				timeoutMs: (task.timeoutSec + 20) * 1e3,
				onStdout: task.onStdout,
				onStderr: task.onStderr,
				onSpawn: task.onSpawn
			});
		} catch (err) {
			if (isNotFound(err)) return {
				ok: false,
				kind: "not-found",
				message: `ai-bridge: "claude" not found on PATH. ${INSTALL_HINT$4}`,
				exitCode: null
			};
			return {
				ok: false,
				kind: "spawn",
				message: `ai-bridge: failed to run claude: ${err.message}`,
				exitCode: null
			};
		}
		if (result.timedOut) return {
			ok: false,
			kind: "timeout",
			message: `ai-bridge: claude timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
			exitCode: result.code
		};
		const response = clean$2(result.stdout);
		if (result.code !== 0 || response.length === 0) return {
			ok: false,
			kind: "no-answer",
			message: `ai-bridge: claude returned no usable answer (${clean$2(result.stderr) || `exit code ${result.code}`}).`,
			exitCode: result.code
		};
		return {
			ok: true,
			response,
			exitCode: result.code ?? 0
		};
	} catch (err) {
		return {
			ok: false,
			kind: "spawn",
			message: `ai-bridge: error executing claude: ${err.message}`,
			exitCode: null
		};
	}
}

//#endregion
//#region packages/codex/src/codex.ts
/**
* Shared driver for the Codex CLI (`codex exec`), used by `image-gen` (gpt-image-2 renders)
* and `delegate.ts` / the model registry (`lib/models.ts`).
*/
const MIN_CODEX_IMAGE = [
	0,
	135,
	0
];
const MIN_CODEX_STRUCTURED = [
	0,
	142,
	0
];
async function ensureCodex(min, run = runCaptured) {
	const version = await probeVersion("codex", run);
	if (version === null) return {
		ok: false,
		error: "\"codex\" not found on PATH. Install the Codex CLI and sign in to ChatGPT."
	};
	const sem = parseSemver(version);
	if (!sem || !semverGte(sem, min)) return {
		ok: false,
		error: `codex ${version} is too old; need >= ${min.join(".")}.`
	};
	return {
		ok: true,
		version
	};
}
function buildCodexExecArgs(prompt, opts) {
	const args = ["exec"];
	if (opts.approval === "bypass") args.push("--dangerously-bypass-approvals-and-sandbox");
	else if (opts.approval === "read-only") args.push("-s", "read-only");
	else args.push("--full-auto");
	args.push("--skip-git-repo-check", "-C", opts.cwd);
	if (opts.model) args.push("-m", opts.model);
	for (const c of opts.config ?? []) args.push("-c", c);
	if (opts.outputSchema) args.push("--output-schema", opts.outputSchema);
	if (opts.outputLastMessage) args.push("--output-last-message", opts.outputLastMessage);
	for (const img of opts.images ?? []) args.push(`--image=${img}`);
	args.push(prompt);
	return args;
}

//#endregion
//#region packages/codex/src/codexQuota.ts
const USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
function codexAuthPath() {
	return process.env.CODEX_AUTH_PATH ?? join(homedir(), ".codex", "auth.json");
}
function windowName(limitWindowSeconds) {
	if (limitWindowSeconds === void 0) return "?";
	const hours = limitWindowSeconds / 3600;
	if (hours <= 24) return `${Math.round(hours)}h`;
	return `${Math.round(hours / 24)}d`;
}
function parseWindow(name, w) {
	if (!w) return null;
	return {
		window: name ?? windowName(w.limit_window_seconds),
		usedPercent: typeof w.used_percent === "number" ? w.used_percent : 0,
		resetAt: typeof w.reset_at === "number" ? (/* @__PURE__ */ new Date(w.reset_at * 1e3)).toISOString() : void 0
	};
}
function parseCodexUsage(data) {
	const windows = [];
	const primary = parseWindow(void 0, data.rate_limit?.primary_window);
	if (primary) windows.push(primary);
	const secondary = parseWindow(void 0, data.rate_limit?.secondary_window);
	if (secondary) windows.push(secondary);
	return {
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
		planType: data.plan_type,
		limitReached: data.rate_limit?.limit_reached ?? false,
		windows
	};
}
async function fetchCodexQuota() {
	const raw = readFileSync(codexAuthPath(), "utf8");
	const auth = JSON.parse(raw);
	const access = auth.tokens?.access_token;
	if (!access) throw new Error("codex auth.json has no tokens.access_token");
	const headers = {
		Authorization: `Bearer ${access}`,
		"User-Agent": "codex-cli"
	};
	if (auth.tokens?.account_id) headers["ChatGPT-Account-Id"] = auth.tokens.account_id;
	const res = await fetch(USAGE_ENDPOINT, { headers });
	if (res.status === 401) throw new Error("codex token expired (401) — run any codex command once to refresh it");
	if (!res.ok) throw new Error(`codex usage endpoint failed: HTTP ${res.status}`);
	return parseCodexUsage(await res.json());
}

//#endregion
//#region packages/codex/src/generateImage.ts
const OUT_NAME = "out.png";
async function generateImage$1(req, exec = runCaptured) {
	const codex = await ensureCodex(MIN_CODEX_IMAGE, exec);
	if (!codex.ok) return {
		kind: "error",
		reason: `${codex.error} (need the image_gen tool; a stale codex silently hangs on $imagegen.)`
	};
	const sizeClause = req.size ? ` The image must be exactly ${req.size.w}x${req.size.h} pixels.` : "";
	const refClause = req.imagePaths.length ? "Use the attached image(s) as the visual reference for the subject/identity, changing only what the instruction asks. " : "";
	const guard = req.forceful ? "CRITICAL: a previous attempt produced a code-drawn substitute. You MUST call the image_gen tool (gpt-image-2) and save its raw binary output unchanged. Do NOT draw the image with any library (no PIL/Pillow/ImageMagick/matplotlib/cairo) under any circumstances." : `Save the image-generation tool output DIRECTLY as ${OUT_NAME} in the current directory. Do NOT redraw, trace, or reproduce it with code (no PIL/Pillow/ImageMagick/matplotlib) — write the raw image_gen result as-is, even if imperfect.`;
	const prompt = `$imagegen ${refClause}${req.prompt}. Render at ${req.quality.toUpperCase()} quality.${sizeClause} ${guard}`;
	const before = cacheRenderPaths();
	let result;
	try {
		result = await exec("codex", buildCodexExecArgs(prompt, {
			cwd: req.workDir,
			approval: "full-auto",
			images: req.imagePaths,
			timeoutMs: req.timeoutSec * 1e3
		}), {
			cwd: req.workDir,
			timeoutMs: req.timeoutSec * 1e3
		});
	} catch (err) {
		if (isNotFound(err)) return {
			kind: "error",
			reason: "\"codex\" not found on PATH."
		};
		throw err;
	}
	if (result.timedOut) return {
		kind: "error",
		reason: `codex render timed out after ~${req.timeoutSec}s; raise --timeout.`
	};
	const direct = join(req.workDir, OUT_NAME);
	if (existsSync(direct)) {
		const bytes = safeSize$1(direct);
		if (bytes >= req.minBytes) return {
			kind: "ok",
			path: direct,
			bytes
		};
	}
	const fresh = [...cacheRenderPaths()].filter((p) => !before.has(p)).map((path) => ({
		path,
		bytes: safeSize$1(path)
	})).filter((r) => r.bytes >= req.minBytes).sort((a, b) => mtime$1(b.path) - mtime$1(a.path));
	if (fresh.length > 1) process.stderr.write(`ai-bridge image-gen: ${fresh.length} new cached renders appeared; using the most recent.\n`);
	if (fresh[0]) return {
		kind: "ok",
		path: fresh[0].path,
		bytes: fresh[0].bytes
	};
	if (result.code !== 0) {
		const tail = stripAnsi(result.stderr).trim().split("\n").slice(-3).join(" ").slice(0, 300);
		return {
			kind: "error",
			reason: `codex exited ${result.code}${tail ? `: ${tail}` : ""}.`
		};
	}
	return { kind: "suspect" };
}
function cacheRenderPaths() {
	const base = join(homedir(), ".codex", "generated_images");
	const paths = /* @__PURE__ */ new Set();
	if (!existsSync(base)) return paths;
	for (const sub of safeReaddir$1(base)) for (const f of safeReaddir$1(join(base, sub))) if (/^ig_.*\.png$/i.test(f)) paths.add(join(base, sub, f));
	return paths;
}
function safeReaddir$1(dir) {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}
function safeSize$1(path) {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}
function mtime$1(path) {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return 0;
	}
}

//#endregion
//#region packages/codex/src/probe.ts
const INSTALL_HINT$3 = "Install the Codex CLI and sign in to ChatGPT.";
async function probe$1(run = runCaptured) {
	try {
		const check = await ensureCodex(MIN_CODEX_STRUCTURED, run);
		if (check.ok) return {
			ok: true,
			version: check.version
		};
		return {
			ok: false,
			error: `ai-bridge: ${check.error}`
		};
	} catch (err) {
		if (isNotFound(err)) return {
			ok: false,
			error: `ai-bridge: "codex" not found on PATH. ${INSTALL_HINT$3}`
		};
		return {
			ok: false,
			error: `ai-bridge: failed to probe codex: ${err.message}`
		};
	}
}

//#endregion
//#region packages/codex/src/run.ts
const NOISE_RE$1 = /^Shell cwd was reset[^\n]*$/gm;
const INSTALL_HINT$2 = "Install the Codex CLI and sign in to ChatGPT.";
function clean$1(s) {
	return stripAnsi(s).replace(NOISE_RE$1, "").trim();
}
async function run$1(task, exec = runCaptured) {
	if (!(await ensureCodex(MIN_CODEX_STRUCTURED, exec)).ok) return {
		ok: false,
		kind: "not-found",
		message: `ai-bridge: "codex" not found on PATH or wrong version. ${INSTALL_HINT$2}`,
		exitCode: null
	};
	const tempDir = mkdtempSync(join(tmpdir(), "ai-bridge-codex-"));
	const answerPath = join(tempDir, "last_message.md");
	try {
		const config = [];
		if (task.effort) config.push(`model_reasoning_effort=${task.effort}`);
		const args = buildCodexExecArgs(task.prompt, {
			cwd: task.cwd,
			approval: task.tools ? "bypass" : "read-only",
			model: task.backendModel,
			config: config.length > 0 ? config : void 0,
			outputLastMessage: answerPath,
			timeoutMs: (task.timeoutSec + 20) * 1e3
		});
		let result;
		try {
			result = await exec("codex", args, {
				cwd: task.cwd,
				timeoutMs: (task.timeoutSec + 20) * 1e3,
				onStdout: task.onStdout,
				onStderr: task.onStderr,
				onSpawn: task.onSpawn
			});
		} catch (err) {
			if (isNotFound(err)) return {
				ok: false,
				kind: "not-found",
				message: `ai-bridge: "codex" not found on PATH. ${INSTALL_HINT$2}`,
				exitCode: null
			};
			return {
				ok: false,
				kind: "spawn",
				message: `ai-bridge: failed to run codex: ${err.message}`,
				exitCode: null
			};
		}
		if (result.timedOut) return {
			ok: false,
			kind: "timeout",
			message: `ai-bridge: codex timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
			exitCode: result.code
		};
		let response = "";
		if (existsSync(answerPath)) {
			response = clean$1(readFileSync(answerPath, "utf8"));
			if (response.length > 0) task.onStdout?.(`\n--- final answer ---\n${response}\n`);
		}
		if (response.length === 0) response = clean$1(result.stdout);
		if (result.code !== 0 || response.length === 0) return {
			ok: false,
			kind: "no-answer",
			message: `ai-bridge: codex returned no usable answer (${clean$1(result.stderr) || `exit code ${result.code}`}).`,
			exitCode: result.code
		};
		return {
			ok: true,
			response,
			exitCode: result.code ?? 0
		};
	} finally {
		rmSync(tempDir, {
			recursive: true,
			force: true
		});
	}
}

//#endregion
//#region packages/grok/src/grok.ts
const NOT_AUTHENTICATED_RE = /not authenticated/i;
async function probeGrokAuth(run = runCaptured, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
	const probe = async () => {
		const res = await run("grok", ["models"], { timeoutMs: 1e4 });
		return !NOT_AUTHENTICATED_RE.test(res.stdout + res.stderr);
	};
	if (await probe()) return true;
	await sleep(2e3);
	return probe();
}
async function ensureGrok(run = runCaptured) {
	const version = await probeVersion("grok", run);
	if (version === null) return {
		ok: false,
		error: "\"grok\" not found on PATH. Install the Grok CLI (npm i -g @xai-official/grok)."
	};
	if (!await probeGrokAuth(run)) return {
		ok: false,
		error: "grok is not signed in. Run `grok login`."
	};
	return {
		ok: true,
		version
	};
}
function buildGrokPrintArgs(prompt, opts = {}) {
	const args = ["-p", prompt];
	if (opts.model) args.push("--model", opts.model);
	if (opts.effort) args.push("--reasoning-effort", opts.effort);
	if (opts.skipPermissions) args.push("--permission-mode", "bypassPermissions");
	if (opts.jsonSchema) args.push("--json-schema", opts.jsonSchema);
	if (opts.tools) args.push("--tools", opts.tools);
	if (opts.maxTurns !== void 0) args.push("--max-turns", String(opts.maxTurns));
	return args;
}

//#endregion
//#region packages/grok/src/generateImage.ts
async function generateImage(req, exec = runCaptured) {
	const grok = await ensureGrok(exec);
	if (!grok.ok) return {
		kind: "error",
		reason: grok.error
	};
	const aspect = req.size ? aspectRatioFor(req.size.w, req.size.h) : void 0;
	const aspectClause = aspect ? ` aspect_ratio='${aspect}'.` : "";
	const sizeNote = req.size ? ` Prefer a composition that fits ~${req.size.w}x${req.size.h} (exact pixels are resized later).` : "";
	let instruction;
	let tools;
	if (req.imagePaths.length > 0) {
		tools = "image_edit";
		instruction = `Call the image_edit tool once with image=[${req.imagePaths.map((p) => JSON.stringify(p)).join(", ")}] and prompt=${JSON.stringify(req.prompt)}.${aspect ? ` Pass aspect_ratio='${aspect}' only if the tool accepts it for multi-image edits.` : ""}${sizeNote} After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
	} else {
		tools = "image_gen";
		instruction = `Call the image_gen tool once with prompt=${JSON.stringify(req.prompt)}.${aspectClause}${sizeNote} After the tool returns, print ONLY the absolute filesystem path of the saved image on a single line. No other text.`;
	}
	let result;
	try {
		result = await exec("grok", buildGrokPrintArgs(instruction, {
			model: req.backendModel,
			effort: req.effort,
			skipPermissions: true,
			tools,
			maxTurns: 4
		}), {
			cwd: req.workDir,
			timeoutMs: req.timeoutSec * 1e3
		});
	} catch (err) {
		if (isNotFound(err)) return {
			kind: "error",
			reason: "\"grok\" not found on PATH."
		};
		throw err;
	}
	if (result.timedOut) return {
		kind: "error",
		reason: `grok render timed out after ~${req.timeoutSec}s; raise --timeout.`
	};
	const pathFromStdout = extractPathFromStdout(result.stdout);
	if (pathFromStdout && existsSync(pathFromStdout)) {
		const bytes = safeSize(pathFromStdout);
		if (bytes >= req.minBytes) return {
			kind: "ok",
			path: pathFromStdout,
			bytes
		};
	}
	const sessionHit = newestSessionImage(req.workDir);
	if (sessionHit && sessionHit.bytes >= req.minBytes) return {
		kind: "ok",
		path: sessionHit.path,
		bytes: sessionHit.bytes
	};
	if (result.code !== 0) {
		const tail = stripAnsi(`${result.stderr}\n${result.stdout}`).trim().split("\n").slice(-3).join(" ").slice(0, 300);
		return {
			kind: "error",
			reason: `grok exited ${result.code}${tail ? `: ${tail}` : ""}.`
		};
	}
	return { kind: "suspect" };
}
function extractPathFromStdout(stdout) {
	const text = stripAnsi(stdout).trim();
	if (!text) return null;
	for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) if (line.startsWith("/") && existsSync(line) && isImagePath(line)) return line;
	const m = text.match(/(\/(?:[^\s'"`]+)\.(?:png|jpe?g|webp|gif))/i);
	if (m?.[1] && existsSync(m[1])) return m[1];
	return null;
}
function isImagePath(p) {
	return /\.(png|jpe?g|webp|gif)$/i.test(p);
}
function newestSessionImage(workCwd) {
	const sessionsRoot = join(homedir(), ".grok", "sessions");
	if (!existsSync(sessionsRoot)) return null;
	const candidates = /* @__PURE__ */ new Set([workCwd]);
	try {
		candidates.add(resolve(workCwd));
	} catch {}
	const hits = [];
	for (const cwd of candidates) {
		const base = join(sessionsRoot, encodeURIComponent(cwd));
		if (!existsSync(base)) continue;
		for (const session of safeReaddir(base)) {
			const imagesDir = join(base, session, "images");
			if (!existsSync(imagesDir)) continue;
			for (const f of safeReaddir(imagesDir)) {
				if (!isImagePath(f)) continue;
				const path = join(imagesDir, f);
				hits.push({
					path,
					bytes: safeSize(path)
				});
			}
		}
	}
	if (hits.length === 0) return null;
	hits.sort((a, b) => mtime(b.path) - mtime(a.path));
	return hits[0] ?? null;
}
function aspectRatioFor(w, h) {
	const ratio = w / h;
	const options = [
		{
			label: "1:1",
			r: 1
		},
		{
			label: "16:9",
			r: 16 / 9
		},
		{
			label: "9:16",
			r: 9 / 16
		},
		{
			label: "4:3",
			r: 4 / 3
		},
		{
			label: "3:4",
			r: 3 / 4
		},
		{
			label: "3:2",
			r: 3 / 2
		},
		{
			label: "2:3",
			r: 2 / 3
		}
	];
	let best = options[0];
	if (!best) return "1:1";
	let bestDist = Math.abs(ratio - best.r);
	for (const o of options.slice(1)) {
		const d = Math.abs(ratio - o.r);
		if (d < bestDist) {
			best = o;
			bestDist = d;
		}
	}
	return best.label;
}
function safeReaddir(dir) {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}
function safeSize(path) {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}
function mtime(path) {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return 0;
	}
}

//#endregion
//#region packages/grok/src/probe.ts
const INSTALL_HINT$1 = "Install the Grok CLI (npm i -g @xai-official/grok) and run `grok login`.";
async function probe(run = runCaptured) {
	try {
		const check = await ensureGrok(run);
		if (check.ok) return {
			ok: true,
			version: check.version
		};
		return {
			ok: false,
			error: `ai-bridge: ${check.error}`
		};
	} catch (err) {
		if (isNotFound(err)) return {
			ok: false,
			error: `ai-bridge: "grok" not found on PATH. ${INSTALL_HINT$1}`
		};
		return {
			ok: false,
			error: `ai-bridge: failed to probe grok: ${err.message}`
		};
	}
}

//#endregion
//#region packages/grok/src/run.ts
const NOISE_RE = /^Shell cwd was reset[^\n]*$/gm;
const INSTALL_HINT = "Install the Grok CLI (npm i -g @xai-official/grok) and run `grok login`.";
function clean(s) {
	return stripAnsi(s).replace(NOISE_RE, "").trim();
}
async function run(task, exec = runCaptured) {
	const args = buildGrokPrintArgs(task.prompt, {
		model: task.backendModel,
		effort: task.effort,
		skipPermissions: task.tools
	});
	try {
		let result;
		try {
			result = await exec("grok", args, {
				cwd: task.cwd,
				timeoutMs: (task.timeoutSec + 20) * 1e3,
				onStdout: task.onStdout,
				onStderr: task.onStderr,
				onSpawn: task.onSpawn
			});
		} catch (err) {
			if (isNotFound(err)) return {
				ok: false,
				kind: "not-found",
				message: `ai-bridge: "grok" not found on PATH. ${INSTALL_HINT}`,
				exitCode: null
			};
			return {
				ok: false,
				kind: "spawn",
				message: `ai-bridge: failed to run grok: ${err.message}`,
				exitCode: null
			};
		}
		if (result.timedOut) return {
			ok: false,
			kind: "timeout",
			message: `ai-bridge: grok timed out after ~${task.timeoutSec + 20}s; raise --timeout.`,
			exitCode: result.code
		};
		const response = clean(result.stdout);
		if (result.code !== 0 || response.length === 0) return {
			ok: false,
			kind: "no-answer",
			message: `ai-bridge: grok returned no usable answer (${clean(result.stderr) || `exit code ${result.code}`}).`,
			exitCode: result.code
		};
		return {
			ok: true,
			response,
			exitCode: result.code ?? 0
		};
	} catch (err) {
		return {
			ok: false,
			kind: "spawn",
			message: `ai-bridge: error executing grok: ${err.message}`,
			exitCode: null
		};
	}
}

//#endregion
//#region packages/ai-bridge/src/drivers.ts
const DRIVERS = {
	agy: {
		probe: () => probe$3(),
		run: (task) => run$3(task),
		quota: () => fetchAgyQuota()
	},
	grok: {
		probe: () => probe(),
		run: (task) => run(task),
		generateImage: (req) => generateImage(req)
	},
	codex: {
		probe: () => probe$1(),
		run: (task) => run$1(task),
		quota: () => fetchCodexQuota(),
		generateImage: (req) => generateImage$1(req)
	},
	claude: {
		probe: () => probe$2(),
		run: (task) => run$2(task),
		quota: () => fetchClaudeQuota()
	}
};
function getDriver(backend) {
	const driver = DRIVERS[backend];
	if (!driver) throw new Error(`Unknown backend "${backend}"`);
	return driver;
}

//#endregion
//#region packages/ai-bridge/src/commands/image-gen/impl.ts
const MIN_REAL_BYTES_CODEX = 1e5;
const MIN_REAL_BYTES_GROK = 1e4;
async function imageGen(flags, prompt) {
	const fail = (msg) => {
		this.process.stderr.write(`ai-bridge image-gen: ${msg}\n`);
		this.process.exitCode = 1;
	};
	const inputSlug = flags.model ?? "openai-codex/gpt-5.6-sol";
	const model = resolveModel(inputSlug);
	if (!model) return fail(formatUnknownModelError(inputSlug));
	if (!supportsImageGen(model)) return fail(formatImageGenModelError(inputSlug, model));
	if (model.spec.backend === "codex" && model.effort) return fail(`effort "-${model.effort}" has no effect on image-gen (gpt-image-2 renders, not the seat model); use ${DEFAULT_IMAGE_GEN}.`);
	const quality = (flags.quality ?? "high").toLowerCase();
	if (![
		"low",
		"medium",
		"high"
	].includes(quality)) return fail(`invalid --quality "${flags.quality}" (use low | medium | high)`);
	let size;
	if (flags.size !== void 0) {
		const m = flags.size.match(/^(\d+)\s*x\s*(\d+)$/i);
		if (!m) return fail(`invalid --size "${flags.size}" (expected e.g. 1024x1024)`);
		size = {
			w: Number(m[1]),
			h: Number(m[2])
		};
		if (model.spec.backend === "codex") {
			const constraint = sizeConstraintError(size.w, size.h);
			if (constraint) return fail(`invalid --size ${size.w}x${size.h}: ${constraint}`);
		} else if (size.w < 1 || size.h < 1) return fail(`invalid --size ${size.w}x${size.h}: dimensions must be positive`);
	}
	const timeoutSec = flags.timeout ?? 600;
	const outPath = resolve(this.process.cwd(), flags.out ?? "./ai-bridge-image.png");
	const imagePaths = [];
	if (flags.image !== void 0) for (const raw of flags.image.split(",").map((s) => s.trim()).filter(Boolean)) {
		const abs = resolve(this.process.cwd(), raw);
		if (!existsSync(abs)) return fail(`reference image not found: ${raw}`);
		imagePaths.push(abs);
	}
	const driver = getDriver(model.spec.backend);
	if (!driver.generateImage) return fail(formatImageGenModelError(inputSlug, model));
	const minBytes = model.spec.backend === "codex" ? MIN_REAL_BYTES_CODEX : MIN_REAL_BYTES_GROK;
	const work = mkdtempSync(join(tmpdir(), "ai-bridge-imagegen-"));
	try {
		let outcome = await driver.generateImage({
			prompt,
			workDir: work,
			backendModel: model.spec.backendModel,
			effort: model.effort,
			quality,
			size,
			imagePaths,
			timeoutSec,
			forceful: false,
			minBytes
		});
		if (model.spec.backend === "codex" && outcome.kind === "suspect") outcome = await driver.generateImage({
			prompt,
			workDir: work,
			backendModel: model.spec.backendModel,
			effort: model.effort,
			quality,
			size,
			imagePaths,
			timeoutSec,
			forceful: true,
			minBytes
		});
		if (outcome.kind === "ok" && outcome.bytes < minBytes) outcome = { kind: "suspect" };
		if (outcome.kind === "error") return fail(outcome.reason);
		if (outcome.kind === "suspect") return fail(model.spec.backend === "grok" ? "grok produced no usable image. Check SuperGrok image access and re-run with a simpler prompt." : "codex produced only a tiny/code-drawn image, not a real gpt-image-2 render. Try --quality high or a clearer, simpler prompt.");
		const local = join(work, "result.bin");
		copyFileSync(outcome.path, local);
		let dims = imageSize(local);
		if (size && dims && (dims.width !== size.w || dims.height !== size.h)) if (await magick([
			local,
			"-resize",
			`${size.w}x${size.h}!`,
			local
		])) dims = imageSize(local) ?? dims;
		else this.process.stderr.write(`ai-bridge image-gen: rendered ${dims.width}x${dims.height}, wanted ${size.w}x${size.h}, and ImageMagick (magick/convert) is unavailable to resize.
`);
		const outExt = /\.png$/i.test(outPath) ? "png" : /\.jpe?g$/i.test(outPath) ? "jpg" : null;
		const actualFmt = pngSize(local) ? "png" : jpegSize(local) ? "jpg" : null;
		const needsConvert = outExt !== null && actualFmt !== null && outExt !== actualFmt;
		if (!needsConvert || !await magick([local, outPath])) {
			if (needsConvert) this.process.stderr.write(`ai-bridge image-gen: render is ${actualFmt.toUpperCase()} but out path wants ${outExt.toUpperCase()}, and ImageMagick (magick/convert) is unavailable to convert; writing the raw bytes as-is.
`);
			copyFileSync(local, outPath);
		}
		const bytes = statSync(outPath).size;
		if (flags.json) this.process.stdout.write(`${JSON.stringify({
			out: outPath,
			bytes,
			width: dims?.width ?? null,
			height: dims?.height ?? null,
			sizeRequested: flags.size ?? null,
			quality: model.spec.backend === "codex" ? quality : null,
			model: model.spec.slug,
			backend: model.spec.backend,
			real: true
		})}\n`);
		else {
			const kb = Math.round(bytes / 1024);
			const dimStr = dims ? `${dims.width}x${dims.height}, ` : "";
			const qualityStr = model.spec.backend === "codex" ? `, ${quality} quality` : "";
			this.process.stdout.write(`✓ Wrote ${outPath} (${dimStr}${kb} KB${qualityStr}, ${model.spec.slug})\n`);
		}
	} finally {
		rmSync(work, {
			recursive: true,
			force: true
		});
	}
}
function sizeConstraintError(w, h) {
	if (w % 16 !== 0 || h % 16 !== 0) return "each edge must be divisible by 16";
	const long = Math.max(w, h);
	if (long / Math.min(w, h) > 3) return "aspect ratio must be within 1:3–3:1";
	if (long > 3840) return "longest edge must be <= 3840px";
	const px = w * h;
	if (px < 655360 || px > 8294400) return "total pixels must be 655,360–8,294,400";
	return null;
}
function imageSize(path) {
	return pngSize(path) ?? jpegSize(path);
}
function pngSize(path) {
	try {
		const fd = openSync(path, "r");
		const head = Buffer.alloc(24);
		readSync(fd, head, 0, 24, 0);
		closeSync(fd);
		if (head.toString("latin1", 1, 4) !== "PNG") return null;
		if (head.toString("latin1", 12, 16) !== "IHDR") return null;
		return {
			width: head.readUInt32BE(16),
			height: head.readUInt32BE(20)
		};
	} catch {
		return null;
	}
}
function jpegSize(path) {
	try {
		const fd = openSync(path, "r");
		const buf = Buffer.alloc(64 * 1024);
		const n = readSync(fd, buf, 0, buf.length, 0);
		closeSync(fd);
		if (n < 4 || buf[0] !== 255 || buf[1] !== 216) return null;
		let i = 2;
		while (i + 9 < n) {
			if (buf[i] !== 255) return null;
			const marker = buf[i + 1];
			if (marker === void 0) return null;
			if (marker === 192 || marker === 193 || marker === 194) {
				const height = buf.readUInt16BE(i + 5);
				return {
					width: buf.readUInt16BE(i + 7),
					height
				};
			}
			if (marker === 217 || marker === 218) return null;
			const len = buf.readUInt16BE(i + 2);
			if (len < 2) return null;
			i += 2 + len;
		}
		return null;
	} catch {
		return null;
	}
}
async function magick(args) {
	for (const tool of ["magick", "convert"]) try {
		const r = await runCaptured(tool, [...args], { timeoutMs: 6e4 });
		if (!r.timedOut && r.code === 0) return true;
	} catch (err) {
		if (!isNotFound(err)) throw err;
	}
	return false;
}

//#endregion
//#region packages/ai-bridge/src/commands/image-gen/command.ts
function help$6() {
	return [
		"ai-bridge image-gen — Generate a raster image via a model seat",
		"",
		"Renders an image by driving the seat's CLI (codex → gpt-image-2, grok →",
		"Imagine), then verifies the result is a real render before returning it.",
		"",
		"Image-gen seats (canonical slug):",
		...listModelHelpLines({ imageOnly: true }),
		`Default: ${DEFAULT_IMAGE_GEN} (gpt-image-2 via codex; historical default).`,
		"",
		"Usage: ai-bridge image-gen [options] <prompt>",
		"",
		"Options:",
		`  --model <slug>     Model slug (default: ${DEFAULT_IMAGE_GEN})`,
		"  --out <path>       Path to write the image (default: ./ai-bridge-image.png)",
		"  --size <WxH>       WIDTHxHEIGHT (codex: each edge ÷16; grok: mapped to",
		"                     aspect_ratio, then optionally resized)",
		"  --image <paths>    Reference image path(s), comma-separated — visual",
		"                     reference (keep the same subject/identity, restyle, edit)",
		"  --quality <level>  low | medium | high (codex/gpt-image-2; default high).",
		"                     Ignored on grok (Imagine has no quality tier).",
		"  --timeout <secs>   Max seconds to wait for the render (default: 600)",
		"  --json             Emit a machine-readable JSON result instead of prose",
		"  -h, --help         Show this help",
		""
	].join("\n");
}
async function runImageGen(ctx, argv) {
	let values;
	let positionals;
	try {
		({values, positionals} = parseArgs({
			args: [...argv],
			allowPositionals: true,
			options: {
				model: { type: "string" },
				out: { type: "string" },
				size: { type: "string" },
				image: { type: "string" },
				quality: { type: "string" },
				timeout: { type: "string" },
				json: {
					type: "boolean",
					default: false
				},
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		return fail$5(ctx, err);
	}
	if (values.help) {
		ctx.process.stdout.write(help$6());
		return;
	}
	let prompt;
	let timeout;
	try {
		const [first, ...extra] = positionals;
		if (first === void 0) throw new Error("missing <prompt> argument");
		if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
		prompt = nonEmptyPrompt(first);
		timeout = values.timeout === void 0 ? void 0 : positiveIntSeconds(values.timeout);
	} catch (err) {
		return fail$5(ctx, err);
	}
	const flags = {
		...values.model !== void 0 ? { model: values.model } : {},
		...values.out !== void 0 ? { out: values.out } : {},
		...values.size !== void 0 ? { size: values.size } : {},
		...values.image !== void 0 ? { image: values.image } : {},
		...values.quality !== void 0 ? { quality: values.quality } : {},
		...timeout !== void 0 ? { timeout } : {},
		json: values.json
	};
	await imageGen.call(ctx, flags, prompt);
}
function fail$5(ctx, err) {
	ctx.process.stderr.write(`ai-bridge image-gen: ${err instanceof Error ? err.message : String(err)}\n`);
	ctx.process.exitCode = 2;
}

//#endregion
//#region packages/ai-bridge/src/delegate.ts
const PREAMBLE = "You are the sole executing agent for this task: do it yourself with your tools, now. Never defer to, wait for, or claim to hand off to another agent or process — no one else will act, and work not done in this run does not happen.\n\n";
async function delegate(opts, driver = getDriver(opts.model.spec.backend)) {
	const effectivePrompt = opts.tools ? PREAMBLE + opts.prompt : opts.prompt;
	const result = await driver.run({
		prompt: effectivePrompt,
		tools: opts.tools,
		timeoutSec: opts.timeoutSec,
		cwd: opts.cwd,
		backendModel: backendModelId(opts.model) ?? opts.model.spec.backendModel,
		effort: opts.model.effort,
		onStdout: (c) => opts.run.stdout(c),
		onStderr: (c) => opts.run.stderr(c),
		onSpawn: (pid) => opts.run.setPid(pid)
	});
	if (result.ok) opts.run.finish("done", result.exitCode);
	else opts.run.finish(result.kind === "timeout" ? "timeout" : "error", result.exitCode);
	return result;
}

//#endregion
//#region packages/ai-bridge/src/quotaPreflight.ts
function evaluateAgyPreflight(snapshot, backendModel) {
	const quota = findModelQuota(snapshot, backendModel);
	if (!quota) return {
		ok: true,
		warning: `model "${backendModel}" not in quota snapshot; proceeding`
	};
	if (quota.exhausted) {
		let resetAt = quota.resetTime;
		if (!resetAt) {
			for (const group of snapshot.groups) if (group.displayName.includes("Gemini")) {
				for (const bucket of group.buckets) if (bucket.resetTime) {
					if (!resetAt || new Date(bucket.resetTime).getTime() < new Date(resetAt).getTime()) resetAt = bucket.resetTime;
				}
			}
		}
		return {
			ok: false,
			message: `agy model "${backendModel}" is quota-exhausted`,
			resetAt
		};
	}
	return { ok: true };
}
function evaluateCodexPreflight(snapshot) {
	if (snapshot.limitReached) return {
		ok: false,
		message: "codex quota limit reached",
		resetAt: snapshot.windows.find((w) => w.resetAt)?.resetAt
	};
	const exhaustedWindow = snapshot.windows.find((w) => w.usedPercent >= 100);
	if (exhaustedWindow) return {
		ok: false,
		message: "codex quota limit reached",
		resetAt: exhaustedWindow.resetAt
	};
	return { ok: true };
}
async function preflightModel(resolved) {
	if (resolved.spec.backend === "codex") return preflightCodex();
	if (resolved.spec.backend !== "agy") return { ok: true };
	try {
		return evaluateAgyPreflight(await fetchAgyQuota(), backendModelId(resolved) ?? "");
	} catch (err) {
		return {
			ok: true,
			warning: `quota preflight failed (${err.message}); proceeding`
		};
	}
}
async function preflightCodex() {
	try {
		return evaluateCodexPreflight(await fetchCodexQuota());
	} catch (err) {
		return {
			ok: true,
			warning: `quota preflight failed (${err.message}); proceeding`
		};
	}
}
function formatReset$1(resetTime) {
	if (!resetTime) return "-";
	const ms = new Date(resetTime).getTime() - Date.now();
	if (Number.isNaN(ms)) return resetTime;
	if (ms <= 0) return "now";
	const mins = Math.round(ms / 6e4);
	const rel = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
	return `${new Date(resetTime).toLocaleTimeString()} (in ${rel})`;
}
function renderPreflightRefusal(cmd, verdict) {
	const resetClause = verdict.resetAt ? ` Resets ${formatReset$1(verdict.resetAt)}.` : "";
	return `ai-bridge ${cmd}: refusing — ${verdict.message}.${resetClause} Use --no-preflight to override, or a claude-backend fallback (subagent --model sonnet|opus — bills the Claude subscription).`;
}

//#endregion
//#region packages/ai-bridge/src/runlog.ts
function getTimestamp() {
	const d = /* @__PURE__ */ new Date();
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}
function pruneOldRuns(runsDir) {
	try {
		if (!existsSync(runsDir)) return;
		const dirs = readdirSync(runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
		if (dirs.length > 50) {
			const toDelete = dirs.slice(0, dirs.length - 50);
			for (const d of toDelete) try {
				rmSync(join(runsDir, d), {
					recursive: true,
					force: true
				});
			} catch {}
		}
	} catch {}
}
function startRun(command, detail) {
	const runsDir = join(homedir(), ".ai-bridge", "runs");
	try {
		mkdirSync(runsDir, { recursive: true });
		pruneOldRuns(runsDir);
		const id = `${getTimestamp()}-${command}-${randomBytes(2).toString("hex")}`;
		const dir = join(runsDir, id);
		mkdirSync(dir, { recursive: true });
		const meta = {
			id,
			command,
			detail,
			pid: null,
			startedAt: (/* @__PURE__ */ new Date()).toISOString(),
			endedAt: null,
			status: "running",
			exitCode: null
		};
		const metaJsonPath = join(dir, "meta.json");
		const stdoutLogPath = join(dir, "stdout.log");
		const stderrLogPath = join(dir, "stderr.log");
		writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), "utf8");
		writeFileSync(stdoutLogPath, "", "utf8");
		writeFileSync(stderrLogPath, "", "utf8");
		return {
			id,
			dir,
			setPid(pid) {
				try {
					meta.pid = pid;
					writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), "utf8");
				} catch {}
			},
			stdout(chunk) {
				try {
					appendFileSync(stdoutLogPath, chunk, "utf8");
				} catch {}
			},
			stderr(chunk) {
				try {
					appendFileSync(stderrLogPath, chunk, "utf8");
				} catch {}
			},
			finish(status, exitCode) {
				try {
					meta.status = status;
					meta.exitCode = exitCode;
					meta.endedAt = (/* @__PURE__ */ new Date()).toISOString();
					writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), "utf8");
				} catch {}
			}
		};
	} catch {
		return {
			id: "",
			dir: "",
			setPid() {},
			stdout() {},
			stderr() {},
			finish() {}
		};
	}
}
function listRuns() {
	const runsDir = join(homedir(), ".ai-bridge", "runs");
	if (!existsSync(runsDir)) return [];
	try {
		const entries = readdirSync(runsDir, { withFileTypes: true });
		const runs = [];
		for (const entry of entries) if (entry.isDirectory()) try {
			const metaPath = join(runsDir, entry.name, "meta.json");
			if (existsSync(metaPath)) {
				const content = readFileSync(metaPath, "utf8");
				const parsed = JSON.parse(content);
				if (parsed && typeof parsed === "object" && parsed.id && parsed.startedAt && typeof parsed.detail === "string") runs.push(parsed);
			}
		} catch {}
		return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
	} catch {
		return [];
	}
}
function readRunLogs(id) {
	const dir = join(join(homedir(), ".ai-bridge", "runs"), id);
	const metaPath = join(dir, "meta.json");
	const stdoutPath = join(dir, "stdout.log");
	const stderrPath = join(dir, "stderr.log");
	if (!existsSync(metaPath)) return null;
	try {
		return {
			meta: JSON.parse(readFileSync(metaPath, "utf8")),
			stdout: existsSync(stdoutPath) ? readFileSync(stdoutPath, "utf8") : "",
			stderr: existsSync(stderrPath) ? readFileSync(stderrPath, "utf8") : ""
		};
	} catch {
		return null;
	}
}

//#endregion
//#region packages/ai-bridge/src/commands/implement/impl.ts
async function implement(flags, planFile) {
	const inputSlug = flags.model ?? "google-antigravity/gemini-3.6-flash";
	const model = resolveModel(inputSlug);
	if (!model) {
		this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
		this.process.exitCode = 2;
		return;
	}
	const cwd = this.process.cwd();
	const absPlanPath = isAbsolute(planFile) ? planFile : resolve(cwd, planFile);
	if (!existsSync(absPlanPath)) {
		this.process.stderr.write(`ai-bridge implement: plan file "${absPlanPath}" not found\n`);
		this.process.exitCode = 2;
		return;
	}
	if (flags.preflight) {
		const verdict = await preflightModel(model);
		if (!verdict.ok) {
			this.process.stderr.write(`${renderPreflightRefusal("implement", verdict)}\n`);
			this.process.exitCode = 3;
			return;
		}
		if (verdict.warning) this.process.stderr.write(`ai-bridge implement: ${verdict.warning}\n`);
	}
	const timeoutSec = flags.timeout ?? 1800;
	const run = startRun("implement", `${model.spec.slug}: ${planFile}`);
	const outcome = await delegate({
		model,
		prompt: `Read the implementation plan file at ${absPlanPath} and implement it EXACTLY.\nEdit only the files it names. Run the project's REAL typecheck and tests and fix until green.\nDo NOT commit, push, or delete unrelated files. Reply with a short summary (files changed + final typecheck/test results).`,
		tools: true,
		timeoutSec,
		cwd,
		run
	});
	if (!outcome.ok) {
		this.process.stderr.write(`${outcome.message}\n`);
		this.process.exitCode = 1;
		return;
	}
	const diffStat = (await runCaptured("git", ["diff", "--stat"], { cwd })).stdout.trim();
	const statusRes = await runCaptured("git", ["status", "--porcelain"], { cwd });
	let untrackedCount = 0;
	if (statusRes.code === 0) {
		for (const line of statusRes.stdout.split(/\r?\n/)) if (line.startsWith("??")) untrackedCount++;
	}
	if (diffStat.length === 0 && untrackedCount === 0) {
		this.process.stderr.write(`ai-bridge implement: delegate completed but made zero working tree changes.\n`);
		this.process.exitCode = 1;
		return;
	}
	const outputParts = [outcome.response, ""];
	if (diffStat.length > 0) outputParts.push(diffStat);
	outputParts.push(`untracked files: ${untrackedCount}`);
	outputParts.push(`run: ${run.id}`);
	this.process.stdout.write(`${outputParts.join("\n")}\n`);
}

//#endregion
//#region packages/ai-bridge/src/commands/implement/command.ts
function help$5() {
	return [
		"ai-bridge implement — Execute an implementation plan",
		"",
		"Reads an implementation plan file and delegates execution to a model.",
		"Available models (canonical slug):",
		...listModelHelpLines(),
		"",
		"Usage: ai-bridge implement [options] <plan-file>",
		"",
		"Options:",
		`  --model <slug>       Model slug (default: ${DEFAULT_IMPLEMENTER})`,
		"  --timeout <secs>     Max seconds for implementation (default: 1800)",
		"  --no-preflight       Skip the backend quota preflight check",
		"  -h, --help           Show this help",
		""
	].join("\n");
}
async function runImplement(ctx, argv) {
	let values;
	let positionals;
	try {
		({values, positionals} = parseArgs({
			args: [...argv],
			allowPositionals: true,
			options: {
				model: { type: "string" },
				preflight: { type: "boolean" },
				"no-preflight": { type: "boolean" },
				timeout: { type: "string" },
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		return fail$4(ctx, err);
	}
	if (values.help) {
		ctx.process.stdout.write(help$5());
		return;
	}
	let planFile;
	let timeout;
	try {
		const [first, ...extra] = positionals;
		if (first === void 0) throw new Error("missing <plan-file> argument");
		if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
		planFile = first;
		timeout = values.timeout === void 0 ? void 0 : positiveIntSeconds(values.timeout);
	} catch (err) {
		return fail$4(ctx, err);
	}
	const flags = {
		...values.model !== void 0 ? { model: values.model } : {},
		...timeout !== void 0 ? { timeout } : {},
		preflight: values["no-preflight"] !== true
	};
	await implement.call(ctx, flags, planFile);
}
function fail$4(ctx, err) {
	ctx.process.stderr.write(`ai-bridge implement: ${err instanceof Error ? err.message : String(err)}\n`);
	ctx.process.exitCode = 2;
}

//#endregion
//#region packages/ai-bridge/src/commands/plan/impl.ts
function countOpenQuestions(markdown) {
	const headingIdx = markdown.search(/^## Open questions[ \t]*$/m);
	if (headingIdx === -1) return 0;
	const lines = markdown.slice(headingIdx).split(/\r?\n/);
	lines.shift();
	let count = 0;
	for (const line of lines) {
		if (/^## /.test(line)) break;
		const trimmed = line.trim();
		if (trimmed === "None." && count === 0) return 0;
		if (/^[-*] /.test(trimmed)) count++;
	}
	return count;
}
async function getPorcelainStatus(cwd) {
	const res = await runCaptured("git", ["status", "--porcelain"], { cwd });
	if (res.code !== 0) return /* @__PURE__ */ new Set();
	const set = /* @__PURE__ */ new Set();
	for (const line of res.stdout.split(/\r?\n/)) if (line.trim().length > 0) set.add(line);
	return set;
}
function extractPathFromPorcelainLine(line) {
	let content = line.slice(3).trim();
	if (content.includes(" -> ")) {
		const parts = content.split(" -> ");
		content = (parts[parts.length - 1] ?? "").trim();
	}
	if (content.startsWith("\"") && content.endsWith("\"")) content = content.slice(1, -1);
	return content;
}
async function plan(flags, taskPrompt) {
	const inputSlug = flags.model ?? "xai-grok/grok-4.5";
	const model = resolveModel(inputSlug);
	if (!model) {
		this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
		this.process.exitCode = 2;
		return;
	}
	if (flags.preflight) {
		const verdict = await preflightModel(model);
		if (!verdict.ok) {
			this.process.stderr.write(`${renderPreflightRefusal("plan", verdict)}\n`);
			this.process.exitCode = 3;
			return;
		}
		if (verdict.warning) this.process.stderr.write(`ai-bridge plan: ${verdict.warning}\n`);
	}
	const timeoutSec = flags.timeout ?? 1800;
	const cwd = this.process.cwd();
	const promptSnippet = taskPrompt.replace(/\r?\n/g, " ").slice(0, 80);
	const run = startRun("plan", `${model.spec.slug}: ${promptSnippet}`);
	const absOutPath = flags.out ? isAbsolute(flags.out) ? flags.out : resolve(cwd, flags.out) : resolve(run.dir, "plan.md");
	const beforePorcelain = await getPorcelainStatus(cwd);
	const outcome = await delegate({
		model,
		prompt: `You are a senior implementation planner. Study the real codebase with your tools at ${cwd}.\nDesign module boundaries, interfaces, and naming. Name every file to touch and describe what changes; define clear verification gates.\nWrite EXACTLY one file to the absolute path: ${absOutPath}\nTouch nothing else in the working tree.\nEnd the document with a section titled "## Open questions" (write "None." under it if you are confident and have no open questions).\nDo not commit or push.\n\nTask Prompt:\n${taskPrompt}`,
		tools: true,
		timeoutSec,
		cwd,
		run
	});
	if (!outcome.ok) {
		this.process.stderr.write(`${outcome.message}\n`);
		this.process.exitCode = 1;
		return;
	}
	if (!existsSync(absOutPath)) {
		this.process.stderr.write(`ai-bridge plan: plan file was not written to ${absOutPath}\n`);
		this.process.exitCode = 1;
		return;
	}
	const planContent = readFileSync(absOutPath, "utf8");
	if (planContent.trim().length === 0) {
		this.process.stderr.write(`ai-bridge plan: plan file at ${absOutPath} is empty\n`);
		this.process.exitCode = 1;
		return;
	}
	if (!/^## Open questions/m.test(planContent)) {
		this.process.stderr.write(`ai-bridge plan: plan file at ${absOutPath} missing required "## Open questions" section\n`);
		this.process.exitCode = 1;
		return;
	}
	const afterPorcelain = await getPorcelainStatus(cwd);
	const normalizedOut = resolve(absOutPath);
	const normalizedCwd = resolve(cwd);
	const isOutInRepo = normalizedOut.startsWith(normalizedCwd);
	const unexpectedPaths = [];
	for (const line of afterPorcelain) if (!beforePorcelain.has(line)) {
		const relPath = extractPathFromPorcelainLine(line);
		const absPath = resolve(cwd, relPath);
		if (isOutInRepo && absPath === normalizedOut) continue;
		unexpectedPaths.push(relPath);
	}
	if (unexpectedPaths.length > 0) {
		this.process.stderr.write(`ai-bridge plan: unexpected working tree changes beyond plan file:\n${unexpectedPaths.map((p) => `  ${p}`).join("\n")}\n`);
		this.process.exitCode = 1;
		return;
	}
	const openQuestions = countOpenQuestions(planContent);
	this.process.stdout.write(`plan: ${absOutPath}\nopen questions: ${openQuestions}\nrun: ${run.id}\n`);
}

//#endregion
//#region packages/ai-bridge/src/commands/plan/command.ts
function help$4() {
	return [
		"ai-bridge plan — Produce a detailed implementation plan for a task prompt",
		"",
		"Hands a task prompt to a model to produce an expanded implementation plan file.",
		"Available models (canonical slug):",
		...listModelHelpLines(),
		"",
		"Usage: ai-bridge plan [options] <task prompt>",
		"",
		"Options:",
		`  --model <slug>       Model slug (default: ${DEFAULT_MODEL})`,
		"  --out <file>         Where to write the plan (default: <run.dir>/plan.md)",
		"  --timeout <secs>     Max seconds for planning (default: 1800)",
		"  --no-preflight       Skip the backend quota preflight check",
		"  -h, --help           Show this help",
		""
	].join("\n");
}
async function runPlan(ctx, argv) {
	let values;
	let positionals;
	try {
		({values, positionals} = parseArgs({
			args: [...argv],
			allowPositionals: true,
			options: {
				model: { type: "string" },
				out: { type: "string" },
				preflight: { type: "boolean" },
				"no-preflight": { type: "boolean" },
				timeout: { type: "string" },
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		return fail$3(ctx, err);
	}
	if (values.help) {
		ctx.process.stdout.write(help$4());
		return;
	}
	let prompt;
	let timeout;
	try {
		const [first, ...extra] = positionals;
		if (first === void 0) throw new Error("missing <task prompt> argument");
		if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
		prompt = nonEmptyPrompt(first);
		timeout = values.timeout === void 0 ? void 0 : positiveIntSeconds(values.timeout);
	} catch (err) {
		return fail$3(ctx, err);
	}
	const flags = {
		...values.model !== void 0 ? { model: values.model } : {},
		...values.out !== void 0 ? { out: values.out } : {},
		...timeout !== void 0 ? { timeout } : {},
		preflight: values["no-preflight"] !== true
	};
	await plan.call(ctx, flags, prompt);
}
function fail$3(ctx, err) {
	ctx.process.stderr.write(`ai-bridge plan: ${err instanceof Error ? err.message : String(err)}\n`);
	ctx.process.exitCode = 2;
}

//#endregion
//#region packages/ai-bridge/src/commands/quota/impl.ts
function formatReset(resetTime) {
	if (!resetTime) return "-";
	const ms = new Date(resetTime).getTime() - Date.now();
	if (Number.isNaN(ms)) return resetTime;
	if (ms <= 0) return "now";
	const mins = Math.round(ms / 6e4);
	const rel = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60}m`;
	return `${new Date(resetTime).toLocaleTimeString()} (in ${rel})`;
}
function renderAgy(ctx, snapshot) {
	ctx.process.stdout.write("=== agy (Antigravity) — remaining per model group ===\n");
	for (const group of snapshot.groups) {
		ctx.process.stdout.write(`${group.displayName}\n`);
		for (const b of group.buckets) {
			const pct = b.remainingFraction === 0 ? "EXHAUSTED" : `${Math.round(b.remainingFraction * 100)}%`;
			ctx.process.stdout.write(`  ${b.displayName.padEnd(18)} ${pct.padEnd(10)} ${formatReset(b.resetTime)}\n`);
		}
	}
	const exhausted = snapshot.models.filter((m) => m.exhausted);
	if (exhausted.length > 0) ctx.process.stdout.write(`Exhausted models: ${[...new Set(exhausted.map((m) => m.label))].join(", ")}\n`);
}
function renderCodex(ctx, snapshot) {
	const plan = snapshot.planType ? ` — plan: ${snapshot.planType}` : "";
	const reached = snapshot.limitReached ? " [LIMIT REACHED]" : "";
	ctx.process.stdout.write(`=== codex (ChatGPT)${plan}${reached} — used per window ===\n`);
	ctx.process.stdout.write(`${"WINDOW".padEnd(10)} ${"USED".padEnd(10)} RESET\n`);
	for (const w of snapshot.windows) ctx.process.stdout.write(`${w.window.padEnd(10)} ${`${w.usedPercent}%`.padEnd(10)} ${formatReset(w.resetAt)}\n`);
}
function renderClaude(ctx, snapshot) {
	ctx.process.stdout.write("=== claude (Claude Code subscription) — used per window ===\n");
	ctx.process.stdout.write(`${"WINDOW".padEnd(20)} ${"USED".padEnd(10)} RESET\n`);
	for (const w of snapshot.windows) ctx.process.stdout.write(`${w.window.padEnd(20)} ${`${w.usedPercent}%`.padEnd(10)} ${w.resetsText || "-"}\n`);
}
function renderSection(ctx, result, title, render) {
	if (result.status === "fulfilled") render(ctx, result.value);
	else ctx.process.stdout.write(`=== ${title} ===\nunavailable: ${result.reason.message}\n`);
}
async function quotaImpl(flags) {
	const [agy, codex, claude] = await Promise.allSettled([
		fetchAgyQuota(),
		fetchCodexQuota(),
		fetchClaudeQuota()
	]);
	const allFailed = agy.status === "rejected" && codex.status === "rejected" && claude.status === "rejected";
	if (flags.json) {
		this.process.stdout.write(`${JSON.stringify({
			agy: agy.status === "fulfilled" ? agy.value : { error: String(agy.reason) },
			codex: codex.status === "fulfilled" ? codex.value : { error: String(codex.reason) },
			claude: claude.status === "fulfilled" ? claude.value : { error: String(claude.reason) }
		}, null, 2)}\n`);
		if (allFailed) this.process.exitCode = 1;
		return;
	}
	renderSection(this, agy, "agy (Antigravity)", renderAgy);
	this.process.stdout.write("\n");
	renderSection(this, codex, "codex (ChatGPT)", renderCodex);
	this.process.stdout.write("\n");
	renderSection(this, claude, "claude (Claude Code subscription)", renderClaude);
	if (allFailed) this.process.exitCode = 1;
}

//#endregion
//#region packages/ai-bridge/src/commands/quota/command.ts
function help$3() {
	return [
		"ai-bridge quota — Show agy / codex / claude quota with reset times",
		"",
		"agy: reads its cached OAuth token (~/.gemini/antigravity-cli/) and asks the",
		"Cloud Code API for per-model remaining quota. EXHAUSTED means agy turns on",
		"that model fail with an empty answer until the reset time.",
		"codex: reads ~/.codex/auth.json and asks the ChatGPT usage endpoint for the",
		"5-hour and weekly windows (used % + reset). No separate logins for either.",
		"claude: shells out to `claude -p \"/usage\"` (the slow leg, ~5-10s) and parses",
		"the session + weekly windows — no HTTP endpoint exists and we never touch",
		"the Keychain; the claude CLI uses its own credentials.",
		"",
		"Usage:",
		"  ai-bridge quota [--json]",
		"",
		"Options:",
		"  --json     Emit the raw snapshot as JSON",
		"  -h, --help Show this help",
		""
	].join("\n");
}
async function runQuota(ctx, argv) {
	let values;
	try {
		({values} = parseArgs({
			args: [...argv],
			allowPositionals: false,
			options: {
				json: {
					type: "boolean",
					default: false
				},
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		ctx.process.stderr.write(`ai-bridge quota: ${err.message}\n\n${help$3()}`);
		ctx.process.exitCode = 2;
		return;
	}
	if (values.help) {
		ctx.process.stdout.write(help$3());
		return;
	}
	const flags = { json: values.json };
	try {
		await quotaImpl.call(ctx, flags);
	} catch (err) {
		ctx.process.stderr.write(`ai-bridge quota: ${err.message}\n`);
		ctx.process.exitCode = 1;
	}
}

//#endregion
//#region packages/ai-bridge/src/commands/review/impl.ts
function matchVerdictLine(line) {
	if (/^PASS\b/i.test(line)) return { kind: "pass" };
	const match = line.match(/^FINDINGS:\s*(?:(\d+)\s*critical,?\s*)?(?:(\d+)\s*major,?\s*)?(?:(\d+)\s*minor)?/i);
	if (match) {
		const critical = match[1] ? Number.parseInt(match[1], 10) : 0;
		const major = match[2] ? Number.parseInt(match[2], 10) : 0;
		const minor = match[3] ? Number.parseInt(match[3], 10) : 0;
		return {
			kind: "findings",
			critical,
			major,
			minor,
			formattedLine: `FINDINGS: ${critical} critical, ${major} major, ${minor} minor`
		};
	}
	return null;
}
function parseReviewVerdict(response) {
	const lines = response.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
	if (lines.length === 0) return {
		kind: "unparseable",
		rawLine: ""
	};
	const first = matchVerdictLine(lines[0]);
	if (first) return first;
	const last = matchVerdictLine(lines[lines.length - 1]);
	if (last) return last;
	const embedded = [...response.matchAll(/FINDINGS:\s*(\d+)\s*critical,?\s*(\d+)\s*major,?\s*(\d+)\s*minor/gi)].at(-1);
	if (embedded) {
		const critical = Number.parseInt(embedded[1], 10);
		const major = Number.parseInt(embedded[2], 10);
		const minor = Number.parseInt(embedded[3], 10);
		return {
			kind: "findings",
			critical,
			major,
			minor,
			formattedLine: `FINDINGS: ${critical} critical, ${major} major, ${minor} minor`
		};
	}
	return {
		kind: "unparseable",
		rawLine: lines[0]
	};
}
async function review(flags) {
	const inputSlug = flags.model ?? "xai-grok/grok-4.5";
	const model = resolveModel(inputSlug);
	if (!model) {
		this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
		this.process.exitCode = 2;
		return;
	}
	const cwd = this.process.cwd();
	const baseRef = flags.base ?? "HEAD";
	let absPlanPath;
	if (flags.plan) {
		absPlanPath = isAbsolute(flags.plan) ? flags.plan : resolve(cwd, flags.plan);
		if (!existsSync(absPlanPath)) {
			this.process.stderr.write(`ai-bridge review: plan file "${absPlanPath}" not found\n`);
			this.process.exitCode = 2;
			return;
		}
	}
	const diffRes = await runCaptured("git", [
		"diff",
		"--quiet",
		baseRef
	], { cwd });
	if (diffRes.code !== 0 && diffRes.code !== 1) {
		const detail = diffRes.stderr.trim().split("\n")[0] ?? `exit code ${diffRes.code}`;
		this.process.stderr.write(`ai-bridge review: git diff failed for base "${baseRef}": ${detail}\n`);
		this.process.exitCode = 2;
		return;
	}
	const hasDiff = diffRes.code === 1;
	const statusRes = await runCaptured("git", ["status", "--porcelain"], { cwd });
	const hasPorcelain = statusRes.code === 0 && statusRes.stdout.trim().length > 0;
	const isDirty = hasDiff || hasPorcelain;
	if (!isDirty && !absPlanPath) {
		this.process.stderr.write(`ai-bridge review: nothing to review\n`);
		this.process.exitCode = 2;
		return;
	}
	if (flags.preflight) {
		const verdict = await preflightModel(model);
		if (!verdict.ok) {
			this.process.stderr.write(`${renderPreflightRefusal("review", verdict)}\n`);
			this.process.exitCode = 3;
			return;
		}
		if (verdict.warning) this.process.stderr.write(`ai-bridge review: ${verdict.warning}\n`);
	}
	const timeoutSec = flags.timeout ?? 1200;
	const modeDetail = isDirty ? absPlanPath ? `diff + plan (${absPlanPath})` : `diff (${baseRef})` : `plan-only (${absPlanPath})`;
	const run = startRun("review", `${model.spec.slug}: ${modeDetail}`);
	const absOutPath = flags.out ? isAbsolute(flags.out) ? flags.out : resolve(cwd, flags.out) : resolve(run.dir, "review.md");
	let reviewPrompt;
	if (isDirty) reviewPrompt = `You are an expert code reviewer. Inspect the working tree diff against base '${baseRef}' and untracked files at ${cwd}.\n` + (absPlanPath ? `Compare the implementation against the plan contract at ${absPlanPath}. Any file modified or feature added outside the plan contract counts as over-reach (severity: major unless harmful, then critical).\n` : "") + `Write your detailed review report to the file ${absOutPath}. For each finding, include file:line, severity (critical|major|minor), and rationale.\nYour final answer (last message) must consist of EXACTLY ONE VERDICT LINE:\nEither: "PASS"\nOr: "FINDINGS: <c> critical, <m> major, <n> minor"`;
	else reviewPrompt = `You are an expert architecture reviewer. Inspect the plan contract file at ${absPlanPath}.\nReview the plan for soundness, missing edge cases, safety, and feasibility.\nWrite your detailed review report to the file ${absOutPath}. For each finding, include severity (critical|major|minor) and rationale.\nYour final answer (last message) must consist of EXACTLY ONE VERDICT LINE:\nEither: "PASS"\nOr: "FINDINGS: <c> critical, <m> major, <n> minor"`;
	const outcome = await delegate({
		model,
		prompt: reviewPrompt,
		tools: true,
		timeoutSec,
		cwd,
		run
	});
	if (!outcome.ok) {
		this.process.stderr.write(`${outcome.message}\n`);
		this.process.exitCode = 1;
		return;
	}
	if (!existsSync(absOutPath) || readFileSync(absOutPath, "utf8").trim().length === 0) {
		this.process.stderr.write(`ai-bridge review: review file was not written to ${absOutPath}\n`);
		this.process.exitCode = 1;
		return;
	}
	const verdictResult = parseReviewVerdict(outcome.response);
	if (verdictResult.kind === "unparseable") {
		this.process.stderr.write(`ai-bridge review: could not parse a verdict line from the answer.\n`);
		this.process.stdout.write(`${outcome.response}\nreview: ${absOutPath}\nrun: ${run.id}\n`);
		this.process.exitCode = 1;
		return;
	}
	if (verdictResult.kind === "pass") {
		this.process.stdout.write(`PASS\nreview: ${absOutPath}\nrun: ${run.id}\n`);
		this.process.exitCode = 0;
		return;
	}
	this.process.stdout.write(`${verdictResult.formattedLine}\nreview: ${absOutPath}\nrun: ${run.id}\n`);
	const isPassing = verdictResult.critical === 0 && verdictResult.major === 0;
	this.process.exitCode = isPassing ? 0 : 1;
}

//#endregion
//#region packages/ai-bridge/src/commands/review/command.ts
function help$2() {
	return [
		"ai-bridge review — Review working tree diff or plan contract",
		"",
		"Inspects code diffs or plan contracts and writes a review report.",
		"Available models (canonical slug):",
		...listModelHelpLines(),
		"",
		"Usage: ai-bridge review [options]",
		"",
		"Options:",
		`  --model <slug>       Model slug (default: ${DEFAULT_MODEL})`,
		"  --plan <file>        Plan file for contract / over-reach check",
		"  --base <ref>         Base git ref to diff against (default: HEAD)",
		"  --out <file>         Where to write the review report (default: <run.dir>/review.md)",
		"  --timeout <secs>     Max seconds for review (default: 1200)",
		"  --no-preflight       Skip the backend quota preflight check",
		"  -h, --help           Show this help",
		""
	].join("\n");
}
async function runReview(ctx, argv) {
	let values;
	try {
		({values} = parseArgs({
			args: [...argv],
			allowPositionals: true,
			options: {
				model: { type: "string" },
				plan: { type: "string" },
				base: { type: "string" },
				out: { type: "string" },
				preflight: { type: "boolean" },
				"no-preflight": { type: "boolean" },
				timeout: { type: "string" },
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		return fail$2(ctx, err);
	}
	if (values.help) {
		ctx.process.stdout.write(help$2());
		return;
	}
	let timeout;
	try {
		timeout = values.timeout === void 0 ? void 0 : positiveIntSeconds(values.timeout);
	} catch (err) {
		return fail$2(ctx, err);
	}
	const flags = {
		...values.model !== void 0 ? { model: values.model } : {},
		...values.plan !== void 0 ? { plan: values.plan } : {},
		...values.base !== void 0 ? { base: values.base } : {},
		...values.out !== void 0 ? { out: values.out } : {},
		...timeout !== void 0 ? { timeout } : {},
		preflight: values["no-preflight"] !== true
	};
	await review.call(ctx, flags);
}
function fail$2(ctx, err) {
	ctx.process.stderr.write(`ai-bridge review: ${err instanceof Error ? err.message : String(err)}\n`);
	ctx.process.exitCode = 2;
}

//#endregion
//#region packages/ai-bridge/src/commands/runs/impl.ts
function formatElapsed(startedAtStr, endedAtStr) {
	const start = new Date(startedAtStr).getTime();
	const end = endedAtStr ? new Date(endedAtStr).getTime() : Date.now();
	const diffSec = Math.max(0, Math.floor((end - start) / 1e3));
	if (diffSec < 60) return `${diffSec}s`;
	return `${Math.floor(diffSec / 60)}m${diffSec % 60}s`;
}
function getStatus(run) {
	if (run.status === "running" && run.pid !== null) try {
		process.kill(run.pid, 0);
	} catch {
		return "stale";
	}
	return run.status;
}
async function runs(flags, idPrefix) {
	if (idPrefix !== void 0) {
		const matches = listRuns().filter((r) => r.id.startsWith(idPrefix));
		if (matches.length === 0) {
			this.process.stderr.write(`ai-bridge runs: no run matches prefix "${idPrefix}"\n`);
			this.process.exitCode = 1;
			return;
		}
		if (matches.length > 1) {
			this.process.stderr.write(`ai-bridge runs: ambiguous prefix "${idPrefix}" matches:\n${matches.map((m) => `  ${m.id}`).join("\n")}\n`);
			this.process.exitCode = 1;
			return;
		}
		const target = matches[0];
		if (target === void 0) return;
		const logs = readRunLogs(target.id);
		if (!logs) {
			this.process.stderr.write(`ai-bridge runs: failed to read logs for run "${target.id}"\n`);
			this.process.exitCode = 1;
			return;
		}
		const status = getStatus(logs.meta).toUpperCase();
		const elapsed = formatElapsed(logs.meta.startedAt, logs.meta.endedAt);
		const summaryLines = [
			`ID:      ${logs.meta.id}`,
			`COMMAND: ${logs.meta.command}`,
			`STATUS:  ${status}`,
			`ELAPSED: ${elapsed}`,
			`DETAIL:  ${logs.meta.detail}`
		];
		if (logs.meta.pid !== null) summaryLines.push(`PID:     ${logs.meta.pid}`);
		if (logs.meta.exitCode !== null) summaryLines.push(`EXIT:    ${logs.meta.exitCode}`);
		this.process.stdout.write(`${summaryLines.join("\n")}\n\n`);
		const stdoutLines = logs.stdout.split("\n");
		if (stdoutLines.length > 1 && stdoutLines[stdoutLines.length - 1] === "") stdoutLines.pop();
		const lastStdout = stdoutLines.slice(-40).join("\n");
		this.process.stdout.write(`${lastStdout}\n`);
		if (logs.stderr.trim().length > 0) {
			const stderrLines = logs.stderr.split("\n");
			if (stderrLines.length > 1 && stderrLines[stderrLines.length - 1] === "") stderrLines.pop();
			const lastStderr = stderrLines.slice(-10).join("\n");
			this.process.stdout.write(`\n--- stderr (last 10 lines) ---\n${lastStderr}\n`);
		}
		return;
	}
	if (flags.watch) {
		const update = () => {
			this.process.stdout.write("\x1B[2J\x1B[H");
			const timeStr = (/* @__PURE__ */ new Date()).toLocaleTimeString();
			this.process.stdout.write(`ai-bridge runs — ${timeStr} (ctrl-c to quit)\n\n`);
			const runs = listRuns();
			if (runs.length === 0) {
				this.process.stdout.write("no runs yet\n");
				return;
			}
			const limit = runs.slice(0, 10);
			this.process.stdout.write(`${"STATUS".padEnd(10)} ${"ID".padEnd(35)} ${"ELAPSED".padEnd(10)} DETAIL\n`);
			for (const r of limit) {
				const status = getStatus(r).toUpperCase();
				const elapsed = formatElapsed(r.startedAt, r.endedAt);
				const detail = r.detail.replace(/\r?\n/g, " ");
				const truncatedDetail = detail.length > 60 ? `${detail.slice(0, 57)}...` : detail;
				this.process.stdout.write(`${status.padEnd(10)} ${r.id.padEnd(35)} ${elapsed.padEnd(10)} ${truncatedDetail}\n`);
			}
			const runningRuns = runs.filter((r) => getStatus(r) === "running");
			for (const r of runningRuns) {
				const logs = readRunLogs(r.id);
				if (logs) {
					this.process.stdout.write(`\n--- stdout: ${r.id} ---\n`);
					const lines = logs.stdout.split("\n");
					if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
					const lastSix = lines.slice(-6).join("\n");
					this.process.stdout.write(`${lastSix}\n`);
				}
			}
		};
		update();
		setInterval(update, 2e3);
		return new Promise(() => {});
	}
	const runs = listRuns();
	if (runs.length === 0) {
		this.process.stdout.write("no runs yet\n");
		return;
	}
	if (flags.json) {
		const limit = runs.slice(0, 20);
		for (const r of limit) {
			const status = getStatus(r);
			const withStatus = {
				...r,
				status
			};
			this.process.stdout.write(`${JSON.stringify(withStatus)}\n`);
		}
		return;
	}
	const limit = runs.slice(0, 20);
	this.process.stdout.write(`${"STATUS".padEnd(10)} ${"ID".padEnd(35)} ${"ELAPSED".padEnd(10)} DETAIL\n`);
	for (const r of limit) {
		const status = getStatus(r).toUpperCase();
		const elapsed = formatElapsed(r.startedAt, r.endedAt);
		const detail = r.detail.replace(/\r?\n/g, " ");
		const truncatedDetail = detail.length > 60 ? `${detail.slice(0, 57)}...` : detail;
		this.process.stdout.write(`${status.padEnd(10)} ${r.id.padEnd(35)} ${elapsed.padEnd(10)} ${truncatedDetail}\n`);
	}
}

//#endregion
//#region packages/ai-bridge/src/commands/runs/command.ts
function help$1() {
	return [
		"ai-bridge runs — Monitor and inspect execution runs",
		"",
		"Lists recent runs, watches active runs, or displays logs for a specific run.",
		"",
		"Usage:",
		"  ai-bridge runs [options]",
		"  ai-bridge runs <id-prefix>",
		"",
		"Options:",
		"  --watch    Watch running runs in real time (refresh every 2s)",
		"  --json     Emit output in JSON Lines format (list mode only)",
		"  -h, --help Show this help",
		""
	].join("\n");
}
async function runRuns(ctx, argv) {
	let values;
	let positionals;
	try {
		({values, positionals} = parseArgs({
			args: [...argv],
			allowPositionals: true,
			options: {
				watch: {
					type: "boolean",
					default: false
				},
				json: {
					type: "boolean",
					default: false
				},
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		return fail$1(ctx, err);
	}
	if (values.help) {
		ctx.process.stdout.write(help$1());
		return;
	}
	let idPrefix;
	try {
		const [first, ...extra] = positionals;
		if (first !== void 0) idPrefix = first;
		if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
		if (values.watch && idPrefix !== void 0) throw new Error("cannot specify <id> when using --watch");
		if (values.watch && values.json) throw new Error("cannot specify --json when using --watch");
	} catch (err) {
		return fail$1(ctx, err);
	}
	const flags = {
		watch: values.watch,
		json: values.json
	};
	await runs.call(ctx, flags, idPrefix);
}
function fail$1(ctx, err) {
	ctx.process.stderr.write(`ai-bridge runs: ${err instanceof Error ? err.message : String(err)}\n`);
	ctx.process.exitCode = 2;
}

//#endregion
//#region packages/ai-bridge/src/commands/subagent/impl.ts
async function subagent(flags, prompt) {
	const inputSlug = flags.model ?? "xai-grok/grok-4.5";
	const model = resolveModel(inputSlug);
	if (!model) {
		this.process.stderr.write(`${formatUnknownModelError(inputSlug)}\n`);
		this.process.exitCode = 2;
		return;
	}
	if (flags.preflight) {
		const verdict = await preflightModel(model);
		if (!verdict.ok) {
			if (flags.json) this.process.stdout.write(`${JSON.stringify({
				error: "quota_exhausted",
				message: verdict.message,
				resetAt: verdict.resetAt ?? null,
				slug: model.spec.slug
			})}\n`);
			else this.process.stderr.write(`${renderPreflightRefusal("subagent", verdict)}\n`);
			this.process.exitCode = 3;
			return;
		}
		if (verdict.warning) this.process.stderr.write(`ai-bridge subagent: ${verdict.warning}\n`);
	}
	const timeoutSec = flags.timeout ?? 600;
	const workDir = this.process.cwd();
	const promptSnippet = prompt.replace(/\r?\n/g, " ").slice(0, 80);
	const run = startRun("subagent", `${model.spec.slug}: ${promptSnippet}`);
	const outcome = await delegate({
		model,
		prompt,
		tools: flags.tools,
		timeoutSec,
		cwd: workDir,
		run
	});
	if (!outcome.ok) {
		this.process.stderr.write(`${outcome.message}\n`);
		this.process.exitCode = 1;
		return;
	}
	if (flags.json) {
		const modelId = backendModelId(model) ?? null;
		this.process.stdout.write(`${JSON.stringify({
			model: modelId,
			slug: model.spec.slug,
			response: outcome.response,
			exitCode: outcome.exitCode
		})}\n`);
	} else this.process.stdout.write(`${outcome.response}\n`);
}

//#endregion
//#region packages/ai-bridge/src/commands/subagent/command.ts
function help() {
	return [
		"ai-bridge subagent — Delegate a self-contained task to another model",
		"",
		"Hands a self-contained prompt to another model and returns its answer.",
		"Available models (canonical slug):",
		...listModelHelpLines(),
		`Default: ${DEFAULT_MODEL} (off-budget). The claude-backend slugs are FALLBACKS for`,
		"when the off-budget CLIs are quota-exhausted — they bill your Claude subscription.",
		"",
		"Usage: ai-bridge subagent [options] <prompt>",
		"",
		"Options:",
		`  --model <slug>     Model slug to delegate to (default: ${DEFAULT_MODEL})`,
		"  --timeout <secs>   Max seconds to wait for the backend (default: 600)",
		"  --no-tools         Restrict the delegate to reasoning only (no file/shell",
		"                     access). Tools are ON by default; use this for untrusted input.",
		"  --no-preflight     Skip the backend quota preflight check",
		"  --json             Emit a machine-readable JSON result (using canonical slug) instead of prose",
		"  -h, --help         Show this help",
		""
	].join("\n");
}
async function runSubagent(ctx, argv) {
	let values;
	let positionals;
	try {
		({values, positionals} = parseArgs({
			args: [...argv],
			allowPositionals: true,
			options: {
				model: { type: "string" },
				timeout: { type: "string" },
				tools: { type: "boolean" },
				"no-tools": { type: "boolean" },
				preflight: { type: "boolean" },
				"no-preflight": { type: "boolean" },
				json: {
					type: "boolean",
					default: false
				},
				help: {
					type: "boolean",
					short: "h",
					default: false
				}
			}
		}));
	} catch (err) {
		return fail(ctx, err);
	}
	if (values.help) {
		ctx.process.stdout.write(help());
		return;
	}
	let prompt;
	let timeout;
	try {
		const [first, ...extra] = positionals;
		if (first === void 0) throw new Error("missing <prompt> argument");
		if (extra.length > 0) throw new Error(`unexpected extra argument "${extra[0]}"`);
		prompt = nonEmptyPrompt(first);
		timeout = values.timeout === void 0 ? void 0 : positiveIntSeconds(values.timeout);
	} catch (err) {
		return fail(ctx, err);
	}
	const flags = {
		...values.model !== void 0 ? { model: values.model } : {},
		...timeout !== void 0 ? { timeout } : {},
		tools: values["no-tools"] !== true,
		preflight: values["no-preflight"] !== true,
		json: values.json
	};
	await subagent.call(ctx, flags, prompt);
}
function fail(ctx, err) {
	ctx.process.stderr.write(`ai-bridge subagent: ${err instanceof Error ? err.message : String(err)}\n`);
	ctx.process.exitCode = 2;
}

//#endregion
//#region packages/ai-bridge/src/app.ts
const BRIEF = "Bridge tasks to non-Claude AI CLIs — a plan → implement → review workflow, task delegation, and image generation (codex gpt-image-2 / grok Imagine).";
function topLevelHelp() {
	return [
		`ai-bridge — ${BRIEF}`,
		"",
		"Usage: ai-bridge <command> [options]",
		"",
		"Commands:",
		"  plan        Expand a task into a detailed implementation plan file",
		"  implement   Implement a plan file in place (edits the working tree)",
		"  review      Review the working-tree diff (or a plan) against a plan contract",
		"  subagent    Delegate a self-contained task to a non-Claude model",
		"  image-gen   Generate a raster image via a model seat (codex or grok)",
		"  runs        Monitor and inspect execution runs",
		"  quota       Show backend quota and reset times (agy, codex, claude)",
		"",
		"Run `ai-bridge <command> --help` for a command's options.",
		""
	].join("\n");
}
async function runCli(ctx, argv) {
	const [command, ...rest] = argv;
	if (command === void 0 || command === "--help" || command === "-h") {
		ctx.process.stdout.write(topLevelHelp());
		return;
	}
	switch (command) {
		case "plan": return runPlan(ctx, rest);
		case "implement": return runImplement(ctx, rest);
		case "review": return runReview(ctx, rest);
		case "subagent": return runSubagent(ctx, rest);
		case "image-gen": return runImageGen(ctx, rest);
		case "runs": return runRuns(ctx, rest);
		case "quota": return runQuota(ctx, rest);
		default:
			ctx.process.stderr.write(`ai-bridge: unknown command "${command}"\n\n${topLevelHelp()}`);
			ctx.process.exitCode = 2;
			return;
	}
}

//#endregion
//#region packages/ai-bridge/src/context.ts
function buildContext(process) {
	return { process };
}

//#endregion
//#region packages/ai-bridge/src/cli.ts
await runCli(buildContext(process), process.argv.slice(2));

//#endregion
export {  };