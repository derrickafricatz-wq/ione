import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const normPhone=(v:string)=>{const p=String(v||"").replace(/\D/g,"");return p.startsWith("255")?p:p.startsWith("0")?"255"+p.slice(1):p.startsWith("6")||p.startsWith("7")?"255"+p:p};
const parseApi=(x:any)=>x?.data||x?.result||x||{};
const eligible=["paid","received"];
const getPaymentStatus=(payload:any)=>{const c=[payload?.data?.status,payload?.status,payload?.data?.payment?.status,payload?.payment?.status,payload?.data?.payment_status,payload?.payment_status,payload?.data?.state,payload?.state,payload?.data?.payment?.state,payload?.payment?.state];const f=c.find(v=>v!==undefined&&v!==null&&String(v).trim());return f?String(f).trim().toLowerCase():""};
const isPaidStatus=(s:string)=>["completed","paid","successful","success","succeeded"].includes(s);
const isFailedStatus=(s:string)=>["failed","voided","expired","cancelled","canceled","declined","rejected","customer_rejected"].includes(s);
async function sendAuthorityPaymentEmail(receipt:any,order:any){
 const apiKey=String(Deno.env.get("IONE_RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY") || "").trim();
 const to=String(Deno.env.get("IONE_AUTHORITY_EMAIL")||"").trim();
 if(!apiKey||!to||!receipt)return;
 const from=String(Deno.env.get("RESEND_FROM_EMAIL") || "ione <hello@intoione.space>").trim();
 const safe=(v:any)=>String(v??"").replace(/[&<>"]/g,(x)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"} as any)[x]);
 const html="<div style='font-family:Arial,sans-serif'><h2>I|ONE CHAPCHAP • PAYMENT CONFIRMED</h2><p><b>Receipt:</b> "+safe(receipt.receipt_number)+"</p><p><b>Product:</b> "+safe(receipt.product_title)+"</p><p><b>Client:</b> "+safe(receipt.buyer_full_name)+"</p><p><b>Amount:</b> TZS "+Number(receipt.amount_tzs||0).toLocaleString("en-US")+"</p><p><b>BLMPay reference:</b> "+safe(receipt.blmpay_reference)+"</p><p><b>Order:</b> "+safe(order?.id)+"</p><p>Payment is confirmed by BLMPay. The product is sold and the order is awaiting Authority payout handling.</p></div>";
 await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json","Idempotency-Key":"chapchap-payment-authority-"+receipt.order_id},body:JSON.stringify({from,to:[to],subject:"I|ONE ChapChap • Payment Confirmed",html,text:"I|ONE CHAPCHAP — PAYMENT CONFIRMED\nReceipt: "+(receipt.receipt_number||"—")+"\nProduct: "+(receipt.product_title||"—")+"\nClient: "+(receipt.buyer_full_name||"—")+"\nAmount: TZS "+Number(receipt.amount_tzs||0).toLocaleString("en-US")+"\nBLMPay reference: "+(receipt.blmpay_reference||"—")+"\nOrder: "+receipt.order_id+"\nAwaiting Authority payout handling."})});
}

async function reconcilePendingChapChap(admin:any,apiKey:string,origin:string){
 const {data:pending,error}=await admin.from("ione_chapchap_orders").select("id,product_id,seller_id,buyer_id,buyer_phone,buyer_full_name,buyer_address,buyer_email,buyer_contact,amount_tzs,commission_tzs,blmpay_reference,blmpay_transaction_id,status,paid_at").eq("status","pending").not("blmpay_reference","is",null).order("created_at",{ascending:true}).limit(100);
 if(error||!pending?.length)return;
 for(const order of pending){
  try{
   const res=await fetch("https://pay.blmtec.co.tz/api/v1/payments/"+encodeURIComponent(order.blmpay_reference),{headers:{Authorization:"Bearer "+apiKey,"X-BLMPay-Origin":origin,Accept:"application/json"}});
   const txt=await res.text();let data:any={};try{data=txt?JSON.parse(txt):{}}catch{}
   if(!res.ok)continue;
   const ps=getPaymentStatus(data),now=new Date().toISOString();
   if(isPaidStatus(ps)){
    const tx=data?.data?.transaction_id||data?.transaction_id||data?.data?.id||data?.id||order.blmpay_transaction_id||order.blmpay_reference;
    await admin.from("ione_chapchap_orders").update({status:"paid",blmpay_reference:order.blmpay_reference,blmpay_transaction_id:tx,paid_at:order.paid_at||now,updated_at:now}).eq("id",order.id).eq("status","pending");
    await admin.from("ione_single_products").update({status:"sold",updated_at:now}).eq("id",order.product_id).eq("status","pending_payment");
    await admin.from("ione_chapchap_notifications").upsert({seller_id:order.seller_id,order_id:order.id,title:"CHAPCHAP • SOLD",body:"Your ChapChap product has been paid for. Contact the buyer at "+order.buyer_phone+" and arrange delivery/collection."},{onConflict:"order_id"});
    const {data:p}=await admin.from("ione_single_products").select("id,seller_id,seller_name,seller_phone,category,title,description,location,attributes,image_urls").eq("id",order.product_id).maybeSingle();
    const {data:a}=await admin.from("ione_chapchap_seller_agreements").select("seller_name,seller_phone,seller_email,seller_address").eq("seller_id",order.seller_id).eq("product_id",order.product_id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(p && order.buyer_full_name && order.buyer_address && order.buyer_email && (order.buyer_contact||order.buyer_phone)){
      await admin.from("ione_chapchap_receipts").upsert({order_id:order.id,buyer_id:order.buyer_id,seller_id:order.seller_id,buyer_full_name:order.buyer_full_name,buyer_address:order.buyer_address,buyer_email:order.buyer_email,buyer_contact:order.buyer_contact||order.buyer_phone,seller_name:a?.seller_name||p.seller_name,seller_phone:a?.seller_phone||p.seller_phone,seller_email:a?.seller_email||null,seller_address:a?.seller_address||null,product_title:p.title,product_category:p.category,product_description:p.description,product_condition:p.attributes?.condition||p.attributes?.Condition||null,product_location:p.location,product_attributes:p.attributes||{},product_image_urls:p.image_urls||[],amount_tzs:order.amount_tzs,chapchap_percent:1,chapchap_fee_tzs:order.commission_tzs,blmpay_reference:order.blmpay_reference,blmpay_transaction_id:tx,paid_at:order.paid_at||now},{onConflict:"order_id"});
    }
   }else if(isFailedStatus(ps)){
    await admin.from("ione_chapchap_orders").update({status:ps==="expired"?"expired":"failed",updated_at:now}).eq("id",order.id).eq("status","pending");
    await admin.from("ione_single_products").update({status:"active",updated_at:now}).eq("id",order.product_id).eq("status","pending_payment");
   }
  }catch(_){/* one provider lookup must never block the Authority list */}
 }
}



async function validAuthoritySession(admin: any, rawToken: unknown): Promise<boolean> {
  const token = String(rawToken || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { data, error } = await admin.from("ione_authority_sessions").select("token_hash")
    .eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString())
    .is("revoked_at", null).maybeSingle();
  return !error && !!data;
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({success:false,error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,authorityPassword=Deno.env.get("IONE_AUTHORITY_PASSWORD")?.trim(),apiKey=Deno.env.get("BLM_PAY_PAYOUT_API_KEY")?.trim();
  if(!url||!key||!authorityPassword||!apiKey)return json({success:false,error:"Server configuration is missing."},500);
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  let body:any={};try{body=await req.json()}catch{}
  const action=String(body?.action||"list").trim().toLowerCase();
  if(!(await validAuthoritySession(admin,body?.authority_session)))return json({success:false,error:"Authority Press session expired. Unlock again."},401);

  if(action==="list"){
   /* Before building Authority counts, reconcile pending BLMPay attempts against the provider. Webhooks remain the primary path; this is a safe recovery check for missed callbacks. */
   await reconcilePendingChapChap(admin,apiKey,url);
   const {data:orders,error}=await admin.from("ione_chapchap_orders").select("id,product_id,seller_id,buyer_full_name,buyer_contact,buyer_phone,buyer_email,buyer_address,amount_tzs,commission_tzs,seller_net_tzs,seller_available_tzs,status,paid_at,received_confirmed_at,payout_status,payout_reference,payout_fee_tzs,payout_amount_tzs,seller_payout_id,created_at").in("status",eligible.concat(["disputed"])).order("created_at",{ascending:false}).limit(100);
   if(error)return json({success:false,error:"Could not load ChapChap orders."},500);
   const {data:agreements}=await admin.from("ione_chapchap_seller_agreements").select("id,seller_id,product_id,seller_name,seller_phone,seller_email,seller_address,seller_location,terms_version,accepted_at,created_at").order("accepted_at",{ascending:false}).limit(500);
   if(agreements===null)return json({success:false,error:"Could not load ChapChap seller agreements."},500);
   const productIds=[...(orders||[]).map(o=>o.product_id),...(agreements||[]).map(a=>a.product_id)].filter(Boolean),orderIds=(orders||[]).map(o=>o.id).filter(Boolean),sellerIds=[...new Set((orders||[]).map(o=>o.seller_id).filter(Boolean))];
   const {data:products}=productIds.length?await admin.from("ione_single_products").select("id,title,location,seller_name,seller_phone").in("id",[...new Set(productIds)]):{data:[]};
   const {data:receipts}=orderIds.length?await admin.from("ione_chapchap_receipts").select("*").in("order_id",orderIds):{data:[]};
   for(const rr of (receipts||[])){ const oo=(orders||[]).find(x=>String(x.id)===String(rr.order_id)); if(oo) await sendAuthorityPaymentEmail(rr,oo); }
   const {data:payouts}=sellerIds.length?await admin.from("ione_chapchap_seller_payouts").select("*").in("seller_id",sellerIds).order("created_at",{ascending:false}):{data:[]};
   const pm=new Map((products||[]).map(p=>[String(p.id),p])),am=new Map((agreements||[]).map(a=>[String(a.seller_id)+":"+String(a.product_id),a])),rm=new Map((receipts||[]).map(r=>[String(r.order_id),r]));
   const enriched=(orders||[]).map(o=>({...o,product:pm.get(String(o.product_id))||null,agreement_record:am.get(String(o.seller_id)+":"+String(o.product_id))||null,has_agreement:am.has(String(o.seller_id)+":"+String(o.product_id)),receipt:rm.get(String(o.id))||null,has_receipt:rm.has(String(o.id))}));
   const groups:any[]=[];
   for(const o of enriched){
    if(!eligible.includes(String(o.status||"").toLowerCase())||["completed","pending"].includes(String(o.payout_status||"").toLowerCase()))continue;
    let g=groups.find(x=>String(x.seller_id)===String(o.seller_id));
    const a=o.agreement_record||{},p=o.product||{};
    if(!g){g={seller_id:o.seller_id,seller_name:a.seller_name||p.seller_name||"SELLER",seller_phone:a.seller_phone||p.seller_phone||"",seller_email:a.seller_email||"",products:[],seller_balance_tzs:0,order_ids:[]};groups.push(g);}
    const bal=Math.max(0,Math.floor(Number(o.seller_available_tzs||0)));
    g.seller_balance_tzs+=bal;g.order_ids.push(o.id);g.products.push({order_id:o.id,product_id:o.product_id,title:p.title||"PRODUCT",amount_tzs:Number(o.amount_tzs||0),seller_available_tzs:bal});
   }
   const activePayouts=(payouts||[]).filter(p=>String(p.status||"").toLowerCase()==="pending");
   return json({success:true,orders:enriched,agreements:agreements||[], seller_groups:groups, recent_seller_payouts:activePayouts, counts:{orders:enriched.length,agreements:(agreements||[]).length,receipts:(receipts||[]).length,payouts:activePayouts.length}});
  }

  const quoteFee=async(amount:number)=>{
   const res=await fetch("https://pay.blmtec.co.tz/api/v1/payouts/fee?amount="+encodeURIComponent(String(amount))+"&channel=mobile",{headers:{Authorization:"Bearer "+apiKey,"X-BLMPay-Origin":url,Accept:"application/json"}});
   const txt=await res.text();let j:any={};try{j=txt?JSON.parse(txt):{}}catch{}
   if(!res.ok)throw new Error("BLMPay could not calculate the payout fee.");
   const p=parseApi(j),fee=Math.floor(Number(p?.fee_amount??p?.fees?.value??p?.fee?.value??0)),total=Number(p?.total_debit??p?.total?.value??(amount+fee));
   return {fee,total};
  };
  const getSellerOrders=async(sellerId:string)=>{
   const {data,error}=await admin.from("ione_chapchap_orders").select("id,product_id,seller_id,status,seller_available_tzs,payout_status").eq("seller_id",sellerId).in("status",eligible).order("created_at",{ascending:true});
   if(error)throw new Error("Could not load seller orders.");
   return (data||[]).filter(o=>!["completed","pending"].includes(String(o.payout_status||"").toLowerCase())&&Math.floor(Number(o.seller_available_tzs||0))>0);
  };

  if(action==="payout_quote"){
   const sellerId=String(body?.seller_id||"").trim(),phone=normPhone(body?.recipient_phone),network=String(body?.recipient_network||"").trim().toUpperCase();
   if(!sellerId||!phone||!network)return json({success:false,error:"Seller number, network and seller are required."},400);
   const orders=await getSellerOrders(sellerId);if(!orders.length)return json({success:false,error:"This seller has no unpaid balance available for payout."},409);
   const sellerBalance=orders.reduce((s,o)=>s+Math.floor(Number(o.seller_available_tzs||0)),0);
   let payoutAmount=sellerBalance,fee=0,total=sellerBalance;
   for(let i=0;i<8;i++){const q=await quoteFee(payoutAmount);fee=q.fee;total=q.total;if(total<=sellerBalance)break;const next=sellerBalance-fee;if(next<=0){payoutAmount=0;break;}if(next===payoutAmount)break;payoutAmount=next;}
   if(payoutAmount<5000)return json({success:false,error:"Seller balance is below the minimum BLMPay payout amount after applicable fees.",details:{seller_balance_tzs:sellerBalance,payout_amount_tzs:payoutAmount,fee_tzs:fee}},409);
   const final=await quoteFee(payoutAmount);fee=final.fee;total=final.total;
   if(total>sellerBalance)return json({success:false,error:"BLMPay payout fee changed while calculating the quote. Please calculate again."},409);
   const lookup=await fetch("https://pay.blmtec.co.tz/api/v1/payouts/name-lookup",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"X-BLMPay-Origin":url,"Content-Type":"application/json"},body:JSON.stringify({channel:"mobile",account_number:phone})});
   const lt=await lookup.text();let lj:any={};try{lj=lt?JSON.parse(lt):{}}catch{}
   if(!lookup.ok)return json({success:false,error:"BLMPay could not verify that seller number."},lookup.status);
   const accountName=parseApi(lj)?.account_name||parseApi(lj)?.recipient?.name||parseApi(lj)?.name;if(!accountName)return json({success:false,error:"BLMPay did not return a registered account name."},502);
   return json({success:true,seller_id:sellerId,seller_balance_tzs:sellerBalance,amount_tzs:payoutAmount,fee_tzs:fee,total_debit_tzs:total,account_name:accountName,recipient_phone:phone,network,order_count:orders.length,order_ids:orders.map(o=>o.id),products:orders.map(o=>({order_id:o.id,seller_available_tzs:Number(o.seller_available_tzs||0)}))});
  }

  if(action==="payout_send"){
   const sellerId=String(body?.seller_id||"").trim(),phone=normPhone(body?.recipient_phone),network=String(body?.recipient_network||"").trim().toUpperCase(),accountName=String(body?.account_name||"").trim(),amount=Math.floor(Number(body?.amount_tzs||0)),quotedFee=Math.floor(Number(body?.fee_tzs||0)),quotedBalance=Math.floor(Number(body?.seller_balance_tzs||0)),quotedTotal=Math.floor(Number(body?.total_debit_tzs||0));
   if(!sellerId||!phone||!network||!accountName||amount<5000||quotedBalance<=0||quotedFee<0||quotedTotal<=0)return json({success:false,error:"Complete payout verification first."},400);
   const orders=await getSellerOrders(sellerId),sellerBalance=orders.reduce((s,o)=>s+Math.floor(Number(o.seller_available_tzs||0)),0);
   if(quotedBalance!==sellerBalance||amount+quotedFee!==quotedTotal||quotedTotal>sellerBalance)return json({success:false,error:"Seller balance changed. Please calculate the payout again."},409);
   const now=new Date().toISOString(),batchId=crypto.randomUUID();
   const send=await fetch("https://pay.blmtec.co.tz/api/v1/payouts/send",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"X-BLMPay-Origin":url,"Content-Type":"application/json","Idempotency-Key":"CCP-BATCH-"+batchId},body:JSON.stringify({amount,currency:"TZS",channel:"mobile",recipient_phone:phone,network,narration:"ChapChap seller payout "+sellerId,webhook_url:url+"/functions/v1/ione-chapchap-webhook",metadata:{seller_id:sellerId,seller_payout_id:batchId,order_id:orders[0].id,source:"ione_chapchap_seller_payout"}})});
   const st=await send.text();let sj:any={};try{sj=st?JSON.parse(st):{}}catch{}
   if(!send.ok)return json({success:false,error:"BLMPay could not send the seller payout."},send.status);
   const pd=parseApi(sj),reference=String(pd?.reference||pd?.data?.reference||"").trim(),providerStatus=String(pd?.status||pd?.data?.status||"pending").toLowerCase();
   if(!reference)return json({success:false,error:"BLMPay accepted the request but returned no payout reference."},502);
   const {data:batch,error:be}=await admin.from("ione_chapchap_seller_payouts").insert({id:batchId,seller_id:sellerId,seller_name:accountName,recipient_phone:phone,recipient_network:network,recipient_account_name:accountName,total_seller_balance_tzs:sellerBalance,payout_amount_tzs:amount,blmpay_fee_tzs:quotedFee,total_debit_tzs:quotedTotal,blmpay_reference:reference,status:providerStatus==="completed"?"completed":"pending",order_ids:orders.map(o=>o.id),requested_at:now,completed_at:providerStatus==="completed"?now:null}).select("*").single();
   if(be)return json({success:false,error:"Payout was sent by BLMPay but the local seller payout record could not be saved. Reference: "+reference},500);
   const updates={payout_status:providerStatus==="completed"?"completed":"pending",seller_payout_id:batchId,payout_reference:reference,payout_fee_tzs:quotedFee,payout_amount_tzs:amount,updated_at:now};
   for(const o of orders){const {error:ue}=await admin.from("ione_chapchap_orders").update(updates).eq("id",o.id);if(ue)console.error("order payout link failed",o.id,ue);}
   await admin.from("ione_chapchap_notifications").insert({seller_id:sellerId,order_id:orders[0].id,title:"CHAPCHAP • SELLER PAYOUT",body:"Authority Press sent TZS "+amount.toLocaleString("en-US")+" for "+orders.length+" sold product(s). BLMPay reference: "+reference+"."});
   return json({success:true,payout:batch,message:providerStatus==="completed"?"Seller payout completed.":"Seller payout submitted to BLMPay and is processing."});
  }
  return json({success:false,error:"Unknown authority action."},400);
 }catch(error){console.error("ChapChap authority error:",error);return json({success:false,error:error instanceof Error?error.message:"Unexpected error."},500)}
});