```
npm install
```

```
% npx wrangler vectorize create wck-2024 --dimensions=1024 --metric=cosine
```

```
npm run dev
```


## Deployment

```bash
% npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
% npx wrangler secret put CLOUDFLARE_API_TOKEN
```


```
npm run deploy
```

npx wrangler vectorize create wck-2024 --dimensions=1024 --metric=cosine