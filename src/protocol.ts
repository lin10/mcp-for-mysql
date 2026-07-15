/**
 * Native MCP (Model Context Protocol) Implementation
 * 
 * A complete MCP protocol implementation without any external SDK dependencies
 */

// JSON-RPC 2.0 Types
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

// MCP Types
export interface ServerCapabilities {
  tools?: {};
  resources?: {};
  prompts?: {};
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface CallToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Server Implementation
 */
export class MCPServer {
  private capabilities: ServerCapabilities;
  private tools: Map<string, Tool> = new Map();
  private toolHandlers: Map<string, (args: any) => Promise<CallToolResult>> = new Map();
  private requestBuffer: string = "";

  constructor(
    private serverInfo: {
      name: string;
      version: string;
    },
    capabilities: ServerCapabilities
  ) {
    this.capabilities = capabilities;
    this.setupStdio();
  }

  /**
   * Register a tool
   */
  registerTool(
    tool: Tool,
    handler: (args: Record<string, any>) => Promise<CallToolResult>
  ): void {
    this.tools.set(tool.name, tool);
    this.toolHandlers.set(tool.name, handler);
  }

  /**
   * Setup stdio communication
   */
  private setupStdio(): void {
    process.stdin.setEncoding("utf8");
    process.stdout.setDefaultEncoding("utf8");

    process.stdin.on("data", (chunk: string) => {
      this.requestBuffer += chunk;
      this.processBuffer();
    });

    process.stdin.on("end", () => {
      process.exit(0);
    });
  }

  /**
   * Process buffered messages
   */
  private processBuffer(): void {
    while (true) {
      const newlineIndex = this.requestBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const message = this.requestBuffer.substring(0, newlineIndex);
      this.requestBuffer = this.requestBuffer.substring(newlineIndex + 1);

      if (message.trim()) {
        this.handleMessage(message);
      }
    }
  }

  /**
   * Handle a single message
   */
  private async handleMessage(message: string): Promise<void> {
    try {
      const request: JSONRPCRequest = JSON.parse(message);
      await this.handleRequest(request);
    } catch (error) {
      this.sendResponse(null, {
        code: -32700,
        message: "Parse error",
        data: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle JSON-RPC request
   */
  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    try {
      let result: any;

      switch (request.method) {
        case "initialize":
          result = await this.handleInitialize(request.params);
          break;

        case "tools/list":
          result = await this.handleToolsList();
          break;

        case "tools/call":
          result = await this.handleToolsCall(request.params);
          break;

        case "ping":
          result = {};
          break;

        default:
          if (request.id !== undefined) {
            this.sendResponse(request.id, null, {
              code: -32601,
              message: `Method not found: ${request.method}`,
            });
          }
          return;
      }

      if (request.id !== undefined) {
        this.sendResponse(request.id, result);
      }
    } catch (error) {
      if (request.id !== undefined) {
        this.sendResponse(request.id, null, {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(params: any): Promise<any> {
    return {
      protocolVersion: "2024-11-05",
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
    };
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<any> {
    return {
      tools: Array.from(this.tools.values()),
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: any): Promise<CallToolResult> {
    const { name, arguments: args } = params;

    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return await handler(args || {});
  }

  /**
   * Send JSON-RPC response
   */
  private sendResponse(
    id: string | number | null,
    result: any,
    error?: any
  ): void {
    const response: JSONRPCResponse = {
      jsonrpc: "2.0",
      id: id !== null ? id : undefined,
    };

    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }

    const message = JSON.stringify(response) + "\n";
    process.stdout.write(message);
  }

  /**
   * Send notification
   */
  sendNotification(method: string, params?: any): void {
    const notification: JSONRPCNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const message = JSON.stringify(notification) + "\n";
    process.stdout.write(message);
  }

  /**
   * Log to stderr
   */
  log(message: string): void {
    process.stderr.write(`[${this.serverInfo.name}] ${message}\n`);
  }
}
