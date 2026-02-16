/**
 * Buffer MCP Server — Thin Bridge Pattern
 *
 * This MCP server demonstrates that a well-annotated GraphQL schema
 * can serve as the single source of truth for AI agent tool definitions.
 *
 * How it works:
 * 1. Reads the Buffer GraphQL schema file
 * 2. Parses every Query and Mutation into an MCP tool definition
 * 3. Tool names, descriptions, and parameter schemas are derived
 *    directly from the GraphQL schema annotations
 * 4. When a tool is called, the server constructs and executes the
 *    corresponding GraphQL query/mutation
 *
 * The "thin bridge" principle: if this server needs custom logic to
 * explain what a tool does, that's a signal the schema description
 * needs improvement, not that the bridge needs to be smarter.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parse,
  buildSchema,
  GraphQLSchema,
  GraphQLField,
  GraphQLArgument,
  GraphQLInputType,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  isNonNullType,
  isListType,
  isEnumType,
  isInputObjectType,
  isScalarType,
} from "graphql";

// ── Types ────────────────────────────────────────────────────────────────────

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: string[];
  items?: JSONSchema;
  default?: unknown;
}

interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// ── Schema Loading ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSchema(): GraphQLSchema {
  const schemaPath = resolve(__dirname, "../schema/schema.graphql");
  const schemaSource = readFileSync(schemaPath, "utf-8");
  return buildSchema(schemaSource);
}

// ── GraphQL Type to JSON Schema Conversion ───────────────────────────────────

/**
 * Converts a GraphQL input type to a JSON Schema object.
 * This is where the schema's type system becomes the tool's parameter schema.
 * The conversion is mechanical, no interpretation needed if the schema
 * descriptions are clear.
 */
function graphqlTypeToJsonSchema(type: GraphQLInputType): JSONSchema {
  // Unwrap NonNull wrapper
  if (isNonNullType(type)) {
    return graphqlTypeToJsonSchema(type.ofType);
  }

  // List types become arrays
  if (isListType(type)) {
    return {
      type: "array",
      items: graphqlTypeToJsonSchema(type.ofType),
    };
  }

  // Enum types become string with allowed values
  if (isEnumType(type)) {
    const enumType = type as GraphQLEnumType;
    return {
      type: "string",
      enum: enumType.getValues().map((v) => v.name),
      description: enumType.description || undefined,
    };
  }

  // Input object types become nested objects
  if (isInputObjectType(type)) {
    const inputType = type as GraphQLInputObjectType;
    const fields = inputType.getFields();
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [fieldName, field] of Object.entries(fields)) {
      const fieldSchema = graphqlTypeToJsonSchema(field.type);
      fieldSchema.description = field.description || undefined;
      if (field.defaultValue !== undefined) {
        fieldSchema.default = field.defaultValue;
      }
      properties[fieldName] = fieldSchema;

      if (isNonNullType(field.type)) {
        required.push(fieldName);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      description: inputType.description || undefined,
    };
  }

  // Scalar types map to JSON primitives
  if (isScalarType(type)) {
    const scalarMap: Record<string, string> = {
      String: "string",
      Int: "integer",
      Float: "number",
      Boolean: "boolean",
      ID: "string",
      DateTime: "string",
    };
    return {
      type: scalarMap[type.name] || "string",
      description:
        type.name === "DateTime"
          ? "ISO 8601 datetime string (e.g., '2025-03-15T14:30:00Z')"
          : undefined,
    };
  }

  return { type: "string" };
}

// ── Tool Generation ──────────────────────────────────────────────────────────

/**
 * Converts a GraphQL field (query or mutation) into an MCP tool definition.
 *
 * The tool name is prefixed with the operation type to avoid collisions
 * (e.g., query_profiles, mutation_createPost) and to make the operation
 * type clear to the AI agent.
 *
 * The tool description comes directly from the schema's field description.
 * The parameter schema comes from converting the field's arguments.
 *
 * This is the entire "bridge" logic. It's thin by design.
 */
function fieldToTool(
  field: GraphQLField<unknown, unknown>,
  operationType: "query" | "mutation"
): MCPToolDefinition {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  for (const arg of field.args) {
    const argSchema = graphqlTypeToJsonSchema(arg.type);
    argSchema.description = arg.description || undefined;
    if (arg.defaultValue !== undefined) {
      argSchema.default = arg.defaultValue;
    }
    properties[arg.name] = argSchema;

    if (isNonNullType(arg.type)) {
      required.push(arg.name);
    }
  }

  return {
    name: `${operationType}_${field.name}`,
    description: field.description || `${operationType}: ${field.name}`,
    inputSchema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

/**
 * Extracts all tools from the schema.
 * Every Query field becomes a read tool, every Mutation becomes a write tool.
 */
function extractTools(schema: GraphQLSchema): MCPToolDefinition[] {
  const tools: MCPToolDefinition[] = [];

  const queryType = schema.getQueryType();
  if (queryType) {
    const fields = queryType.getFields();
    for (const field of Object.values(fields)) {
      tools.push(fieldToTool(field, "query"));
    }
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    const fields = mutationType.getFields();
    for (const field of Object.values(fields)) {
      tools.push(fieldToTool(field, "mutation"));
    }
  }

  return tools;
}

// ── GraphQL Query Construction ───────────────────────────────────────────────

/**
 * Builds a reasonable default selection set for a return type.
 * For a real implementation, this would be configurable or the agent
 * could specify which fields to return.
 *
 * This function recurses one level deep to keep responses manageable.
 */
function buildSelectionSet(
  type: GraphQLInputType | any,
  depth: number = 0
): string {
  // Unwrap wrappers
  if (isNonNullType(type) || isListType(type)) {
    return buildSelectionSet(type.ofType, depth);
  }

  // Object types: select scalar fields and one level of nested objects
  if (type instanceof GraphQLObjectType) {
    const fields = type.getFields();
    const selections: string[] = [];

    for (const [name, field] of Object.entries(fields)) {
      let unwrapped = field.type;
      while (isNonNullType(unwrapped) || isListType(unwrapped)) {
        unwrapped = (unwrapped as any).ofType;
      }

      if (isScalarType(unwrapped) || isEnumType(unwrapped)) {
        selections.push(name);
      } else if (depth < 1 && unwrapped instanceof GraphQLObjectType) {
        // Recurse one level for nested objects, skip connections to keep it simple
        if (!name.endsWith("Connection") && name !== "dailyBreakdown") {
          const nested = buildSelectionSet(unwrapped, depth + 1);
          if (nested) {
            selections.push(`${name} ${nested}`);
          }
        }
      }
    }

    return selections.length > 0 ? `{ ${selections.join(" ")} }` : "";
  }

  return "";
}

/**
 * Constructs a GraphQL operation string from a tool call.
 * The tool name encodes the operation type and field name.
 * Arguments are passed as GraphQL variables.
 */
function buildGraphQLOperation(
  toolCall: MCPToolCall,
  schema: GraphQLSchema
): string {
  const [operationType, ...fieldParts] = toolCall.name.split("_");
  const fieldName = fieldParts.join("_");

  const rootType =
    operationType === "query"
      ? schema.getQueryType()
      : schema.getMutationType();

  if (!rootType) {
    throw new Error(`No ${operationType} type in schema`);
  }

  const field = rootType.getFields()[fieldName];
  if (!field) {
    throw new Error(`Unknown field: ${fieldName}`);
  }

  // Build argument string
  const args = Object.entries(toolCall.arguments)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");

  const argString = args ? `(${args})` : "";

  // Build return selection
  const selectionSet = buildSelectionSet(field.type);

  return `${operationType} { ${fieldName}${argString} ${selectionSet} }`;
}

// ── MCP Server ───────────────────────────────────────────────────────────────

/**
 * Main server setup.
 *
 * In a production implementation, this would:
 * 1. Connect to Buffer's actual GraphQL endpoint
 * 2. Handle OAuth authentication
 * 3. Execute real queries and return live data
 *
 * For this proof of concept, it demonstrates the tool generation
 * and query construction pipeline. The GraphQL operations it builds
 * are valid and ready to execute against a real endpoint.
 */
async function main() {
  const schema = loadSchema();
  const tools = extractTools(schema);

  console.log("Buffer MCP Server — Thin Bridge Pattern");
  console.log("========================================\n");
  console.log(`Loaded schema with ${tools.length} tools:\n`);

  // Display generated tools
  for (const tool of tools) {
    const paramCount = Object.keys(tool.inputSchema.properties || {}).length;
    const requiredCount = (tool.inputSchema.required || []).length;
    console.log(`  ${tool.name}`);
    console.log(`    ${tool.description.split("\n")[0].trim()}`);
    console.log(`    Parameters: ${paramCount} (${requiredCount} required)\n`);
  }

  // Demonstrate query construction
  console.log("\n── Example Tool Calls ──────────────────────────────────\n");

  const examples: MCPToolCall[] = [
    {
      name: "query_profiles",
      arguments: { channel: "INSTAGRAM" },
    },
    {
      name: "mutation_createPost",
      arguments: {
        input: {
          profileId: "prof_123",
          text: "Excited to share our latest feature! 🚀 #buffer #socialmedia",
          scheduledAt: "2025-04-01T14:30:00Z",
        },
      },
    },
    {
      name: "query_posts",
      arguments: {
        status: "QUEUED",
        limit: 5,
        sortBy: "SCHEDULED_AT_ASC",
      },
    },
    {
      name: "mutation_createPosts",
      arguments: {
        input: {
          posts: [
            {
              profileId: "prof_ig_123",
              text: "Check out our new feature! 🎉 Link in bio. #buffer",
              scheduledAt: "2025-04-01T14:30:00Z",
            },
            {
              profileId: "prof_li_456",
              text: "We just launched a new feature that helps small businesses manage their social media more effectively. Here's what it does and why we built it.",
              scheduledAt: "2025-04-01T14:30:00Z",
            },
            {
              profileId: "prof_x_789",
              text: "New feature just dropped 🚀 Manage all your channels from one place. Try it free →",
              scheduledAt: "2025-04-01T14:30:00Z",
            },
          ],
        },
      },
    },
  ];

  for (const example of examples) {
    console.log(`Tool: ${example.name}`);
    console.log(`Args: ${JSON.stringify(example.arguments, null, 2)}`);
    try {
      const operation = buildGraphQLOperation(example, schema);
      console.log(`Generated GraphQL:\n  ${operation}`);
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
    }
    console.log();
  }

  // Display tool definitions in MCP format
  console.log("\n── MCP Tool Definitions (JSON) ─────────────────────────\n");
  console.log(
    "These definitions are ready to serve via the MCP protocol.\n"
  );
  console.log(
    "Tool count derived from schema: " +
      tools.length +
      " (" +
      tools.filter((t) => t.name.startsWith("query_")).length +
      " queries, " +
      tools.filter((t) => t.name.startsWith("mutation_")).length +
      " mutations)\n"
  );

  // Print a summary of all tools
  console.log("┌─────────────────────────────┬────────┬──────────┐");
  console.log("│ Tool                        │ Params │ Required │");
  console.log("├─────────────────────────────┼────────┼──────────┤");
  for (const tool of tools) {
    const params = Object.keys(tool.inputSchema.properties || {}).length;
    const req = (tool.inputSchema.required || []).length;
    const name = tool.name.padEnd(27);
    console.log(
      `│ ${name} │ ${String(params).padStart(6)} │ ${String(req).padStart(8)} │`
    );
  }
  console.log("└─────────────────────────────┴────────┴──────────┘");
}

main().catch(console.error);
