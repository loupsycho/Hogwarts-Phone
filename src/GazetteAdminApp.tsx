import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Camera, Check, MessageCircle, Newspaper, Plus, Send, Trash2, Upload, X } from "lucide-react";
import "./gazette.css";

type AdminArticle={id:string;title:string;summary:string|null;body:string;category:string;publication_status:string;published_at:string|null;image_url:string|null;likes:number;dislikes:number;reactions:{name:string;reaction:"like"|"dislike"}[]};
type Thread={thread_id:string;character_id:string;first_name:string;last_name:string;avatar_url:string|null;character_type:string;unread_count:number;last_message:string|null;last_message_at:string|null};
type Character={id:string;first_name:string;last_name:string;character_type:string;house:string|null;role_title:string|null};
type Message={id:string;sender_type:"character"|"gazette";body:string;created_at:string;media_url:string|null;first_name?:string;last_name?:string};
type Dashboard={articles:AdminArticle[];threads:Thread[];characters:Character[];avatarUrl:string|null;unreadMessages:number};
const headers=():Record<string,string>=>{const token=localStorage.getItem("hogwarts_session");return token?{Authorization:"Bearer "+token}:{};};

async function uploadGazetteImage(file:File){
  if(!file.type.startsWith("image/"))throw new Error("Choisis une image.");
  if(file.size>10*1024*1024)throw new Error("Le fichier doit faire 10 Mo maximum.");
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(new Error("Lecture du fichier impossible."));reader.readAsDataURL(file);});
  const response=await fetch("/api/media",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",...headers()},body:JSON.stringify({kind:"gazette",mimeType:file.type,fileName:file.name,data})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Importation impossible.");
  return result;
}

export default function GazetteAdminApp(){
  const [dashboard,setDashboard]=useState<Dashboard>({articles:[],threads:[],characters:[],avatarUrl:null,unreadMessages:0});
  const [selectedThread,setSelectedThread]=useState<string|null>(null);
  const [threadMessages,setThreadMessages]=useState<Message[]>([]);
  const [threadName,setThreadName]=useState("");
  const [reply,setReply]=useState("");
  const [targetCharacter,setTargetCharacter]=useState("");
  const [directMessage,setDirectMessage]=useState("");
  const [title,setTitle]=useState("");
  const [summary,setSummary]=useState("");
  const [articleBody,setArticleBody]=useState("");
  const [category,setCategory]=useState("Actualité");
  const [articlePhoto,setArticlePhoto]=useState<File|null>(null);
  const [avatarPhoto,setAvatarPhoto]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [articleToDelete,setArticleToDelete]=useState<AdminArticle|null>(null);

  async function call(action:string,method="GET",data:Record<string,unknown>={},query:Record<string,string>={}){
    const params=new URLSearchParams({action,...query});
    const response=await fetch("/api/gazette?"+params.toString(),{method,credentials:"include",headers:{"Content-Type":"application/json",...headers()},...(method==="GET"?{}:{body:JSON.stringify({...data,action})})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Une erreur est survenue.");
    return result;
  }
  async function refresh(){
    const d=await call("admin-dashboard");
    setDashboard({articles:d.articles||[],threads:d.threads||[],characters:d.characters||[],avatarUrl:d.avatarUrl||null,unreadMessages:Number(d.unreadMessages)||0});
    return d as Dashboard;
  }
  useEffect(()=>{const update=async()=>{try{await refresh();if(selectedThread){const t=await call("admin-thread","GET",{}, {threadId:selectedThread});setThreadMessages(t.messages||[]);}}catch{}};void update();const timer=window.setInterval(()=>void update(),15000);return()=>window.clearInterval(timer);},[selectedThread]);

  async function openThread(thread:Thread){
    setSelectedThread(thread.thread_id);setThreadName(thread.first_name+" "+thread.last_name);
    try{const d=await call("admin-thread","GET",{}, {threadId:thread.thread_id});setThreadMessages(d.messages||[]);await refresh();}
    catch(e){setNotice(e instanceof Error?e.message:"Impossible d'ouvrir le message.");}
  }
  async function sendReply(e:FormEvent){
    e.preventDefault();if(!selectedThread||!reply.trim())return;
    setBusy(true);try{await call("admin-reply","POST",{threadId:selectedThread,body:reply.trim()});setReply("");const d=await call("admin-thread","GET",{}, {threadId:selectedThread});setThreadMessages(d.messages||[]);await refresh();setNotice("Réponse envoyée sous le nom de la Gazette.");}
    catch(e){setNotice(e instanceof Error?e.message:"Envoi impossible.");}finally{setBusy(false);}
  }
  async function sendDirect(e:FormEvent){
    e.preventDefault();if(!targetCharacter||!directMessage.trim())return;
    setBusy(true);try{await call("admin-send","POST",{targetCharacterId:targetCharacter,body:directMessage.trim()});setDirectMessage("");const updated=await refresh();const thread=updated.threads.find((t:Thread)=>t.character_id===targetCharacter);if(thread){await openThread(thread);}setNotice("Message privé envoyé sous le nom de la Gazette.");}
    catch(e){setNotice(e instanceof Error?e.message:"Envoi impossible.");}finally{setBusy(false);}
  }
  async function publish(e:FormEvent){
    e.preventDefault();if(!title.trim()||!articleBody.trim())return;
    setBusy(true);try{let imageMediaId:string|null=null;if(articlePhoto){const media=await uploadGazetteImage(articlePhoto);imageMediaId=media.id;}await call("admin-publish","POST",{title,summary,body:articleBody,category,imageMediaId});setTitle("");setSummary("");setArticleBody("");setCategory("Actualité");setArticlePhoto(null);await refresh();setNotice("Publication mise en ligne et notification envoyée aux personnages.");}
    catch(e){setNotice(e instanceof Error?e.message:"Publication impossible.");}finally{setBusy(false);}
  }
  async function setAvatar(e:FormEvent){
    e.preventDefault();if(!avatarPhoto)return;
    setBusy(true);try{const media=await uploadGazetteImage(avatarPhoto);await call("admin-avatar","POST",{mediaId:media.id});setAvatarPhoto(null);await refresh();setNotice("Photo de profil de la Gazette mise à jour.");}
    catch(e){setNotice(e instanceof Error?e.message:"Modification impossible.");}finally{setBusy(false);}
  }
  function deleteArticle(article:AdminArticle){
    setArticleToDelete(article);
  }
  async function confirmDeleteArticle(){
    if(!articleToDelete||busy)return;
    setBusy(true);setNotice("");
    try{await call("admin-delete-article","POST",{articleId:articleToDelete.id});setArticleToDelete(null);await refresh();setNotice("Publication supprimée.");}
    catch(e){setNotice(e instanceof Error?e.message:"Suppression impossible.");}
    finally{setBusy(false);}
  }

  return <section className="gazette-admin">
    <div className="gazette-admin-heading"><div><span className="gazette-overline">ESPACE PRIVÉ</span><h3>Administration de la Gazette</h3><p>Publications, courrier des lecteurs et identité du journal.</p></div><span className="gazette-admin-unread">{dashboard.unreadMessages} non lu(s)</span></div>
    {notice&&<p className="gazette-notice">{notice}</p>}

    <section className="gazette-admin-section">
      <h4><Newspaper size={17}/> Publier un article</h4>
      <form className="gazette-admin-form" onSubmit={publish}>
        <label>Titre de l'article<input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="Un titre digne de la Gazette…"/></label>
        <label>Rubrique<input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Actualité, Enquête, Rumeur…"/></label>
        <label>Résumé facultatif<textarea rows={2} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Quelques lignes pour présenter l'article…"/></label>
        <label>Contenu de l'article<textarea rows={6} value={articleBody} onChange={e=>setArticleBody(e.target.value)} required placeholder="Rédige ton article…"/></label>
        <label className="gazette-file-choice"><Camera size={16}/> {articlePhoto?articlePhoto.name:"Ajouter une photo à la publication"}<input type="file" accept="image/*" onChange={e=>setArticlePhoto(e.target.files?.[0]||null)}/></label>
        {articlePhoto&&<button type="button" className="gazette-clear-file" onClick={()=>setArticlePhoto(null)}><X size={14}/> Retirer la photo</button>}
        <button className="gazette-admin-primary" disabled={busy||!title.trim()||!articleBody.trim()}><Plus size={16}/> {busy?"Publication…":"Publier dans la Gazette"}</button>
      </form>
    </section>

    <section className="gazette-admin-section">
      <h4><MessageCircle size={17}/> Messages privés reçus <span>{dashboard.unreadMessages}</span></h4>
      {selectedThread&&<div className="gazette-admin-thread">
        <div className="gazette-admin-thread-head"><strong>{threadName}</strong><button type="button" onClick={()=>setSelectedThread(null)}><X size={17}/> Fermer</button></div>
        <div className="gazette-admin-thread-messages">{threadMessages.map(m=><article className={"gazette-admin-message "+(m.sender_type==="gazette"?"from-gazette":"from-character")} key={m.id}><small>{m.sender_type==="gazette"?"La Gazette du Sorcier":threadName}</small>{m.body&&<p>{m.body}</p>}{m.media_url&&<img src={m.media_url} alt="Photo jointe"/>}<time>{new Date(m.created_at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></article>)}</div>
        <form className="gazette-admin-reply" onSubmit={sendReply}><textarea rows={2} value={reply} onChange={e=>setReply(e.target.value)} placeholder="Répondre sous le nom de la Gazette…"/><button disabled={busy||!reply.trim()}><Send size={16}/> Répondre</button></form>
      </div>}
      <div className="gazette-admin-inbox">{dashboard.threads.map(t=><button type="button" key={t.thread_id} className={"gazette-admin-inbox-row "+(selectedThread===t.thread_id?"active":"")} onClick={()=>void openThread(t)}><span className="gazette-admin-avatar">{t.avatar_url?<img src={t.avatar_url} alt=""/>:<MessageCircle size={17}/>}</span><span className="gazette-admin-inbox-copy"><strong>{t.first_name} {t.last_name}</strong><small>{t.last_message||"Nouvelle conversation"}</small></span>{Number(t.unread_count)>0&&<i>{t.unread_count}</i>}</button>)}</div>
      {!dashboard.threads.length&&<p className="gazette-admin-empty">Aucun message reçu pour le moment.</p>}
    </section>

    <section className="gazette-admin-section">
      <h4><Send size={17}/> Envoyer un message privé</h4>
      <form className="gazette-admin-form" onSubmit={sendDirect}>
        <label>Personnage destinataire<select value={targetCharacter} onChange={e=>setTargetCharacter(e.target.value)}><option value="">Choisir un personnage…</option>{dashboard.characters.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.character_type==="student"?"Élève":c.role_title||"Personnel"}</option>)}</select></label>
        <label>Message<textarea rows={3} value={directMessage} onChange={e=>setDirectMessage(e.target.value)} placeholder="Écrire au personnage sous le nom de la Gazette…"/></label>
        <button className="gazette-admin-primary" disabled={busy||!targetCharacter||!directMessage.trim()}><Send size={16}/> Envoyer le message</button>
      </form>
    </section>

    <section className="gazette-admin-section">
      <h4><Camera size={17}/> Photo de profil de la Gazette</h4>
      <div className="gazette-avatar-setting">{dashboard.avatarUrl?<img src={dashboard.avatarUrl} alt="Photo actuelle de la Gazette"/>:<span><Newspaper size={24}/></span>}<p>Cette image apparaîtra à côté de chaque publication.</p></div>
      <form className="gazette-admin-form" onSubmit={setAvatar}><label className="gazette-file-choice"><Upload size={16}/> {avatarPhoto?avatarPhoto.name:"Choisir une nouvelle photo"}<input type="file" accept="image/*" onChange={e=>setAvatarPhoto(e.target.files?.[0]||null)}/></label><button className="gazette-admin-primary" disabled={busy||!avatarPhoto}><Check size={16}/> Enregistrer la photo</button></form>
    </section>

    <section className="gazette-admin-section">
      <h4><Newspaper size={17}/> Publications <span>{dashboard.articles.length}</span></h4>
      {dashboard.articles.map(a=><article className="gazette-admin-article" key={a.id}>
        <div className="gazette-admin-article-head"><div><strong>{a.title}</strong><small>{a.category} · {a.publication_status}</small></div><button type="button" onClick={()=>void deleteArticle(a)} aria-label="Supprimer la publication"><Trash2 size={16}/></button></div>
        {a.image_url&&<img className="gazette-admin-article-image" src={a.image_url} alt="Illustration de l'article"/>}
        <div className="gazette-admin-reaction-summary"><span>👍 {a.likes} J'aime</span><span>👎 {a.dislikes} Je déteste</span></div>
        <details className="gazette-admin-reaction-list"><summary>Voir qui a réagi ({(a.reactions||[]).length})</summary>{(a.reactions||[]).map((r,i)=><p key={i}>{r.reaction==="like"?"👍":"👎"} {r.name}</p>)}{!a.reactions?.length&&<small>Aucune réaction pour le moment.</small>}</details>
      </article>)}
      {!dashboard.articles.length&&<p className="gazette-admin-empty">Aucune publication enregistrée.</p>}
    </section>
    {articleToDelete&&<div className="agenda-modal-backdrop" role="presentation" onClick={()=>!busy&&setArticleToDelete(null)}><section className="agenda-detail content-card" role="dialog" aria-modal="true" aria-labelledby="gazette-delete-title" onClick={e=>e.stopPropagation()}><div className="agenda-form-title"><span className="eyebrow">CONFIRMATION</span><button type="button" className="icon-button" disabled={busy} onClick={()=>setArticleToDelete(null)} aria-label="Fermer"><X size={17}/></button></div><h4 id="gazette-delete-title">Supprimer cet article ?</h4><p><strong>{articleToDelete.title}</strong></p><p>Cette suppression est définitive. Elle fonctionne aussi pour un article enregistré en brouillon.</p><div className="agenda-response-actions"><button type="button" disabled={busy} onClick={()=>setArticleToDelete(null)}>Annuler</button><button type="button" className="agenda-delete-action" disabled={busy} onClick={()=>void confirmDeleteArticle()}><Trash2 size={15}/>{busy?"Suppression…":"Confirmer la suppression"}</button></div></section></div>}

  </section>;
}
