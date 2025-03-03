import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "../"
import { ApiHandlerOptions, ModelInfo, elvexModelInfoSaneDefaults } from "../../shared/api"
import { ApiStream } from "../transform/stream"

export class ElvexHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private baseUrl: string

	constructor(options: ApiHandlerOptions) {
		this.options = options
		this.baseUrl = `https://api.elvex.ai/v0/apps/${this.options.elvexAppId}/versions/${this.options.elvexVersion}/text/stream`
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		if (!this.options.elvexApiKey || !this.options.elvexAppId || !this.options.elvexVersion) {
			throw new Error("Elvex API key, app ID, and version are required")
		}

		const fullPrompt = `${systemPrompt}\n\n${messages
			.map(msg => {
				if ('role' in msg) {
					return `${msg.role === 'assistant' ? 'Assistant' : 'Human'}: ${msg.content}`
				}
				return ''
			})
			.join('\n')}`

		const response = await fetch(this.baseUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream',
				'Authorization': `Bearer ${this.options.elvexApiKey}`,
			},
			body: JSON.stringify({
				prompt: fullPrompt,
			}),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Elvex API request failed: ${response.status} ${errorText}`)
		}

		if (!response.body) {
			throw new Error('No response body received from Elvex API')
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split('\n')
				buffer = lines.pop() || '' // Keep the last incomplete line in the buffer

				for (const line of lines) {
					if (line.trim() === '') continue
					try {
						const data = JSON.parse(line)
						if (data.delta) {
							yield {
								type: "text",
								text: data.delta,
							}
						}
					} catch (e) {
						console.warn('Failed to parse SSE data:', line)
					}
				}
			}
			// Handle any remaining data in the buffer
			if (buffer.trim()) {
				try {
					const data = JSON.parse(buffer)
					if (data.delta) {
						yield {
							type: "text",
							text: data.delta,
						}
					}
				} catch (e) {
					console.warn('Failed to parse remaining SSE data:', buffer)
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: `${this.options.elvexAppId}@${this.options.elvexVersion}`,
			info: elvexModelInfoSaneDefaults,
		}
	}
}
