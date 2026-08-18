// Vercel Functions have an ephemeral writable filesystem. This keeps the API
// runnable for the first deployment; production persistence must use a managed
// database before real customer data is accepted.
process.env.DB_PATH ||= '/tmp/computex.db';

const { default: app } = await import('../server/src/index.js');

export default app;
