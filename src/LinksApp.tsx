import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Check, Clock3, HeartHandshake, MessageCircle, Plus, Search, Send, Trash2, UserRound, X } from "lucide-react";
import "./links.css";

type Person = { id:string; first_name?:string; last_name?:string; character_type?:string; house?:string|null; role_title?:string|null; avatar_url?:string|null; sexual_orientation?:string|null; biography?:string|null };
type LinkItem = { type:string; category:string; detail?:string };
type Profile = { character_id:string; description:string|null; desired_links:LinkItem[]; published_at:string; last_bumped_at:string; next_bump_at:string; first_name:string; last_name:string; character_type:string; house:string|null; avatar_url:string|null; sexual_orientation:string|null; role_title:string|null };
type Request = { id:string; from_character_id:string; to_character_id:string; relationship_type:string; relationship_category:string; message:string|null; request_status:string; created_at:string; ended_at:string|null; from_first_name:string; from_last_name:string; from_avatar_url:string|null; from_character_type:string; to_first_name:string; to_last_name:string; to_avatar_url:string|null; to_character_type:string };
type Relationship = { id:string; relationship_type:string; relationship_category:string; ended_at:string|null; other_character_id:string; other_first_name:string; other_last_name:string; other_avatar_url:string|null };
type Discussion = { discussion_id:string; conversation_id:string; request_id:string|null; other_character_id:string; other_first_name:string; other_last_name:string; other_avatar_url:string|null; relationship_type:string|null; last_message:string|null; last_message_at:string|null; unread_count:number };
type Dashboard = { profile:Profile|null; profiles:Profile[]; requests:Request[]; relationships:Relationship[]; discussions:Discussion[] };
type Props = { current:Person };

const presets:LinkItem[] = [
 {type:"Couple",category:"romance"},{type:"Plan cul",category:"romance"},{type:"Plan d'un soir",category:"romance"},{type:"Future couple",category:"romance"},{type:"Crush",category:"romance"},{type:"Ambiguë",category:"romance"},
 {type:"Amitié simple",category:"friendship"},{type:"Meilleur ami",category:"friendship"},{type:"Ami d'enfance",category:"friendship"},
 {type:"Rivalité",category:"rivalry"},{type:"Ennemis",category:"rivalry"},
 {type:"Ex-couple",category:"past"},{type:"Ex-ami",category:"past"},{type:"Ex-plan cul",category:"past"},
 {type:"Frère / sœur",category:"family"},{type:"Père / mère",category:"family"},{type:"Oncle / tante",category:"family"},{type:"Cousin / cousine",category:"family"},{type:"Autre lien familial",category:"family"}
];
const categoryLabel:Record<string,string>={romance:"Amour",friendship:"Amitié",family:"Famille",rivalry:"Rivalité / ennemis",past:"Anciennes relations",other:"Autres"};
const nameOf=(p:{first_name?:string;last_name?:string})=>[p.first_name,p.last_name].filter(Boolean).join(" ");
const dateOf=(v:string)=>new Date(v).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
const tokenHeaders=()=>{const token=localStorage.getItem("hogwarts_session");return token?{Authorization:"Bearer "+token}:{};};

export default function LinksApp({current}:Props){
 const [dashboard,setDashboard]=useState<Dashboard>({profile:null,profiles:[],requests:[],relationships:[],discussions:[]});
 const [people,setPeople]=useState<Person[]>([]);
 const [tab,setTab]=useState("mine");
 const [kindTab,setKindTab]=useState("student");
 const [search,setSearch]=useState("");
 const [description,setDescription]=useState("");
 const [desired,setDesired]=useState<LinkItem[]>([]);
 const [customDrafts,setCustomDrafts]=useState<string[]>([]);
 const [selectedProfile,setSelectedProfile]=useState<Profile|null>(null);
 const [proposal,setProposal]=useState<{target:Profile;type:string;category:string;message:string;customType:string}|null>(null);
 const [editing,setEditing]=useState<Request|null>(null);
 const [activeCategory,setActiveCategory]=useState("all");
 const [showHistory,setShowHistory]=useState(false);
 const [activeDiscussion,setActiveDiscussion]=useState<Discussion|null>(null);
 const [messages,setMessages]=useState<any[]>([]);
 const [chatText,setChatText]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);

 const call=async(action:string,method="GET",data:Record<string,unknown>={},query:Record<string,string>={})=>{
  const params=new URLSearchParams({action,characterId:current.id,...query});
  const response=await fetch("/api/links?"+params.toString(),{method,credentials:"include",headers:{"Content-Type":"application/json",...tokenHeaders()},...(method==="GET"?{}:{body:JSON.stringify({...data,characterId:current.id,action})})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Une erreur est survenue.");
  return result;
 };
 const dataCall=async(action:string,method="GET",data:Record<string,unknown>={},query:Record<string,string>={})=>{
  const params=new URLSearchParams({action,characterId:current.id,...query});
  const response=await fetch("/api/data?"+params.toString(),{method,credentials:"include",headers:{"Content-Type":"application/json",...tokenHeaders()},...(method==="GET"?{}:{body:JSON.stringify({...data,characterId:current.id,action})})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Une erreur est survenue.");
  return result;
 };
 async function refresh(){
  const d=await call("dashboard");
  setDashboard({profile:d.profile,profiles:d.profiles||[],requests:d.requests||[],relationships:d.relationships||[],discussions:d.discussions||[]});
  if(d.profile){setDescription(d.profile.description||"");setDesired(d.profile.desired_links||[]);}
 }
 async function loadPeople(){
  try{const d=await dataCall("contacts");setPeople(d.characters||[]);}catch{}
 }
 useEffect(()=>{void refresh().catch(e=>setNotice(e.message));void loadPeople();},[current.id]);

 const visibleProfiles=useMemo(()=>dashboard.profiles.filter(p=>p.character_type===kindTab).filter(p=>nameOf(p).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))),[dashboard.profiles,kindTab,search]);
 const sent=dashboard.requests.filter(r=>r.from_character_id===current.id&&r.request_status==="pending");
 const received=dashboard.requests.filter(r=>r.to_character_id===current.id&&r.request_status==="pending");
 const activeLinks=dashboard.relationships.filter(r=>!r.ended_at);
 const oldLinks=dashboard.relationships.filter(r=>Boolean(r.ended_at));
 const visibleRelationships=(showHistory?oldLinks:activeLinks).filter(r=>activeCategory==="all"||r.relationship_category===activeCategory);
 const nextBump=dashboard.profile?.next_bump_at?new Date(dashboard.profile.next_bump_at):null;
 const canBump=Boolean(dashboard.profile&&nextBump&&Date.now()>=nextBump.getTime());

 async function saveProfile(e:FormEvent){
  e.preventDefault();setBusy(true);setNotice("");
  try{
   const list=[...desired,...customDrafts.map(type=>({type:type.trim(),category:"other",detail:""})).filter(x=>x.type)];
   const d=await call("profile-save","POST",{description,desiredLinks:list});
   setCustomDrafts([]);await refresh();setNotice("Ta demande de liens est publiée et visible par les autres personnages.");
  }catch(e){setNotice(e instanceof Error?e.message:"Publication impossible.");}
  finally{setBusy(false);}
 }
 function togglePreset(item:LinkItem,checked:boolean){
  setDesired(old=>checked?[...old.filter(x=>x.type!==item.type),item]:old.filter(x=>x.type!==item.type));
 }
 function addCustom(){setCustomDrafts(old=>[...old,""]);}
 async function bump(){
  setBusy(true);setNotice("");
  try{await call("bump","POST");await refresh();setNotice("Ton profil est remonté en haut de la liste.");}
  catch(e){setNotice(e instanceof Error?e.message:"Remontée impossible.");}
  finally{setBusy(false);}
 }
 function openProposal(target:Profile){
  const first=target.desired_links?.[0]||{type:"Amitié simple",category:"friendship"};
  setProposal({target,type:first.type,category:first.category||"other",message:"",customType:""});
 }
 async function sendProposal(e:React.FormEvent){
  e.preventDefault();if(!proposal)return;setBusy(true);setNotice("");
  try{await call("propose","POST",{toCharacterId:proposal.target.character_id,relationshipType:proposal.type==="__custom"?"Autre : "+proposal.customType:proposal.type,relationshipCategory:proposal.category,message:proposal.message});setProposal(null);setSelectedProfile(null);await refresh();setNotice("Proposition envoyée. Une discussion de lien a également été créée.");}
  catch(e){setNotice(e instanceof Error?e.message:"Proposition impossible.");}
  finally{setBusy(false);}
 }
 async function respond(requestId:string,status:"accepted"|"declined"){
  setBusy(true);try{await call("respond","POST",{requestId,status});await refresh();setNotice(status==="accepted"?"Lien accepté et ajouté à Mes liens.":"Proposition refusée.");}
  catch(e){setNotice(e instanceof Error?e.message:"Réponse impossible.");}finally{setBusy(false);}
 }
 async function cancelRequest(requestId:string){
  setBusy(true);try{await call("cancel","POST",{requestId});await refresh();setNotice("Proposition annulée.");}
  catch(e){setNotice(e instanceof Error?e.message:"Annulation impossible.");}finally{setBusy(false);}
 }
 async function editRequest(e:React.FormEvent){
  e.preventDefault();if(!editing)return;const form=new FormData(e.currentTarget as HTMLFormElement);
  setBusy(true);try{await call("edit-request","POST",{requestId:editing.id,relationshipType:String(form.get("relationshipType")),relationshipCategory:String(form.get("relationshipCategory")),message:String(form.get("message")||"")});setEditing(null);await refresh();setNotice("Proposition modifiée.");}
  catch(e){setNotice(e instanceof Error?e.message:"Modification impossible.");}finally{setBusy(false);}
 }
 async function removeLink(link:Relationship){
  if(!window.confirm("Es-tu sûr de vouloir supprimer ce lien ? L'autre personnage sera averti qu'il a perdu ce lien."))return;
  setBusy(true);try{await call("remove-link","POST",{requestId:link.id});await refresh();setNotice("Lien déplacé dans Anciens liens. L'autre personnage a été averti.");}
  catch(e){setNotice(e instanceof Error?e.message:"Suppression impossible.");}finally{setBusy(false);}
 }
 async function openDiscussion(item:Discussion){
  setActiveDiscussion(item);
  try{
   await dataCall("conversation-read","POST",{conversationId:item.conversation_id});
   const d=await dataCall("messages","GET",{}, {conversationId:item.conversation_id});
   setMessages(d.messages||[]);
   await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:"Impossible d'ouvrir la discussion.");}
 }
 async function startDiscussion(target:Profile){
  setBusy(true);try{const d=await call("discussion-create","POST",{targetCharacterId:target.character_id});await refresh();const item=dashboard.discussions.find(x=>x.conversation_id===d.conversationId)||{discussion_id:d.discussionId,conversation_id:d.conversationId,other_character_id:target.character_id,other_first_name:target.first_name,other_last_name:target.last_name,other_avatar_url:target.avatar_url,last_message:null,last_message_at:null,unread_count:0,relationship_type:null,request_id:null,created_at:new Date().toISOString()};setActiveDiscussion(item as Discussion);const m=await dataCall("messages","GET",{}, {conversationId:d.conversationId});setMessages(m.messages||[]);setSelectedProfile(null);setTab("discussions");}
  catch(e){setNotice(e instanceof Error?e.message:"Impossible de créer la discussion.");}finally{setBusy(false);}
 }
 async function deleteDiscussion(item:Discussion){
  if(!window.confirm("Supprimer cette discussion de ton côté uniquement ? L'autre personnage conservera son historique."))return;
  try{await call("discussion-hide","POST",{discussionId:item.discussion_id});setActiveDiscussion(null);await refresh();setNotice("Discussion supprimée de ton côté.");}
  catch(e){setNotice(e instanceof Error?e.message:"Suppression impossible.");}
 }
 async function sendMessage(e:React.FormEvent){
  e.preventDefault();if(!activeDiscussion||!chatText.trim())return;setBusy(true);
  try{await dataCall("message","POST",{conversationId:activeDiscussion.conversation_id,body:chatText.trim()});setChatText("");const d=await dataCall("messages","GET",{}, {conversationId:activeDiscussion.conversation_id});setMessages(d.messages||[]);await refresh();}
  catch(e){setNotice(e instanceof Error?e.message:"Message impossible à envoyer.");}finally{setBusy(false);}
 }

 const profileFor=(id:string)=>dashboard.profiles.find(p=>p.character_id===id);
 const otherPerson=(id:string)=>people.find(p=>p.id===id);
 const openRelatedProfile=(id:string)=>{
  const profile=profileFor(id);if(profile)setSelectedProfile(profile);
  else {const person=otherPerson(id);if(person)setSelectedProfile({character_id:person.id,first_name:person.first_name,last_name:person.last_name,character_type:person.character_type,house:person.house||null,avatar_url:person.avatar_url||null,sexual_orientation:person.sexual_orientation||null,role_title:person.role_title||null,description:person.biography||null,desired_links:[],published_at:"",last_bumped_at:"",next_bump_at:""} as Profile);}
 };
 const categoryOptions=["romance","friendship","rivalry","family","past","other"];

 return <section className="links-app">
  <div className="links-tabs" role="tablist" aria-label="Demandes de liens">
   {[["mine","Ma demande de liens"],["browse","Liens recherchés"],["requests","Demandes en cours"],["relationships","Mes liens"],["discussions","Discussions de liens"]].map(([id,label])=><button type="button" key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setNotice("");}}>{label}</button>)}
  </div>
  {notice&&<p className="links-notice">{notice}</p>}

  {tab==="mine"&&<div className="links-section">
   <div className="links-section-heading"><div><p className="eyebrow">TON PROFIL DE RECHERCHE</p><h4>Ma demande de liens</h4></div>{dashboard.profile&&<span className="links-published">Publié</span>}</div>
   <form className="links-form" onSubmit={saveProfile}>
    <label className="links-field">Description facultative<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Présente ton personnage et ce qu'il recherche…"/></label>
    <div className="links-choice-grid">
     {presets.map(item=><label key={item.type} className="links-choice"><input type="checkbox" checked={desired.some(x=>x.type===item.type)} onChange={e=>togglePreset(item,e.target.checked)}/><span>{item.type}</span></label>)}
    </div>
    {desired.filter(x=>["Rivalité","Ennemis"].includes(x.type)).map(item=><label key={item.type} className="links-field">Précisions pour « {item.type} »<input value={item.detail||""} onChange={e=>setDesired(old=>old.map(x=>x.type===item.type?{...x,detail:e.target.value}:x))} placeholder="Précise le type de relation souhaité…"/></label>)}
    <div className="links-custom-list"><div className="links-list-heading"><strong>Autres liens personnalisés</strong><button type="button" onClick={addCustom}><Plus size={15}/> Ajouter</button></div>
     {customDrafts.map((value,index)=><div className="links-custom-row" key={index}><input value={value} onChange={e=>setCustomDrafts(old=>old.map((x,i)=>i===index?e.target.value:x))} placeholder="Écris le lien souhaité…"/><button type="button" aria-label="Supprimer cette ligne" onClick={()=>setCustomDrafts(old=>old.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}
     {desired.filter(x=>x.category==="other").map((item,index)=><div className="links-custom-row" key={"saved-"+index}><input value={item.type} onChange={e=>setDesired(old=>old.map(x=>x===item?{...x,type:e.target.value}:x))}/><button type="button" onClick={()=>setDesired(old=>old.filter(x=>x!==item))}><X size={15}/></button></div>)}
    </div>
    <button className="links-primary" disabled={busy}>{busy?"Publication…":dashboard.profile?"Enregistrer les modifications":"Publier ma demande de liens"}</button>
   </form>
   {dashboard.profile&&<div className="links-bump-card"><div><strong>Remonter mon profil</strong><p>Tu peux remonter ta fiche en haut de la liste une fois par mois.</p><small>{canBump?"Disponible maintenant":"Prochaine disponibilité : "+(nextBump?dateOf(nextBump.toISOString()):"—")}</small></div><button type="button" disabled={!canBump||busy} onClick={()=>void bump()}>{canBump?"Remonter":"Indisponible"}</button></div>}
   {dashboard.profile&&<button type="button" className="links-danger-link" onClick={async()=>{if(!window.confirm("Supprimer ta demande de liens ? Ton profil ne sera plus visible dans Liens recherchés."))return;try{await call("profile-delete","POST");setDesired([]);setDescription("");await refresh();setNotice("Ta demande de liens a été supprimée.");}catch(e){setNotice(e instanceof Error?e.message:"Suppression impossible.");}}}><Trash2 size={15}/> Supprimer ma demande</button>}
  </div>}

  {tab==="browse"&&<div className="links-section">
   <div className="links-subtabs"><button className={kindTab==="student"?"active":""} onClick={()=>{setKindTab("student");setSearch("");}}>Élèves</button><button className={kindTab==="staff"?"active":""} onClick={()=>{setKindTab("staff");setSearch("");}}>Employés</button></div>
   <label className="links-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={"Rechercher un "+(kindTab==="student"?"élève":"employé")+" par prénom ou nom…"}/></label>
   <p className="links-count">{visibleProfiles.length} profil{visibleProfiles.length>1?"s":""}</p>
   <div className="links-profile-grid">{visibleProfiles.map(p=><button type="button" key={p.character_id} className="links-profile-card" onClick={()=>setSelectedProfile(p)}>{p.avatar_url?<img src={p.avatar_url} alt=""/>:<span className="links-avatar-fallback"><UserRound/></span>}<strong>{nameOf(p)}</strong><small>{p.character_type==="student"?"Élève":p.role_title||"Employé"}</small><span className="links-tags">{p.desired_links?.slice(0,3).map(x=><i key={x.type}>{x.category==="other"?"Autre : "+x.type:x.type}</i>)}</span></button>)}</div>
   {!visibleProfiles.length&&<p className="links-empty">Aucun profil publié dans cette catégorie.</p>}
  </div>}

  {tab==="requests"&&<div className="links-section">
   <section className="links-request-group"><h4>Propositions reçues <span>{received.length}</span></h4>{received.map(r=><article className="links-request-card" key={r.id}><div className="links-request-person">{r.from_avatar_url?<img src={r.from_avatar_url} alt=""/>:<UserRound/>}<strong>{r.from_first_name} {r.from_last_name}</strong></div><p><b>{r.relationship_type}</b> · {categoryLabel[r.relationship_category]||"Autre"}</p>{r.message&&<p className="links-request-message">{r.message}</p>}<div className="links-actions"><button disabled={busy} onClick={()=>void respond(r.id,"accepted")}><Check size={15}/> Accepter</button><button className="secondary" disabled={busy} onClick={()=>void respond(r.id,"declined")}>Refuser</button></div></article>)}{!received.length&&<p className="links-empty">Aucune proposition reçue en attente.</p>}</section>
   <section className="links-request-group"><h4>Propositions envoyées <span>{sent.length}</span></h4>{sent.map(r=><article className="links-request-card" key={r.id}><strong>{r.to_first_name} {r.to_last_name}</strong><p>{r.relationship_type} · En attente</p>{r.message&&<p>{r.message}</p>}<div className="links-actions"><button className="secondary" onClick={()=>setEditing(r)}>Modifier</button><button className="danger" onClick={()=>void cancelRequest(r.id)}>Annuler la demande</button></div></article>)}{!sent.length&&<p className="links-empty">Aucune proposition envoyée en attente.</p>}</section>
  </div>}

  {tab==="relationships"&&<div className="links-section">
   <div className="links-history-switch"><button className={!showHistory?"active":""} onClick={()=>setShowHistory(false)}>Liens actifs ({activeLinks.length})</button><button className={showHistory?"active":""} onClick={()=>setShowHistory(true)}>Anciens liens ({oldLinks.length})</button></div>
   <div className="links-category-strip">{[["all","Tous"],...Object.entries(categoryLabel)].map(([id,label])=><button key={id} className={activeCategory===id?"active":""} onClick={()=>setActiveCategory(id)}>{label}</button>)}</div>
   {visibleRelationships.map(link=><article className={"links-relationship-card"+(showHistory?" old":"")} key={link.id}><button className="links-relationship-main" onClick={()=>openRelatedProfile(link.other_character_id)}>{link.other_avatar_url?<img src={link.other_avatar_url} alt=""/>:<UserRound/>}<span><strong>{link.other_first_name} {link.other_last_name}</strong><small>{link.relationship_type}{showHistory?" · Lien terminé":""}</small></span><span>›</span></button>{!showHistory&&<button className="links-remove" disabled={busy} onClick={()=>void removeLink(link)}><Trash2 size={14}/> Supprimer le lien</button>}</article>)}
   {!visibleRelationships.length&&<p className="links-empty">{showHistory?"Aucun ancien lien pour le moment.":"Aucun lien accepté pour le moment."}</p>}
  </div>}

  {tab==="discussions"&&<div className="links-section">
   {!activeDiscussion?<><h4>Discussions de liens</h4><div className="links-discussion-list">{dashboard.discussions.map(d=><button key={d.discussion_id} className="links-discussion-row" onClick={()=>void openDiscussion(d)}>{d.other_avatar_url?<img src={d.other_avatar_url} alt=""/>:<UserRound/>}<span><strong>{d.other_first_name} {d.other_last_name}</strong><small>{d.relationship_type||"Discussion de lien"} · {d.last_message||"Aucun message pour le moment"}</small></span>{Number(d.unread_count)>0&&<i>{d.unread_count}</i>}<span className="links-discussion-delete" onClick={e=>{e.stopPropagation();void deleteDiscussion(d);}}><Trash2 size={15}/></span></button>)}</div>{!dashboard.discussions.length&&<p className="links-empty">Aucune discussion de lien pour le moment. Ouvre un profil et choisis « Envoyer un message pour discuter d'un lien ».</p>}</>
    :<div className="links-chat"><div className="links-chat-heading"><button onClick={()=>setActiveDiscussion(null)}><ArrowLeft size={17}/></button>{activeDiscussion.other_avatar_url?<img src={activeDiscussion.other_avatar_url} alt=""/>:<UserRound/>}<strong>{activeDiscussion.other_first_name} {activeDiscussion.other_last_name}</strong><button className="links-chat-delete" onClick={()=>void deleteDiscussion(activeDiscussion)}><Trash2 size={15}/></button></div><div className="links-chat-messages">{messages.map(m=><div className={m.sender_character_id===current.id?"mine":""} key={m.id}><small>{m.first_name} {m.last_name}</small><p>{m.body}</p><time>{new Date(m.sent_at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>)}</div><form className="links-chat-composer" onSubmit={sendMessage}><input value={chatText} onChange={e=>setChatText(e.target.value)} placeholder="Écrire un message…"/><button disabled={busy||!chatText.trim()}><Send size={17}/></button></form></div>}
  </div>}

  {selectedProfile&&<div className="links-modal-backdrop" onClick={()=>setSelectedProfile(null)}><article className="links-profile-modal" onClick={e=>e.stopPropagation()}><div className="links-modal-head"><span className="eyebrow">PROFIL DE RECHERCHE</span><button onClick={()=>setSelectedProfile(null)}><X/></button></div><div className="links-modal-hero">{selectedProfile.avatar_url?<img src={selectedProfile.avatar_url} alt=""/>:<UserRound/>}<h3>{nameOf(selectedProfile)}</h3><small>{selectedProfile.character_type==="student"?"Élève":selectedProfile.role_title||"Employé"}</small><p>Orientation : {selectedProfile.sexual_orientation||"Non renseignée"}</p></div>{selectedProfile.description&&<p className="links-modal-description">{selectedProfile.description}</p>}<h4>Ce que je recherche</h4><div className="links-modal-tags">{selectedProfile.desired_links?.map(x=><span key={x.type}>{x.category==="other"?"Autre : "+x.type:x.type}{x.detail?" · "+x.detail:""}</span>)}</div><div className="links-actions"><button onClick={()=>openProposal(selectedProfile)}>Proposer un lien</button><button className="secondary" onClick={()=>void startDiscussion(selectedProfile)}><MessageCircle size={15}/> Envoyer un message pour discuter d'un lien</button></div></article></div>}

  {proposal&&<div className="links-modal-backdrop" onClick={()=>setProposal(null)}><form className="links-form-modal" onSubmit={sendProposal} onClick={e=>e.stopPropagation()}><div className="links-modal-head"><h4>Proposer un lien à {nameOf(proposal.target)}</h4><button type="button" onClick={()=>setProposal(null)}><X/></button></div><label className="links-field">Type de lien<select value={proposal.type} onChange={e=>{const found=proposal.target.desired_links.find(x=>x.type===e.target.value);setProposal(old=>old?{...old,type:e.target.value,category:found?.category||"other"}:old);}}>{proposal.target.desired_links.map(x=><option key={x.type} value={x.type}>{x.type}</option>)}<option value="__custom">Autre proposition…</option></select></label>{proposal.type==="__custom"&&<label className="links-field">Précise le lien<input required value={proposal.customType} onChange={e=>setProposal(old=>old?{...old,customType:e.target.value}:old)} placeholder="Ex. partenaire de duel"/></label>}<label className="links-field">Catégorie<select value={proposal.category} onChange={e=>setProposal(old=>old?{...old,category:e.target.value}:old)}>{categoryOptions.map(x=><option key={x} value={x}>{categoryLabel[x]}</option>)}</select></label><label className="links-field">Message facultatif<textarea rows={3} value={proposal.message} onChange={e=>setProposal(old=>old?{...old,message:e.target.value}:old)} placeholder="Ajoute un petit message…"/></label><button className="links-primary" disabled={busy}>{busy?"Envoi…":"Envoyer la proposition"}</button></form></div>}

  {editing&&<div className="links-modal-backdrop" onClick={()=>setEditing(null)}><form className="links-form-modal" onSubmit={editRequest} onClick={e=>e.stopPropagation()}><div className="links-modal-head"><h4>Modifier la proposition</h4><button type="button" onClick={()=>setEditing(null)}><X/></button></div><label className="links-field">Type de lien<input name="relationshipType" defaultValue={editing.relationship_type} required/></label><label className="links-field">Catégorie<select name="relationshipCategory" defaultValue={editing.relationship_category}>{categoryOptions.map(x=><option key={x} value={x}>{categoryLabel[x]}</option>)}</select></label><label className="links-field">Message<textarea name="message" defaultValue={editing.message||""}/></label><button className="links-primary" disabled={busy}>Enregistrer</button></form></div>}
 </section>;
}
