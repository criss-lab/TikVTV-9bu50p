import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { json, verify } from '../_shared/pesapal.ts';
serve(async req=>{
 if(req.method!=='GET') return json({error:'Method not allowed'},405);
 const u=new URL(req.url);
 const tracking=u.searchParams.get('OrderTrackingId'),reference=u.searchParams.get('OrderMerchantReference');
 if(!tracking||!reference) return json({error:'Missing payment reference'},400);
 try {
  await verify(tracking,reference);
  return json({orderNotificationType:u.searchParams.get('OrderNotificationType')||'IPNCHANGE',orderTrackingId:tracking,orderMerchantReference:reference,status:200});
 } catch(e) {console.error('PesaPal IPN verification:',e);return json({orderTrackingId:tracking,orderMerchantReference:reference,status:500},500);}
});
