export function handle(req, url, res) {
  if (req.method === 'GET' && url.pathname === '/api/resorts') {
    send(res, 200, await upstream('/rest/v1/rpc/list_resorts', {}));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    await upstream('/auth/v1/token', {});
    return;
  }
}
const routes = [
  route('GET', '/api/items/:id', /^\/api\/items\/([^/]+)$/, async ({ res, params, session }) => {
    send(res, 200, await rpcCall('get_item', session, { id: params[0] }));
  }),
];
