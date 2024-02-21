import { Hono } from 'hono'
export type Bindings = {
    VECTORIZE_INDEX: VectorizeIndex;
}

export const createHonoApp = () => {
    return new Hono<{
        CLOUDFLARE_ACCOUNT_ID: string;
        CLOUDFLARE_API_TOKEN: string;
        Bindings: Bindings;
        AI: Fetcher;
    }>()
}