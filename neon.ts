import { defineConfig } from '@neon/config/v1';

// Infrastructure-as-code for ReactorX's backend. Not yet deployed (this
// session doesn't have authenticated Neon CLI access — see db/README-ish
// note in the chat history: the project was handed a raw DATABASE_URL, not
// CLI credentials). This file is written to be correct and ready for
// `neon deploy` the moment CLI access exists; until then, `functions/src`
// is run locally via `functions/dev-server.mjs`.
export default defineConfig({
  aiGateway: true,
  functions: {
    api: {
      name: 'ReactorX API',
      source: 'functions/src/index.ts',
    },
  },
});
