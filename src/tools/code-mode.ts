import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { rheaResponse } from "../lib/tool-result";
import { rheaCatalog } from "../spec/catalog";
import { createRheaApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    RHEA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createRheaApiFetch();
    const registrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (input: unknown, extra: unknown) => Promise<any>;
        rest.push((input: unknown, extra: unknown) => rheaResponse(() => handler(input, extra), env, String(name), extra, input));
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest);
        register(`mcp_${String(name)}`, ...rest);
    } };

    const searchTool = createSearchTool({
        prefix: "rhea",
        catalog: rheaCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "rhea",
        // Verifiable provenance: rhea_execute results carry a _meta.citation.
        source: { id: "rhea", name: "Rhea", url: "https://www.rhea-db.org", license: "CC BY 4.0" },
        catalog: rheaCatalog,
        apiFetch,
        preserveApiErrors: true,
        maxInlineBytes: 30 * 1024,
        timeout: 90_000,
        doNamespace: env.RHEA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(registrar);
}
