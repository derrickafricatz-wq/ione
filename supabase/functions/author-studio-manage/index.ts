import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean = (v:unknown,max=160) => String(v??"").trim().slice(0,max);
const phone = (v:unknown) => { let p=String(v??"").replace(/\D/g,""); if(p.startsWith("0")) p="255"+p.slice(1); else if(p.startsWith("6")||p.startsWith("7")) p="255"+p; return p; };
const money = (n:unknown) => Math.round(Number(n)*100)/100;
const networks = new Set(["AIRTEL_MONEY","MPESA","TIGOPESA","HALOPESA","OTHER"]);
async function provider(path:string,apiKey:string,method="GET",body?:unknown,idempotency?:string) {
  const headers:Record<string,string>={Authorization:"Bearer "+apiKey,Accept:"application/json"};
  if(body!==undefined) headers["Content-Type"]="application/json";
  if(idempotency) headers["Idempotency-Key"]=idempotency;
  const res=await fetch("https://pay.blmtec.co.tz/api/v1"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await res.text(); let data:any={}; try{data=raw?JSON.parse(raw):{}}catch{data={message:raw.slice(0,300)}}
  return {ok:res.ok,status:res.status,data};
}
const payload=(x:any)=>x?.data||x?.result||x||{};
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({success:false,error:"POST required."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!service) return json({success:false,error:"Server configuration is incomplete."},500);
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
    const body=await req.json().catch(()=>({}));
    const action=clean(body?.action,40).toLowerCase();
    const authHeader=req.headers.get("Authorization")||"";
    const anon=Deno.env.get("SUPABASE_ANON_KEY");
    let user:any=null;
    if(authHeader && anon){
      const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
      const result=await userClient.auth.getUser();
      if(!result.error) user=result.data.user;
    }
    const isAuthority=async()=>{
      const expected=Deno.env.get("IONE_AUTHORITY_PASSWORD")||"";
      return !!expected && clean(body?.password,300)===expected;
    };
    if(action==="register"){
      if(!user) return json({success:false,error:"Please sign in to register."},401);
      const full_name=clean(body?.full_name,160), p=phone(body?.phone);
      if(full_name.length<2||p.length<11||p.length>15) return json({success:false,error:"Enter your full name and a valid Tanzania phone number."},400);
      if(body?.terms_accepted!==true) return json({success:false,error:"Please accept the Author Studio terms."},400);
      const {data:existing,error:findError}=await admin.from("author_studio_profiles").select("*").eq("user_id",user.id).maybeSingle();
      if(findError) return json({success:false,error:"Author registration is not available until the database migration is installed."},503);
      if(existing) return json({success:true,profile:existing,already_registered:true});
      const {data:profile,error}=await admin.from("author_studio_profiles").insert({user_id:user.id,full_name,phone:p,payout_network:networks.has(clean(body?.payout_network,30))?clean(body.payout_network,30):"AIRTEL_MONEY"}).select("*").single();
      if(error) return json({success:false,error:"Could not save author registration."},500);
      const {data:request, error:requestError}=await admin.from("author_studio_package_requests").insert({author_id:profile.id,user_id:user.id,terms_accepted_at:new Date().toISOString()}).select("*").single();
      if(requestError) return json({success:false,error:"Registration saved, but package request needs Authority review." ,profile},500);
      return json({success:true,profile,package_request:request,payment:{amount_tzs:10000,merchant_name:"DERRICK KIPAJI OF AFRIKA & CO",merchant_number:"140001788",network:"Airtel Money"}});
    }
    if(action==="my_status"){
      if(!user) return json({success:false,error:"Please sign in first."},401);
      const {data:profile,error}=await admin.from("author_studio_profiles").select("id,full_name,phone,payout_network,package_status,package_price_tzs,package_book_limit,published_books_used,package_paid_at,created_at").eq("user_id",user.id).maybeSingle();
      if(error) return json({success:false,error:"Author Studio setup is not installed yet."},503);
      if(!profile) return json({success:true,registered:false});
      const {data:books,error:bookError}=await admin.from("heavens_books").select("id,title,price,active,created_at").eq("author_id",user.id).order("created_at",{ascending:false});
      const {data:sales,error:salesError}=await admin.from("author_studio_sales").select("gross_tzs,billonpay_fee_tzs,platform_fee_tzs,author_net_tzs,confirmed_at,book_id").eq("author_id",profile.id);
      const {data:payouts,error:payoutError}=await admin.from("author_studio_payouts").select("amount_tzs,status,provider_reference,created_at,completed_at,provider_fee_tzs").eq("author_id",profile.id).order("created_at",{ascending:false});
      if(bookError||salesError||payoutError) return json({success:false,error:"Could not load the complete author ledger."},500);
      const gross=(sales||[]).reduce((n:any,x:any)=>n+Number(x.gross_tzs||0),0);
      const fees=(sales||[]).reduce((n:any,x:any)=>n+Number(x.billonpay_fee_tzs||0)+Number(x.platform_fee_tzs||0),0);
      const earned=(sales||[]).reduce((n:any,x:any)=>n+Number(x.author_net_tzs||0),0);
      const paid=(payouts||[]).filter((x:any)=>["completed"].includes(x.status)).reduce((n:any,x:any)=>n+Number(x.amount_tzs||0),0);
      const reserved=(payouts||[]).filter((x:any)=>["initiated","pending","processing"].includes(x.status)).reduce((n:any,x:any)=>n+Number(x.amount_tzs||0),0);
      return json({success:true,registered:true,profile,books:books||[],ledger:{confirmed_sales:(sales||[]).length,gross_tzs:money(gross),fees_tzs:money(fees),author_earnings_tzs:money(earned),paid_out_tzs:money(paid),pending_payout_tzs:money(reserved),available_tzs:money(earned-paid-reserved)},payouts:payouts||[]});
    }
    if(["admin_list","admin_ledger","admin_unlock","payout_quote","payout_send","payout_status"].includes(action)){
      if(!(await isAuthority())) return json({success:false,error:"Unauthorized Authority Press access."},401);
    }
    if(action==="admin_list"||action==="admin_ledger"){
      const {data:profiles,error}=await admin.from("author_studio_profiles").select("*").order("created_at",{ascending:false}).limit(300);
      if(error) return json({success:false,error:"Could not load author registrations."},500);
      const ids=(profiles||[]).map((x:any)=>x.id);
      const userIds=(profiles||[]).map((x:any)=>x.user_id);
      const [{data:requests,error:reqError},{data:sales,error:salesError},{data:payouts,error:payoutError},{data:books,error:bookError}]=await Promise.all([
        ids.length?admin.from("author_studio_package_requests").select("*").in("author_id",ids).order("created_at",{ascending:false}).limit(500):Promise.resolve({data:[],error:null}),
        ids.length?admin.from("author_studio_sales").select("*").in("author_id",ids).order("confirmed_at",{ascending:false}).limit(5000):Promise.resolve({data:[],error:null}),
        ids.length?admin.from("author_studio_payouts").select("*").in("author_id",ids).order("created_at",{ascending:false}).limit(2000):Promise.resolve({data:[],error:null}),
        userIds.length?admin.from("heavens_books").select("id,author_id,title,price,active,created_at").in("author_id",userIds).order("created_at",{ascending:false}).limit(1500):Promise.resolve({data:[],error:null})
      ]);
      if(reqError||salesError||payoutError||bookError) return json({success:false,error:"Could not load the complete author ledger."},500);
      const records=(profiles||[]).map((a:any)=>{
        const as=(sales||[]).filter((x:any)=>x.author_id===a.id), ap=(payouts||[]).filter((x:any)=>x.author_id===a.id), ab=(books||[]).filter((x:any)=>x.author_id===a.user_id);
        const sum=(xs:any[],field:string)=>xs.reduce((n:number,x:any)=>n+Number(x[field]||0),0);
        const reserved=ap.filter((x:any)=>["initiated","pending","processing"].includes(x.status));
        const paid=ap.filter((x:any)=>x.status==="completed");
        return {...a,books:ab,sales:as,payouts:ap,ledger:{confirmed_sales:as.length,gross_tzs:money(sum(as,"gross_tzs")),billonpay_fee_tzs:money(sum(as,"billonpay_fee_tzs")),platform_fee_tzs:money(sum(as,"platform_fee_tzs")),author_earnings_tzs:money(sum(as,"author_net_tzs")),paid_out_tzs:money(sum(paid,"amount_tzs")),pending_payout_tzs:money(sum(reserved,"amount_tzs")),available_tzs:money(sum(as,"author_net_tzs")-sum(paid,"amount_tzs")-sum(reserved,"amount_tzs"))}};
      });
      return json({success:true,authors:records,package_requests:requests||[]});
    }
    if(action==="admin_unlock"){
      const authorId=clean(body?.author_id,60), approve=body?.approve===true;
      if(!authorId) return json({success:false,error:"Author record is required."},400);
      const {data:profile,error:lookupError}=await admin.from("author_studio_profiles").select("*").eq("id",authorId).maybeSingle();
      if(lookupError||!profile) return json({success:false,error:"Author record not found."},404);
      if(approve){
        const {count:publishedCount,error:countError}=await admin.from("heavens_books").select("id",{count:"exact",head:true}).eq("author_id",profile.user_id).eq("active",true);
        if(countError) return json({success:false,error:"Could not verify the author's published-book count."},500);
        const used=Math.min(Number(publishedCount||0),3);
        const nextStatus=used>=3?"locked":"active";
        const {data:updated,error}=await admin.from("author_studio_profiles").update({package_status:nextStatus,package_paid_at:new Date().toISOString(),package_unlocked_by:"Authority Press",published_books_used:used,updated_at:new Date().toISOString()}).eq("id",authorId).select("*").single();
        if(error) return json({success:false,error:"Could not unlock publishing access."},500);
        await admin.from("author_studio_package_requests").update({status:"approved",reviewed_by:"Authority Press",reviewed_at:new Date().toISOString()}).eq("author_id",authorId).eq("status","pending");
        return json({success:true,profile:updated});
      }
      const {data:updated,error}=await admin.from("author_studio_package_requests").update({status:"rejected",reviewed_by:"Authority Press",reviewed_at:new Date().toISOString()}).eq("author_id",authorId).eq("status","pending").select("*");
      if(error) return json({success:false,error:"Could not update package request."},500);
      return json({success:true,requests:updated||[]});
    }
    if(action==="payout_quote"||action==="payout_send"){
      const apiKey=Deno.env.get("BLM_PAY_PAYOUT_API_KEY")?.trim();
      if(!apiKey) return json({success:false,error:"BLMPay payout API key is not configured."},503);
      const authorId=clean(body?.author_id,60), amount=Number(body?.amount_tzs), p=phone(body?.phone), network=clean(body?.network,30).toUpperCase();
      if(!authorId||!Number.isSafeInteger(amount)||amount<=0||p.length<11||p.length>15||!networks.has(network)||network==="OTHER") return json({success:false,error:"Select a valid author, whole TZS amount, phone and supported mobile network."},400);
      const {data:author,error:authorError}=await admin.from("author_studio_profiles").select("id,full_name,phone,payout_network").eq("id",authorId).maybeSingle();
      if(authorError||!author) return json({success:false,error:"Author not found."},404);
      if(phone(author.phone)!==p||String(author.payout_network).toUpperCase()!==network) return json({success:false,error:"Payout phone/network must match the verified author record. Update the record through Authority review first."},400);
      const [salesResult,payoutResult]=await Promise.all([
        admin.from("author_studio_sales").select("author_net_tzs").eq("author_id",authorId),
        admin.from("author_studio_payouts").select("amount_tzs,status").eq("author_id",authorId)
      ]);
      if(salesResult.error||payoutResult.error) return json({success:false,error:"Could not verify the author balance."},500);
      const earned=(salesResult.data||[]).reduce((n:number,x:any)=>n+Number(x.author_net_tzs||0),0);
      const used=(payoutResult.data||[]).filter((x:any)=>["initiated","pending","processing","completed"].includes(x.status)).reduce((n:number,x:any)=>n+Number(x.amount_tzs||0),0);
      if(amount>money(earned-used)) return json({success:false,error:"Payout exceeds the available author balance."},400);
      const lookup=await provider("/payouts/name-lookup",""+apiKey,"POST",{channel:"mobile",account_number:p});
      if(!lookup.ok) return json({success:false,error:"BLMPay could not verify the recipient name.",provider_status:lookup.status},502);
      const recipient=payload(lookup.data);
      const quote=await provider("/payouts/fee?amount="+encodeURIComponent(String(amount))+"&channel=mobile",""+apiKey);
      if(!quote.ok) return json({success:false,error:"BLMPay fee quote failed; no payout was sent.",provider_status:quote.status},502);
      if(action==="payout_quote") return json({success:true,recipient_name:recipient.account_name||recipient.accountName||recipient.name||null,amount_tzs:amount,fee_quote:payload(quote.data),fee_paid_by:"I|ONE",author_balance_tzs:money(earned-used)});
      if(String(body?.recipient_confirmed)!=="true") return json({success:false,error:"Confirm the BLMPay recipient name before sending."},400);
      const recipientName=clean(recipient.account_name||recipient.accountName||recipient.name,160);
      if(!recipientName) return json({success:false,error:"BLMPay did not return a verified recipient name. No payout was sent."},400);
      const idempotency=clean(body?.idempotency_key,100);
      if(!/^[A-Za-z0-9._:-]{12,100}$/.test(idempotency)) return json({success:false,error:"A valid unique idempotency key is required."},400);
      const {data:existing}=await admin.from("author_studio_payouts").select("id,status,provider_reference").eq("idempotency_key",idempotency).maybeSingle();
      if(existing) return json({success:true,duplicate:true,payout:existing});
      const {data:record,error:insertError}=await admin.from("author_studio_payouts").insert({author_id:authorId,amount_tzs:amount,payout_phone:p, payout_network:network,recipient_name:recipientName,idempotency_key:idempotency,provider_fee_tzs:Number(payload(quote.data).fee||payload(quote.data).fee_tzs||0),status:"initiated",initiated_by:"Authority Press",early_payout_reason:clean(body?.early_payout_reason,500)||null}).select("*").single();
      if(insertError) return json({success:false,error:"Could not reserve payout record; no payout was sent."},409);
      const sent=await provider("/payouts/send",apiKey,"POST",{amount,currency:"TZS",channel:"mobile",recipient_phone:p,network,narration:"I|ONE author book earnings",metadata:{author_id:authorId,payout_id:record.id},},idempotency);
      const out=payload(sent.data);
      const providerStatus=String(out.status||"pending").toLowerCase();
      const status=sent.ok?(["completed","failed","reversed","processing","pending"].includes(providerStatus)?providerStatus:"pending"):"pending";
      const reference=out.reference||out.payout_reference||out.id||null;
      const {data:updated}=await admin.from("author_studio_payouts").update({status,provider_reference:reference,provider_response:{http_status:sent.status,data:out},updated_at:new Date().toISOString(),completed_at:status==="completed"?new Date().toISOString():null}).eq("id",record.id).select("*").single();
      return json({success:sent.ok,payout:updated||record,fee_paid_by:"I|ONE",error:sent.ok?undefined:"BLMPay rejected the payout request; check the provider reference before retrying."},sent.ok?200:502);
    }
    if(action==="payout_status"){
      const ref=clean(body?.provider_reference,160);
      if(!ref) return json({success:false,error:"Provider reference is required."},400);
      const apiKey=Deno.env.get("BLM_PAY_PAYOUT_API_KEY")?.trim();
      if(!apiKey) return json({success:false,error:"BLMPay payout API key is not configured."},503);
      const result=await provider("/payouts/"+encodeURIComponent(ref),apiKey);
      if(!result.ok) return json({success:false,error:"Could not retrieve payout status.",provider_status:result.status},502);
      const p=payload(result.data),status=String(p.status||"pending").toLowerCase();
      const {data:updated,error}=await admin.from("author_studio_payouts").update({status:["completed","failed","reversed","processing","pending"].includes(status)?status:"pending",provider_response:p,updated_at:new Date().toISOString(),completed_at:status==="completed"?new Date().toISOString():null}).eq("provider_reference",ref).select("*").maybeSingle();
      if(error) return json({success:false,error:"Provider status was checked but the ledger could not be updated."},500);
      return json({success:true,payout:updated||null,provider_status:p});
    }
    return json({success:false,error:"Unknown action."},400);
  }catch(e){console.error("author-studio-manage:",e);return json({success:false,error:"Unexpected Author Studio server error."},500);}
});
