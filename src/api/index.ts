import { createHonoApp } from "../honoApp";

/**
 * Create / update Vectorize index data
 */
export const indexApp = createHonoApp()

indexApp.get('/', async c => {
    return c.text('hello')
})