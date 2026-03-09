import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

const MODEL_IDS: Record<string, string> = {
  "claude-sonnet": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "claude-opus":   "anthropic.claude-3-opus-20240229-v1:0",
};

function getBedrockClient() {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/chat", async (req: Request, res: Response) => {
    const { messages, model = "claude-sonnet", maxTokens = 4096 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({
        error: "AWS credentials not configured. Please add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION to your environment secrets.",
      });
    }

    const modelId = MODEL_IDS[model] || MODEL_IDS["claude-sonnet"];

    const formattedMessages = messages.slice(-5).map((msg: { role: string; content: string }) => ({
      role: msg.role,
      content: msg.content,
    }));

    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      messages: formattedMessages,
    };

    const client = getBedrockClient();
    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody),
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      const response = await client.send(command);

      if (!response.body) {
        res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
        res.end();
        return;
      }

      for await (const event of response.body) {
        if (event.chunk?.bytes) {
          const decoded = new TextDecoder().decode(event.chunk.bytes);
          const parsed = JSON.parse(decoded);

          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
          } else if (parsed.type === "message_stop") {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        }
      }

      res.end();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Bedrock error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message || "Bedrock API error" })}\n\n`);
      res.end();
    }
  });

  return httpServer;
}
