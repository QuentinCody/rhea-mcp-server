import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
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

    const searchTool = createSearchTool({
        prefix: "rhea",
        catalog: rheaCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "rhea",
        catalog: rheaCatalog,
        apiFetch,
        doNamespace: env.RHEA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
