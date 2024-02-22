import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableBranch, RunnableLambda, RunnableMap, RunnablePassthrough, RunnableSequence } from 'langchain/runnables';
import { ChatPromptTemplate, PromptTemplate } from 'langchain/prompts';
import { ChatCloudflareWorkersAI, CloudflareWorkersAI, CloudflareWorkersAIEmbeddings, CloudflareVectorizeStore } from "@langchain/cloudflare";
import { Ai } from '@cloudflare/ai'
import { HydeRetriever } from 'langchain/retrievers/hyde';
import { Bindings, createHonoApp } from "../honoApp";
import { Document } from "langchain/document";
import { stream, streamText } from 'hono/streaming'
/**
 * RAG api
 */
export const ragApp = createHonoApp()


const initModels = (bindings: Bindings, indexName: keyof Pick<Bindings, 'VECTORIZE_GENERAL_INDEX' | 'VECTORIZE_SESSIONS_INDEX'> = 'VECTORIZE_GENERAL_INDEX') => {
    const embeddings = new CloudflareWorkersAIEmbeddings({
      binding: bindings.AI,
      modelName: "@cf/baai/bge-large-en-v1.5",
    });
    const vectorStore = new CloudflareVectorizeStore(embeddings, {
      index: bindings[indexName]
    });
    const llmCloudflare = new CloudflareWorkersAI({
      model: "@cf/meta/llama-2-7b-chat-int8",
      cloudflareAccountId: bindings.CLOUDFLARE_ACCOUNT_ID,
      cloudflareApiToken: bindings.CLOUDFLARE_API_TOKEN,
    });
    const chatCloudflare = new ChatCloudflareWorkersAI({
      model: "@hf/thebloke/neural-chat-7b-v3-1-awq",
      cloudflareAccountId: bindings.CLOUDFLARE_ACCOUNT_ID,
      cloudflareApiToken: bindings.CLOUDFLARE_API_TOKEN,
      cache: false,
    });

    return {
        embeddings,
        vectorStore,
        llm: llmCloudflare,
        chat: chatCloudflare,
    }
}

function distinctDocuments(documents: Array<Document>): Array<Document> {
    const uniqueArticles: Array<Document> = [];
    const seenIds = new Set();
  
    for (const article of documents) {
      if (!seenIds.has(article.metadata.id)) {
        uniqueArticles.push(article);
        seenIds.add(article.metadata.id);
      }
    }
  
    return uniqueArticles;
  }
  
const createJapaneseTranslationChain = (bindings: Pick<Bindings, 'AI'>) => {
    const ai = new Ai(bindings.AI);
    const japaneseTranslationChain = RunnableSequence.from([
      {
        question: input => input.answer,
      },
      new RunnableLambda({
        func: async (input) => {
          console.log(input)
          const { translated_text: translatedQuestion } = await ai.run('@cf/meta/m2m100-1.2b', {
              text: input.question,
              source_lang: "english", // defaults to english
              target_lang: "japanese"
            }
          );
          return translatedQuestion
        }
      }),
      new StringOutputParser()
    ])
    return japaneseTranslationChain
}



const createGeneralChain = (bindings: Bindings) => {
  const {
      vectorStore,
      llm,
      chat
  } = initModels(bindings, 'VECTORIZE_GENERAL_INDEX')
  const retriever = new HydeRetriever({
    vectorStore,
    llm,
    k: 20,
  });
  const generateAnswerChain = RunnableSequence.from([
    {
      context: async input => {
          const relevantDocuments = await retriever.getRelevantDocuments(input.question)
          return relevantDocuments
      },
      question: input => input.question,
    },
    RunnableMap.from({
      sessions: input => {
          const sessions = distinctDocuments(input.context)
          return sessions.map((session: Document) => {
              return session.metadata
          })
      },
      answer: RunnableSequence.from([{
              context: input => input.context.map((sesison: Document) => sesison.pageContent).join('\n'),
              question: input => input.question,
          },
          ChatPromptTemplate.fromMessages([
          [
              "system",
              `Use the following pieces of context to answer the question at the end.
              If you don't know the answer, just say that you don't know, don't try to make up an answer.
              Use three sentences maximum and keep the answer as concise as possible.
              Always say "thanks for asking!" at the end of the answer.
              
              {context}`],
          ["human", "{question}"],
          ]),
          chat,
          new StringOutputParser()
      ])
    }),
  ])
  return generateAnswerChain
}

const createSessionChain = (bindings: Bindings) => {
    const {
        vectorStore,
        llm,
        chat
    } = initModels(bindings, 'VECTORIZE_SESSIONS_INDEX')
    const retriever = new HydeRetriever({
      vectorStore,
      llm,
      k: 10,
    });
    const generateAnswerChain = RunnableSequence.from([
      {
        context: async input => {
            const relevantDocuments = await retriever.getRelevantDocuments(input.question)
            return relevantDocuments
        },
        question: input => input.question,
      },
      RunnableMap.from({
        sessions: input => {
          const sessions = distinctDocuments(input.context)
          return sessions.map((session: Document) => {
                return session.metadata
          })
        },
        answer: RunnableSequence.from([{
                context: input => input.context.map((sesison: Document) => sesison.pageContent).join('\n'),
                question: input => input.question,
            },
            ChatPromptTemplate.fromMessages([
            [
                "system",
                `Imagine you are helping someone gather detailed information about specific sessions at an event. 
    Answer the question based on only the following context:
    
    {context}
    
    The context provided includes detailed information for multiple sessions of an event, such as titles, scheduled dates and times, speakers' names, and in-depth descriptions of the sessions. This information aims to assist in identifying sessions that are closely related to each other or to specific topics of interest. Based on the detailed session information provided, you are to offer comprehensive responses that highlight not only individual sessions but also how they might relate or complement each other. This will help the user to make informed decisions about which sessions to attend, enabling them to maximize the relevance and benefit of their attendance based on their specific interests and the content's relevance.`,
            ],
            ["human", "{question}"],
            ]),
            chat,
            new StringOutputParser()
        ])
      }),
    ])
    return generateAnswerChain
}

const createIndexChain = (bindings: Bindings) => {
  const {
      chat
  } = initModels(bindings, 'VECTORIZE_SESSIONS_INDEX')
  const evaluateQuestionChain = RunnableSequence.from([
    {
      question: input => input.question,
    },
    ChatPromptTemplate.fromMessages([
      [
        "system",
        `
あなたはWordPressに関するカンファレンスのスタッフです。
ユーザーの質問が、「カンファレンスのセッションについて」か「それ以外か」を評価してください。
質問が「WordPressに関係する内容」の場合は、「セッションである」と判断します。
返答は"session"もしくは"other"のみで回答してください。

## 例
- "ブロックテーマのセッションはありますか？" -> "session"
- "テーマ開発について" -> "session"
- "コントリビューターデイは？" -> "other"
- "会場はどこ？" -> "other"
`
      ],
      ["human", "{question}"],
    ]),
    chat,
    new StringOutputParser()
  ])
  
  const route = (input: {topic: string; question: string}) => {
    if (input.topic.toLocaleLowerCase().includes('session')) {
      return createSessionChain(bindings)
    }
    return createGeneralChain(bindings)
  }
  const fullChain = RunnableSequence.from([
    {
      topic: evaluateQuestionChain,
      question: input => input.question
    },
    route
  ])
  return fullChain
}
/*
ragApp.get('/sessions', async c => {
    const question = "ブロックテーマのセッションはありますか？"
    const chain = createSessionChain(c.env)
    //const answerStream = await qaChain.stream({question})
    const result = await chain.invoke({question})
    return c.json(result)
})
ragApp.get('/ask', async c => {
  const question = "行動規範について教えて"//"ブロックテーマのセッションはありますか？"
  const chain = createIndexChain(c.env)
  const result = await chain.invoke({question})
  return c.json(result)
})
*/

ragApp.post('/sessions', async c => {
    const {query:question} = await c.req.json<{
        query: string
    }>()
    const chain = createSessionChain(c.env)
    const answerStream = await chain.stream({question})
    return streamText(c, async (stream) => {
        for await (const s of answerStream) {
            await stream.write(JSON.stringify(s))
            await stream.sleep(10)
        }
    })
})
ragApp.post('/ask', async c => {
  const {query:question} = await c.req.json<{
      query: string
  }>()
  const chain = createIndexChain(c.env)
  const answerStream = await chain.stream({question})
  return streamText(c, async (stream) => {
      for await (const s of answerStream) {
          await stream.write(JSON.stringify(s))
          await stream.sleep(10)
      }
  })
})