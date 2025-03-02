import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { ApiHandler } from "../"
import { ApiHandlerOptions, ModelInfo, elvexModelInfoSaneDefaults } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

export class ElvexHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		this.options = options
		this.client = new OpenAI({
			baseURL: `https://api.elvex.ai/v0/apps/${this.options.elvexAppId}/versions/${this.options.elvexVersion}`,
			apiKey: this.options.elvexApiKey || "",
		})
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		if (!this.options.elvexApiKey || !this.options.elvexAppId || !this.options.elvexVersion) {
			throw new Error("Elvex API key, app ID, and version are required")
		}

		const stream = await this.client.chat.completions.create({
			model: "default", // Elvex doesn't require a model parameter
			messages: [{ role: "system" as const, content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
		})

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: `${this.options.elvexAppId}@${this.options.elvexVersion}`,
			info: elvexModelInfoSaneDefaults,
		}
	}
}
