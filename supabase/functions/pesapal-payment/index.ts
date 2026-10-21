import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { api, db, json, token, verify, base } from '../_shared/pesapal.ts';
serve(async req=>{
 if(req.method==='OPTIONS') return json({});
 if(req.method!=='POST') return json({error:'Method not allowed'},405);
 try {
  const origin=Deno.env.get('APP_ORIGIN'); if(!origin||new URL(origin).protocol!=='https:') throw Error('APP_ORIGIN must be configured as HTTPS');
  const auth=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  if(!auth) return json({error:'Unauthorized'},401);
  const d=db(); const {data:{user},error}=await d.auth.getUser(auth);
  if(error||!user) return json({error:'Unauthorized'},401);
  const body=await req.json();
  if(body.action==='check_status'){
   if(typeof body.orderTrackingId!=='string') return json({error:'Missing order reference'},400);
   const {data:o}=await d.from('pesapal_orders').select('user_id').eq('tracking_id',body.orderTrackingId).eq('user_id',user.id).maybeSingle();
   if(!o) return json({error:'Order not found'},404);
   return json(await verify(body.orderTrackingId));
  }
  if(body.action!=='initiate') return json({error:'Unknown action'},400);
  const amount=Number(Deno.env.get('PESAPAL_MONTHLY_AMOUNT')),currency=Deno.env.get('PESAPAL_CURRENCY');
  if(!Number.isFinite(amount)||amount<=0||!currency||!/^[A-Z]{3}$/.test(currency)) throw Error('Server-side plan pricing is not configured');
  if(!user.email) return json({error:'Account email required'},400);
  const t=await token();
  const ipnUrl=Deno.env.get('SUPABASE_URL')+'/functions/v1/pesapal-ipn';
  const ipn=await api('/api/URLSetup/RegisterIPN',t,{url:ipnUrl,ipn_notification_type:'GET'});
  if(!ipn.ipn_id) throw Error('PesaPal IPN registration failed');
  const reference='tikvtvz-'+crypto.randomUUID();
  const {error:insertError}=await d.from('pesapal_orders').insert({user_id:user.id,merchant_reference:reference,plan:'monthly',amount,currency,status:'pending'});
  if(insertError) throw Error('Unable to create pending order');
  const result=await api('/api/Transactions/SubmitOrderRequest',t,{id:reference,currency,amount,description:'TikVTVz Premium monthly',callback_url:origin.replace(/\/$/,'')+'/payment-callback',notification_id:ipn.ipn_id,billing_address:{email_address:user.email,first_name:'TikVTVz',last_name:'Subscriber',country_code:'KE'}});
  if(!result.order_tracking_id||result.merchant_reference!==reference||typeof result.redirect_url!=='string') throw Error('Invalid PesaPal checkout response');
  const u=new URL(result.redirect_url);
  const expected=base().includes('cybqa')?'cybqa.pesapal.com':'pay.pesapal.com';
  if(u.protocol!=='https:'||u.hostname!==expected||u.username||u.password) throw Error('Unexpected checkout destination');
  const {error:saveError}=await d.from('pesapal_orders').update({tracking_id:result.order_tracking_id}).eq('merchant_reference',reference).eq('status','pending');
  if(saveError) throw Error('Unable to persist payment tracking');
  return json({redirect_url:u.href,order_tracking_id:result.order_tracking_id});
 }catch(e){console.error('PesaPal payment:',e);return json({error:e instanceof Error?e.message:'Checkout unavailable'},500);}
});
