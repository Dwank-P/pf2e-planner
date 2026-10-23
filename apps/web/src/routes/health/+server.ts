import { getBuildInfo } from '#lib/server/version.js';

export function GET(): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'pf2e-planner-web',
      ...getBuildInfo()
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}
