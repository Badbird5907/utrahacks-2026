export interface ToolCall {
  toolCallId: string;
  toolName: string;
  state?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  dynamic?: boolean;
}

export interface ToolOutput {
  tool: string;
  toolCallId: string;
  output?: unknown;
  state?: "output-available" | "output-error";
  errorText?: string;
}

export type AddToolOutput = (output: ToolOutput) => void;
