import http from 'node:http';
const port=Number(process.env.PORT||10000);
const base=process.env.PESAPAL_ENVIRONMENT==='live'?'https://pay.pesapal.com/v3':'https://cybqa.pesapal.com/pesapalv3';
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
const configured=()=>Boolean(process.env.PESAPAL_CONSUMER_KEY&&process.env.PESAPAL_CONSUMER_SECRET);
async function token(){
 if(!configured()) throw new Error('Pesapal credentials not configured');
 const response=await fetch(base+'/api/Auth/RequestToken',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({consumer_key:process.env.PESAPAL_CONSUMER_KEY,consumer_secret:process.env.PESAPAL_CONSUMER_SECRET}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!data.token) throw new Error('Pesapal authentication failed');return data.token;
}
async function pesapal(path,method='GET',body){
 const auth=await token();const response=await fetch(base+path,{method,headers:{authorization:'Bearer '+auth,accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok) throw new Error('Pesapal API request failed');return data;
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/health') return json(res,200,{status:'ok',service:'tikvtv-payment-backend',pesapal_credentials_present:configured(),environment:process.env.PESAPAL_ENVIRONMENT==='live'?'live':'sandbox'});
 if(req.method==='GET'&&url.pathname==='/pesapal/ipn'){
  // Do not acknowledge unverified callbacks as successful or activate subscriptions.
  const tracking=url.searchParams.get('OrderTrackingId');
  if(!tracking||!configured())return json(res,503,{error:'Callback not ready'});
  try {const result=await pesapal('/api/Transactions/GetTransactionStatus?orderTrackingId='+encodeURIComponent(tracking));return json(res,200,{orderNotificationType:url.searchParams.get('OrderNotificationType')||'IPNCHANGE',orderTrackingId:tracking,orderMerchantReference:url.searchParams.get('OrderMerchantReference')||'',status:200,verified_payment_status:result.payment_status_description||'UNKNOWN',premium_activated:false});}
  catch{return json(res,503,{error:'Transaction verification failed; retry callback'});}
 }
 if(req.method==='GET'&&url.pathname==='/pesapal/readiness'){
  if(!configured())return json(res,503,{ready:false,reason:'credentials_missing'});
  try{await token();return json(res,200,{ready:true,environment:process.env.PESAPAL_ENVIRONMENT==='live'?'live':'sandbox',premium_activation_enabled:false});}
  catch{return json(res,503,{ready:false,reason:'authentication_failed'});}
 }
 return json(res,404,{error:'Not found'});
});
server.listen(port,'0.0.0.0');
