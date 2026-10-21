import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export const base = () => {
 const mode=Deno.env.get('PESAPAL_ENV') || 'sandbox';
 if(!['sandbox','live'].includes(mode)) throw Error('Invalid PESAPAL_ENV');
 return mode==='live'?'https://pay.pesapal.com/v3':'https://cybqa.pesapal.com/pesapalv3';
};
export const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':Deno.env.get('APP_ORIGIN') || 'https://www.streamora.co.ke','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
export async function token(){
 const key=Deno.env.get('PESAPAL_CONSUMER_KEY'),secret=Deno.env.get('PESAPAL_CONSUMER_SECRET');
 if(!key||!secret) throw Error('PesaPal credentials not configured');
 const r=await fetch(base()+'/api/Auth/RequestToken',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({consumer_key:key,consumer_secret:secret})});
 const v=await r.json(); if(!r.ok||!v.token) throw Error('PesaPal authentication failed'); return v.token as string;
}
export async function api(path:string,t:string,body?:unknown){
 const r=await fetch(base()+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+t,Accept:'application/json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const v=await r.json(); if(!r.ok||v.error?.code||v.error?.message) throw Error('PesaPal request failed: '+(v.error?.message||r.status)); return v;
}
export async function verify(tracking:string,reference?:string){
 const d=db(); const {data:o,error}=await d.from('pesapal_orders').select('*').eq('tracking_id',tracking).single();
 if(error||!o||reference&&o.merchant_reference!==reference) throw Error('Unknown payment order');
 const v=await api('/api/Transactions/GetTransactionStatus?orderTrackingId='+encodeURIComponent(tracking),await token());
 if(v.merchant_reference!==o.merchant_reference) throw Error('Merchant reference mismatch');
 const status=String(v.payment_status_description||'').toLowerCase();
 if(status==='completed'){
   if(Number(v.amount)!==Number(o.amount)||v.currency!==o.currency||Number(v.status_code)!==1) throw Error('Payment amount, currency or status mismatch');
   const {data:ok,error:e}=await d.rpc('activate_pesapal_order',{p_tracking:tracking,p_reference:o.merchant_reference,p_amount:Number(o.amount),p_currency:o.currency});
   if(e||!ok) throw Error('Unable to record verified entitlement');
 } else if(['failed','invalid','reversed'].includes(status) && o.status==='pending'){
   await d.from('pesapal_orders').update({status:status==='reversed'?'reversed':'failed'}).eq('id',o.id).eq('status','pending');
 }
 return {payment_status_description:v.payment_status_description};
}
