import { openai } from '@ai-sdk/openai';
import {
    streamText,
    type CoreMessage,
    type StreamTextResult,
    type StreamTextOnFinishCallback,
    type StreamTextOnErrorCallback,
    type StreamTextOnStepFinishCallback,
    type StreamTextOnChunkCallback,
    type TextStreamPart,
    type StepResult,
    generateText
} from 'ai';
import { tools } from '../chat/tools';
import { classifyUserMission, getMissionSystemPrompt, getDefaultSystemPrompt, UserInfo } from '../chat/mission-router';
import { enhancedSearchKnowledgeEmbeddings } from '../../services/vectorStore';

/**
 * Classify user message using AI
 */
export async function classifyMessage(
    message: string,
    userInfo: UserInfo
) {
    return await classifyUserMission(message, userInfo);
}

/**
 * Enhance user query with RAG technology
 * Retrieve relevant knowledge from vector database
 */
async function enhanceWithRAG(
    userQuery: string,
    systemPrompt: string
): Promise<string> {
    try {
        // Use enhanced vector search to find knowledge related to the user's question
        // This better handles cross-language searches (e.g., Chinese queries for English content)
        const relevantKnowledge = await enhancedSearchKnowledgeEmbeddings(
            userQuery,
            3,  // Return up to 3 records
            0.3  // Lower similarity threshold for cross-language searches
        );
        
        if (relevantKnowledge.length === 0) {
            console.log('No relevant knowledge found for query:', userQuery);
            return systemPrompt;
        }

        // Construct enhanced system prompt
        const knowledgeSection = `
## Relevant Knowledge Base Content
The following information from our knowledge base is relevant to the user's question. Please reference this content in your response:

${relevantKnowledge.map((item, i) => `
### ${i + 1}. ${item.title || 'Knowledge Item'} (Similarity: ${(item.similarity * 100).toFixed(2)}%)
${item.content || 'No content'}
`).join('\n')}

Please base your answer on the above knowledge. If the knowledge content is insufficient to completely answer the question, please acknowledge this and provide the information you do know.
`;

        // Add knowledge content to system prompt
        const enhancedPrompt = systemPrompt + knowledgeSection;
        console.log(`Enhanced system prompt with ${relevantKnowledge.length} knowledge records`);
        
        return enhancedPrompt;
    } catch (error) {
        console.error('Error enhancing with RAG:', error);
        return systemPrompt; // Return original prompt on error
    }
}

/**
 * Detect if user message is a general question rather than task-related
 */
async function isGeneralQuestion(message: string): Promise<boolean> {
    try {
        const completion = await generateText({
            model: openai('gpt-4o-mini'),
            messages: [
                {
                    role: 'system',
                    content: `Your task is to determine if the user's message is a general question.
                    Characteristics of general questions: seeking information, asking about concepts, requesting explanation, technical questions, etc.
                    Characteristics of task-related messages: expressing intent to complete a task, requesting specific operation guidance, submitting task results, etc.
                    Return only "true" or "false", where true means it's a general question, false means it's a task-related message.`,
                },
                {
                    role: 'user',
                    content: message,
                },
            ],
        });

        // generateText returns the text content directly, not an object
        return completion.text.toLowerCase() === 'true';
    } catch (error) {
        console.error('Error detecting if message is a general question:', error);
        return false; // Default to assuming it's not a general question
    }
}

/**
 * Generate AI response stream
 */
export async function generateAIResponseStream(
    messages: CoreMessage[],
    userInfo: UserInfo,
    classifiedMissionId: string | null
): Promise<StreamTextResult<typeof tools, unknown>> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
    }

    // Extract the user query from the last user message
    const userQuery = extractUserQuery(messages);
     
    let systemPrompt;
    if (classifiedMissionId) {
        systemPrompt = await getMissionSystemPrompt(classifiedMissionId, userInfo);
    } else {
        systemPrompt = await getDefaultSystemPrompt(userInfo);
    }

     // Detect if it's a general question
    const isGeneralQA = userQuery ? await isGeneralQuestion(userQuery) : false;
    // For general questions, enhance system prompt with RAG
    if (isGeneralQA) {
        systemPrompt = await enhanceWithRAG(userQuery, systemPrompt);
    }

    // Define streamText options with inline callbacks and exact types
    const streamOptions = {
        model: openai('gpt-4o-mini'),
        messages,
        tools,
        system: systemPrompt,
        maxSteps: 50,
        toolChoice: 'auto' as const,
        onStart: () => {
            //console.log('[AI Stream] Started.');
        },
        onFinish: ((event: Omit<StepResult<typeof tools>, 'stepType' | 'isContinued'> & { readonly steps: StepResult<typeof tools>[]; }) => {
            console.log('[AI Stream] Completed. Finish Reason:', event.finishReason, event.usage, event.steps);
        }) as StreamTextOnFinishCallback<typeof tools>,
        onError: ((event: { error: unknown }) => {
            console.error('[AI Stream] Error:', event.error);
        }) as StreamTextOnErrorCallback,
        onStepFinish: ((stepResult: StepResult<typeof tools>) => {
            console.log('[AI Stream] Step Finished. Request sent to LLM:', JSON.stringify(stepResult.request, null, 2));
            // Log tool calls and results at the end of the step if needed
            if (stepResult.toolCalls.length > 0) {
                console.log('[AI Stream] Step Tool Calls:', JSON.stringify(stepResult.toolCalls, null, 2));
            }
            if (stepResult.toolResults.length > 0) {
                console.log('[AI Stream] Step Tool Results:', JSON.stringify(stepResult.toolResults, null, 2));
            }
        }) as StreamTextOnStepFinishCallback<typeof tools>,
        onChunk: ((event: { chunk: TextStreamPart<typeof tools> }) => {
            switch (event.chunk.type) {
                case 'tool-call':
                    console.log('[AI Stream] Chunk: Tool Call:', JSON.stringify(event.chunk, null, 2));
                    break;
                case 'tool-call-streaming-start':
                    console.log('[AI Stream] Chunk: Tool Call Streaming Start:', JSON.stringify(event.chunk, null, 2));
                    break;
                case 'tool-call-delta':
                    // This might be too verbose, log selectively if needed
                    // console.log('[AI Stream] Chunk: Tool Call Delta:', JSON.stringify(event.chunk, null, 2));
                    break;
                case 'tool-result':
                    console.log('[AI Stream] Chunk: Tool Result:', JSON.stringify(event.chunk, null, 2));
                    break;
            }
        }) as StreamTextOnChunkCallback<typeof tools>,
    };

    return await streamText(streamOptions);
}

/**
 * Generate AI response text (non-streaming)
 */
export async function generateAIResponse(
    messages: CoreMessage[],
    userInfo: UserInfo,
    classifiedMissionId: string | null
): Promise<string> {
    const stream = await generateAIResponseStream(messages, userInfo, classifiedMissionId);
    let fullText = '';
    
    // Use stream.textStream iterator to collect text
    for await (const chunk of stream.textStream) {
        fullText += chunk;
    }
    
    return fullText;
} 

function extractUserQuery(messages: CoreMessage[]): string {
    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    // Extract text content from user message
    let userQuery = '';
    if (lastUserMessage && typeof lastUserMessage.content === 'string') {
        userQuery = lastUserMessage.content;
    } else if (lastUserMessage && Array.isArray(lastUserMessage.content)) {
        // If content is an array, extract all text parts
        userQuery = lastUserMessage.content
            .filter(part => typeof part === 'object' && 'type' in part && part.type === 'text')
            .map(part => (part as { text: string }).text)
            .join(' ');
    }

    return userQuery;
}