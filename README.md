# MCP for MySQL

Native MySQL MCP server with zero external SDK dependencies.

## Installation

```bash
npm install mcp-for-mysql
```

Or use directly with npx:

```bash
npx mcp-for-mysql
```

## Configuration

Add to `.kiro/settings/mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["mcp-for-mysql"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASS": "your_password",
        "MYSQL_DB": "your_database",
        "MYSQL_MODE": "readonly",
        "MYSQL_ALLOW_DDL": "false"
      },
      "autoApprove": ["list_databases", "list_tables", "describe_table"]
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_HOST` | `localhost` | Database host |
| `MYSQL_PORT` | `3306` | Database port |
| `MYSQL_USER` | `root` | Username |
| `MYSQL_PASS` | `(empty)` | Password |
| `MYSQL_DB` | `(empty)` | Default database |
| `MYSQL_MODE` | `readonly` | `readonly` or `readwrite` |
| `MYSQL_ALLOW_DDL` | `false` | Enable DDL operations (requires `readwrite` mode) |

## Available Tools

| Tool | Description |
|------|-------------|
| `mysql_query` | Execute SQL (write ops need readwrite mode) |
| `switch_database` | Switch database |
| `list_databases` | List all databases |
| `list_tables` | List tables in current database |
| `describe_table` | Show table structure |
| `execute_ddl` | Execute DDL statements (requires `MYSQL_ALLOW_DDL=true` and `readwrite` mode) |

## Auto-Approve Configuration

The `autoApprove` field allows certain tools to execute without manual confirmation. Recommended settings:

| Mode | autoApprove |
|------|-------------|
| **Safe read-only** | `["list_databases", "list_tables", "describe_table"]` |
| **All reads** | `["list_databases", "list_tables", "describe_table", "mysql_query"]` |
| **Full trust** | `["*"]` |

> ⚠️ **Warning**: Adding `execute_ddl` or `mysql_query` (in readwrite mode) to `autoApprove` may result in unintended data changes.

## Usage Examples

```javascript
// Query
mysql_query("SELECT * FROM users LIMIT 10")

// Switch database
switch_database("test_db")

// List tables
list_tables()

// Describe table
describe_table("users")

// DDL operations (requires MYSQL_ALLOW_DDL=true and MYSQL_MODE=readwrite)
execute_ddl("CREATE TABLE test (id INT PRIMARY KEY, name VARCHAR(100))")
execute_ddl("ALTER TABLE users ADD COLUMN age INT")
execute_ddl("DROP TABLE test")
```

## Modes

| Mode | DML (INSERT/UPDATE/DELETE) | DDL (CREATE/ALTER/DROP/TRUNCATE/RENAME) |
|------|---------------------------|----------------------------------------|
| **readonly** | ❌ 禁止 | ❌ 禁止 |
| **readwrite** | ✅ 允许 | ❌ 禁止（需额外设置 `MYSQL_ALLOW_DDL=true`） |
| **readwrite + allowDDL** | ✅ 允许 | ✅ 允许 |

**权限配置示例：**

```json
// 只读模式 - 只能查询
{ "MYSQL_MODE": "readonly" }

// 读写模式 - 可查询和修改数据
{ "MYSQL_MODE": "readwrite" }

// 完全权限 - 可查询、修改数据、执行 DDL
{ "MYSQL_MODE": "readwrite", "MYSQL_ALLOW_DDL": "true" }
```

## License

MIT
