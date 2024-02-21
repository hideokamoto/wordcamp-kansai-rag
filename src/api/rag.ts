import { createHonoApp } from "../honoApp";

/**
 * RAG api
 */
export const ragApp = createHonoApp()

ragApp.get('/', async c => {
    return c.text('hello')
})