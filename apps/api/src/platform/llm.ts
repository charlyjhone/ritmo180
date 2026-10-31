// Porta de IA. O produto continua funcionando sem ela: quem chama trata o null e a falha.
import Anthropic from "@anthropic-ai/sdk";

export interface LlmRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface Llm {
  json<T>(request: LlmRequest): Promise<T>;
}

export const LLM_MODEL = process.env.RITMO_MODEL || "claude-opus-5-5";

export function createClaudeLlm(): Llm | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const client = new Anthropic();
  return {
    async json<T>({ system, prompt, schema, maxTokens = 16_000 }: LlmRequest): Promise<T> {
      const response = await client.beta.messages.create({
        model: LLM_MODEL,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        output_config: { effort: "medium", format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      } as never);
      const message = response as unknown as Anthropic.Message;
      if (message.stop_reason === "refusal") throw new Error("A IA recusou o pedido.");
      if (message.stop_reason === "max_tokens") throw new Error("A resposta da IA foi cortada.");
      const text = message.content.find((block) => block.type === "text");
      if (!text || text.type !== "text") throw new Error("A IA não devolveu texto.");
      return JSON.parse(text.text) as T;
    },
  };
}
