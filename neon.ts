import { defineConfig } from '@neon/config/v1';

// Infrastructure-as-code for ReactorX's backend. The app calls Anthropic
// directly (ANTHROPIC_API_KEY, see functions/src/propose*.ts) rather than
// through Neon's own AI Gateway, so that service is deliberately left off
// here — declaring it blocks `neon deploy` outright on a Free plan
// ("AI Gateway ... isn't available on the Free plan"), for a feature
// nothing in this codebase actually uses.
export default defineConfig({
  functions: {
    api: {
      name: 'ReactorX API',
      source: 'functions/src/index.ts',
      // DATABASE_URL is injected automatically (the branch has Postgres).
      // ANTHROPIC_API_KEY is not — every propose*.ts call reads it from
      // process.env directly, so it has to be declared here to make it
      // into the deployed function's environment. Value comes from
      // whatever --env file `neon deploy`/`neon config apply` is run
      // with (see deploy docs) — never hardcoded here.
      env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
    },
  },
});
