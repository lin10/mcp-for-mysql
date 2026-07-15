#!/usr/bin/env node

import mysql from "mysql2/promise";
import { MCPServer, CallToolResult } from "./protocol.js";

/**
 * Configuration interface
 */
interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  mode: "readonly" | "readwrite";
  allowDDL: boolean;
}

/**
 * Load configuration from environment variables
 */
function loadConfig(): MySQLConfig {
  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: parseInt(process.env.MYSQL_PORT || "3306"),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASS || "",
    database: process.env.MYSQL_DB,
    mode: (process.env.MYSQL_MODE as "readonly" | "readwrite") || "readonly",
    allowDDL: process.env.MYSQL_ALLOW_DDL === "true",
  };
}

/**
 * MySQL MCP Server
 */
class MySQLMCPServer {
  private mcp: MCPServer;
  private connection: mysql.Connection | null = null;
  private config: MySQLConfig;

  constructor() {
    this.config = loadConfig();

    // Create MCP server
    this.mcp = new MCPServer(
      {
        name: "mcp-for-mysql",
        version: "1.0.0",
      },
      {
        tools: {},
      }
    );

    this.registerTools();
    this.mcp.log(`MySQL MCP Server initialized (mode: ${this.config.mode}, allowDDL: ${this.config.allowDDL})`);
  }

  /**
   * Ensure database connection
   */
  private async ensureConnection(): Promise<mysql.Connection> {
    if (!this.connection) {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        multipleStatements: false,
      });
      this.mcp.log(
        `Connected to MySQL at ${this.config.host}:${this.config.port}`
      );
    }
    return this.connection;
  }

  /**
   * Register all tools
   */
  private registerTools(): void {
    // 1. mysql_query - Execute SQL queries
    this.mcp.registerTool(
      {
        name: "mysql_query",
        description:
          "Execute SQL statements (write operations require readwrite mode)",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "SQL statement to execute",
            },
            params: {
              type: "array",
              description:
                "Query parameters (optional, for parameterized queries)",
              items: { type: ["string", "number", "boolean", "null"] },
            },
          },
          required: ["sql"],
        },
      },
      async (args) => this.handleQuery(args)
    );

    // 2. switch_database - Switch database
    this.mcp.registerTool(
      {
        name: "switch_database",
        description: "Switch to a different database",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name to switch to",
            },
          },
          required: ["database"],
        },
      },
      async (args) => this.handleSwitchDatabase(args)
    );

    // 3. list_databases - List all databases
    this.mcp.registerTool(
      {
        name: "list_databases",
        description: "List all databases",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      async () => this.handleListDatabases()
    );

    // 4. list_tables - List all tables
    this.mcp.registerTool(
      {
        name: "list_tables",
        description: "List all tables in the current database",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description:
                "Database name (optional, uses current database if not specified)",
            },
          },
        },
      },
      async (args) => this.handleListTables(args)
    );

    // 5. describe_table - Describe table structure
    this.mcp.registerTool(
      {
        name: "describe_table",
        description: "Show table structure",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
          },
          required: ["table"],
        },
      },
      async (args) => this.handleDescribeTable(args)
    );

    // 6. execute_ddl - Execute DDL statements
    this.mcp.registerTool(
      {
        name: "execute_ddl",
        description:
          "Execute DDL statements (CREATE, ALTER, DROP, TRUNCATE, RENAME). Requires readwrite mode.",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "DDL statement to execute (CREATE, ALTER, DROP, TRUNCATE, RENAME)",
            },
          },
          required: ["sql"],
        },
      },
      async (args) => this.handleDDL(args)
    );
  }

  /**
   * Handle mysql_query
   */
  private async handleQuery(args: any): Promise<CallToolResult> {
    try {
      const { sql, params = [] } = args;
      const upperSQL = sql.trim().toUpperCase();

      // Check write operations in readonly mode (DML only)
      if (this.config.mode === "readonly") {
        const dmlKeywords = ["INSERT", "UPDATE", "DELETE"];
        if (dmlKeywords.some(keyword => upperSQL.startsWith(keyword))) {
          throw new Error(
            "DML operations are not allowed in readonly mode. Set MYSQL_MODE=readwrite to enable."
          );
        }
      }

      // Check DDL operations (requires separate permission)
      const ddlKeywords = ["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME"];
      if (ddlKeywords.some(keyword => upperSQL.startsWith(keyword))) {
        if (!this.config.allowDDL) {
          throw new Error(
            "DDL operations are not allowed. Set MYSQL_ALLOW_DDL=true to enable."
          );
        }
        if (this.config.mode === "readonly") {
          throw new Error(
            "DDL operations require readwrite mode. Set MYSQL_MODE=readwrite."
          );
        }
      }

      const conn = await this.ensureConnection();
      const [rows] = await conn.execute(sql, params);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle switch_database
   */
  private async handleSwitchDatabase(args: any): Promise<CallToolResult> {
    try {
      const { database } = args;
      const conn = await this.ensureConnection();
      await conn.query(`USE \`${database}\``);

      this.config.database = database;

      return {
        content: [
          {
            type: "text",
            text: `Successfully switched to database: ${database}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle list_databases
   */
  private async handleListDatabases(): Promise<CallToolResult> {
    try {
      const conn = await this.ensureConnection();
      const [rows] = await conn.query("SHOW DATABASES");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle list_tables
   */
  private async handleListTables(args: any): Promise<CallToolResult> {
    try {
      const { database } = args;
      const conn = await this.ensureConnection();

      let sql = "SHOW TABLES";
      if (database) {
        sql = `SHOW TABLES FROM \`${database}\``;
      }

      const [rows] = await conn.query(sql);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle describe_table
   */
  private async handleDescribeTable(args: any): Promise<CallToolResult> {
    try {
      const { table } = args;
      const conn = await this.ensureConnection();
      const [rows] = await conn.query(`DESCRIBE \`${table}\``);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle execute_ddl
   */
  private async handleDDL(args: any): Promise<CallToolResult> {
    try {
      const { sql } = args;
      const upperSQL = sql.trim().toUpperCase();

      // Check if DDL is allowed
      if (!this.config.allowDDL) {
        return {
          content: [
            {
              type: "text",
              text: "Error: DDL operations are disabled. Set MYSQL_ALLOW_DDL=true to enable.",
            },
          ],
          isError: true,
        };
      }

      // Check if in readwrite mode
      if (this.config.mode === "readonly") {
        return {
          content: [
            {
              type: "text",
              text: "Error: DDL operations require readwrite mode. Set MYSQL_MODE=readwrite.",
            },
          ],
          isError: true,
        };
      }

      // Validate that this is a DDL statement
      const ddlKeywords = ["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME"];
      const isDDL = ddlKeywords.some(keyword => upperSQL.startsWith(keyword));

      if (!isDDL) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Invalid DDL statement. Only ${ddlKeywords.join(", ")} statements are allowed.`,
            },
          ],
          isError: true,
        };
      }

      const conn = await this.ensureConnection();
      const [result] = await conn.query(sql);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "DDL statement executed successfully",
                result: result,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
}

// Start server
new MySQLMCPServer();
