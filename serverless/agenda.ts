import type {VercelRequest,VercelResponse} from "@vercel/node";
import {databasePool} from "../src/server/auth.js";
import {getActivitySession} from "../src/server/activity-session.js";
const houses=["Gryffindor","Slytherin","Ravenclaw","Hufflepuff"];
const send=(res:VercelResponse,status:number,data:unknown)=>res.status(status).json(data);
const bad=(res:VercelResponse,message:string)=>send(res,400,{error:message});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader("Cache-Control","no-store");
 try{
  const discord=getActivitySession(req.headers.cookie,req.headers.authorization);if(!discord)return send(res,401,{error:"Connexion Discord requise."});
  const [admin,player]=await Promise.all([databasePool.query("SELECT EXISTS(SELECT 1 FROM app_admins WHERE discord_user_id=$1) AS yes",[discord.id]),databasePool.query("SELECT id,account_status FROM app_users WHERE discord_user_id=$1",[discord.id])]);
  const isAdmin=Boolean(admin.rows[0]?.yes),user=player.rows[0];if(!isAdmin&&user?.account_status!=="approved")return send(res,403,{error:"Compte non autorisé."});
  const body=(req.body&&typeof req.body==="object"?req.body:{}) as Record<string,any>,characterId=String(req.query.characterId??body.characterId??"");
  if(!characterId)return bad(res,"Personnage requis.");
  const actorResult=await databasePool.query("SELECT id,owner_user_id,first_name,last_name,character_type,house FROM characters WHERE id=$1",[characterId]);
  if(!actorResult.rowCount||(!isAdmin&&actorResult.rows[0].owner_user_id!==user?.id))return send(res,403,{error:"Personnage inaccessible."});
  const action=String(req.query.action??body.action??"");
  const query=`SELECT e.*,mine.response AS my_response,(e.created_by_character_id=$1 OR (e.created_by_character_id IS NULL AND e.created_by_user_id=(SELECT owner_user_id FROM characters WHERE id=$1))) AS can_delete,cr.first_name AS creator_first_name,cr.last_name AS creator_last_name,cu.discord_username AS creator_username,
   COALESCE((SELECT json_agg(json_build_object('character_id',p.character_id,'first_name',pc.first_name,'last_name',pc.last_name,'discord_username',pu.discord_username,'response',p.response) ORDER BY CASE p.response WHEN 'accepted' THEN 1 WHEN 'declined' THEN 2 ELSE 3 END,pc.first_name,pc.last_name) FROM agenda_event_participants p JOIN characters pc ON pc.id=p.character_id JOIN app_users pu ON pu.id=pc.owner_user_id WHERE p.event_id=e.id),'[]'::json) AS participants
   FROM agenda_events e LEFT JOIN agenda_event_participants mine ON mine.event_id=e.id AND mine.character_id=$1
   LEFT JOIN characters cr ON cr.id=e.created_by_character_id LEFT JOIN app_users cu ON cu.id=cr.owner_user_id
   WHERE mine.character_id IS NOT NULL OR e.created_by_character_id=$1 ORDER BY e.starts_at`;
  if(req.method==="GET"&&action==="list"){const result=await databasePool.query(query,[characterId]);return send(res,200,{events:result.rows});}
  if(req.method==="POST"&&action==="create"){
   const title=String(body.title??"").trim(),location=String(body.location??"").trim(),description=String(body.description??"").trim(),start=new Date(String(body.startsAt??"")),visibility=String(body.visibility??"all"),house=body.house?String(body.house):null;
   if(!title||!location||!body.startsAt||Number.isNaN(start.getTime()))return bad(res,"Nom, lieu, date et heure obligatoires.");
   if(!["all","students","staff","house"].includes(visibility))return bad(res,"Public invalide.");
   if(visibility==="house"&&!houses.includes(house||""))return bad(res,"Maison invalide.");
   if(start.getTime()<=Date.now())return bad(res,"Choisis une date et une heure futures.");
   const check=await databasePool.query("SELECT EXTRACT(DAY FROM now() AT TIME ZONE 'Europe/Paris')::int AS day,EXTRACT(YEAR FROM now() AT TIME ZONE 'Europe/Paris')::int AS cy,EXTRACT(MONTH FROM now() AT TIME ZONE 'Europe/Paris')::int AS cm,EXTRACT(YEAR FROM $1::timestamptz AT TIME ZONE 'Europe/Paris')::int AS ey,EXTRACT(MONTH FROM $1::timestamptz AT TIME ZONE 'Europe/Paris')::int AS em",[start.toISOString()]);
   const v=check.rows[0],diff=(v.ey*12+v.em)-(v.cy*12+v.cm);if(diff<0||diff>(v.day>=25?1:0))return bad(res,"Le mois suivant est accessible uniquement à partir du 25 du mois en cours.");
   const client=await databasePool.connect();
   try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO agenda_events(title,description,location,starts_at,visibility,house,created_by_user_id,created_by_character_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",[title,description||null,location,start.toISOString(),visibility,house,user?.id||null,characterId]);
    const eventId=inserted.rows[0].id;
    const targetSql=visibility==="all"?"SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved'":visibility==="students"?"SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved' AND c.character_type='student'":visibility==="staff"?"SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved' AND c.character_type='staff'":"SELECT c.id FROM characters c JOIN app_users u ON u.id=c.owner_user_id WHERE u.account_status='approved' AND c.character_type='student' AND c.house=$1";
    const targets=await client.query(targetSql,visibility==="house"?[house]:[]);
    const ids=[...new Set([...targets.rows.map((x:any)=>x.id),characterId])];
    await client.query("INSERT INTO agenda_event_participants(event_id,character_id,response) SELECT $1,x,CASE WHEN x=$3::uuid THEN 'accepted' ELSE 'invited' END FROM unnest($2::uuid[]) AS t(x) ON CONFLICT(event_id,character_id) DO NOTHING",[eventId,ids,characterId]);
    const notify=ids.filter(id=>id!==characterId);
    if(notify.length)await client.query("INSERT INTO notifications(character_id,notification_type,title,body,target_type,target_id) SELECT unnest($1::uuid[]),'agenda_event','Nouvel événement',$2,'agenda_event',$3",[notify,"Un nouvel événement a été proposé : "+title,eventId]);
    await client.query("COMMIT");return send(res,201,{id:eventId});
   }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
  if(req.method==="POST"&&action==="respond"){
   const eventId=String(body.eventId??""),response=String(body.response??"");if(!eventId||!["accepted","declined"].includes(response))return bad(res,"Réponse invalide.");
   const result=await databasePool.query("UPDATE agenda_event_participants p SET response=$1 FROM agenda_events e WHERE p.event_id=e.id AND p.event_id=$2 AND p.character_id=$3 AND e.cancelled_at IS NULL AND e.starts_at>now() RETURNING p.event_id",[response,eventId,characterId]);
   if(!result.rowCount)return send(res,409,{error:"La réponse n'est plus modifiable pour cet événement."});return send(res,200,{ok:true});
  }
  if(req.method==="POST"&&action==="cancel"){
   const eventId=String(body.eventId??"");
   const event=await databasePool.query("SELECT id FROM agenda_events WHERE id=$1 AND (created_by_character_id=$2 OR (created_by_character_id IS NULL AND created_by_user_id=$3))",[eventId,characterId,user?.id||null]);
   if(!event.rowCount)return send(res,403,{error:"Seul le personnage qui a publié cet événement peut le supprimer."});
   const client=await databasePool.connect();
   try{
    await client.query("BEGIN");
    await client.query("DELETE FROM notifications WHERE target_type='agenda_event' AND target_id=$1",[eventId]);
    await client.query("DELETE FROM agenda_event_participants WHERE event_id=$1",[eventId]);
    await client.query("DELETE FROM agenda_events WHERE id=$1",[eventId]);
    await client.query("COMMIT");
    return send(res,200,{ok:true});
   }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }
  return bad(res,"Action Agenda inconnue.");
 }catch(error){console.error("Hogwarts Phone Agenda API:",error);return send(res,500,{error:"Une erreur est survenue. Réessaie."});}
}