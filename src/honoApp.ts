import { Hono } from 'hono'
export type Bindings = {
    VECTORIZE_SESSIONS_INDEX: VectorizeIndex;
    VECTORIZE_GENERAL_INDEX: VectorizeIndex
    CLOUDFLARE_ACCOUNT_ID: string;
    CLOUDFLARE_API_TOKEN: string;
    AI: Fetcher;
}

export const createHonoApp = () => {
    return new Hono<{
        Bindings: Bindings;
    }>()
}