import http from 'node:http';
const port = Number(process.env.PORT || 10000);
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, 'http://localhost');
  const send=(code,body)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  if(req.method==='GET' && url.pathname==='/health') return send(200,{status:'ok',service:'tikvtv-payment-backend'});
  if(url.pathname==='/pesapal/ipn') return send(503,{error:'Payment callback not configured; no subscription activated'});
  return send(404,{error:'Not found'});
});
server.listen(port,'0.0.0.0');
