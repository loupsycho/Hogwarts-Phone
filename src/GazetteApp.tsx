import { useEffect, useState } from "react";
import { Camera, Heart, MessageCircle, Newspaper, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import "./gazette.css";

type Character = { id:string; first_name?:string; last_name?:string; avatar_url?:string|null };
type Article = { id:string; title:string; summary:string|null; body:string; category:string; published_at:string|null; image_url:string|null; likes:number; dislikes:number; my_reaction:"like"|"dislike"|null };
type GazetteMessage = { id:string; sender_type:"character"|"gazette"; body:string; created_at:string; media_url:string|null };

type Props = {
  current:Character;
  uploadMedia:(file:File,kind:"avatar"|"instagram"|"message"|"gallery")=>Promise<any>;
};

const headers=()=>{const token=localStorage.getItem("hogwarts_session");return token?{Authorization:"Bearer "+token}:{};};
const dateLabel=(value:string|null)=>value?new Date(value).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"Édition du jour";

export default function GazetteApp({current,uploadMedia}:Props){
  const [articles,setArticles]=useState<Article[]>([]);
  const [avatarUrl,setAvatarUrl]=useState<string|null>(null);
  const [messages,setMessages]=useState<GazetteMessage[]>([]);
  const [threadOpen,setThreadOpen]=useState(false);
  const [body,setBody]=useState("");
  const [photo,setPhoto]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");

  async function call(action:string,method="GET",data:Record<string,unknown>={},query:Record<string,string>={}){
    const params=new URLSearchParams({action,characterId:current.id,...query});
    const response=await fetch("/api/gazette?"+params.toString(),{method,credentials:"include",headers:{"Content-Type":"application/json",...headers()},...(method==="GET"?{}:{body:JSON.stringify({...data,characterId:current.id,action})})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Une erreur est survenue.");
    return result;
  }
  async function refresh(){
    const [feed,thread]=await Promise.all([call("feed"),call("thread")]);
    setArticles(feed.articles||[]);setAvatarUrl(feed.avatarUrl||null);setMessages(thread.messages||[]);
  }
  useEffect(()=>{void refresh().catch(e=>setNotice(e.message));},[current.id]);

  async function react(article:Article,reaction:"like"|"dislike"){
    const next=article.my_reaction===reaction?"none":reaction;
    try{await call("react","POST",{articleId:article.id,reaction:next});await refresh();}
    catch(e){setNotice(e instanceof Error?e.message:"Réaction impossible.");}
  }
  async function sendMessage(e:React.FormEvent){
    e.preventDefault();if(!body.trim()&&!photo)return;
    setBusy(true);setNotice("");
    try{
      let mediaId:string|null=null;
      if(photo){const media=await uploadMedia(photo,"message");mediaId=media.id;}
      await call("send","POST",{body:body.trim(),mediaId});
      setBody("");setPhoto(null);await refresh();setNotice("Ton message a été envoyé à la Gazette.");
    }catch(e){setNotice(e instanceof Error?e.message:"Envoi impossible.");}
    finally{setBusy(false);}
  }

  return <section className="gazette-public">
    <header className="gazette-masthead">
      <div className="gazette-masthead-top"><span>LE MONDE DES SORCIERS</span><span>{new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}</span></div>
      <div className="gazette-title-row">{avatarUrl?<img src={avatarUrl} alt="Emblème de la Gazette"/>:<span className="gazette-crest"><Newspaper size={28}/></span>}<div><h2>La Gazette du Sorcier</h2><p>La vérité, même lorsqu’elle dérange.</p></div></div>
      <div className="gazette-edition-line"><span>ÉDITION DE POUDLARD</span><span>INFORMER • RÉVÉLER • DÉVOILER</span></div>
    </header>

    <div className="gazette-public-toolbar"><span>DERNIÈRES PUBLICATIONS</span><button type="button" onClick={()=>setThreadOpen(v=>!v)}><MessageCircle size={15}/> Écrire à la Gazette {messages.length>0&&<i>{messages.length}</i>}</button></div>
    {notice&&<p className="gazette-notice">{notice}</p>}
    {articles.map((article,index)=><article className={"gazette-article "+(index===0?"lead":"")} key={article.id}>
      <div className="gazette-article-kicker"><span>{article.category}</span><time>{dateLabel(article.published_at)}</time></div>
      <h3>{article.title}</h3>
      {article.summary&&<p className="gazette-summary">{article.summary}</p>}
      {article.image_url&&<img className="gazette-article-image" src={article.image_url} alt="Illustration de l'article"/>}
      <div className="gazette-article-body">{article.body.split(/\n{2,}/).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>
      <div className="gazette-reactions">
        <button type="button" className={article.my_reaction==="like"?"selected like":"like"} onClick={()=>void react(article,"like")}><ThumbsUp size={15}/> J'aime <b>{Number(article.likes)||0}</b></button>
        <button type="button" className={article.my_reaction==="dislike"?"selected dislike":"dislike"} onClick={()=>void react(article,"dislike")}><ThumbsDown size={15}/> Je déteste <b>{Number(article.dislikes)||0}</b></button>
      </div>
      <div className="gazette-article-footer">— FIN DE L'ARTICLE —</div>
    </article>)}
    {!articles.length&&<div className="gazette-empty"><Newspaper size={28}/><p>Aucun article n'a encore été publié.</p><small>La Gazette prépare sa prochaine édition…</small></div>}

    {threadOpen&&<div className="gazette-private-panel">
      <div className="gazette-private-heading"><div><span className="gazette-overline">COURRIER DES LECTEURS</span><h3>Écrire à la Gazette</h3></div><button type="button" onClick={()=>setThreadOpen(false)} aria-label="Fermer"><X size={18}/></button></div>
      <p className="gazette-private-intro">Une information, une rumeur ou une idée d'article ? Envoie-nous un message privé. Tu peux joindre une photo pour illustrer ta proposition.</p>
      <div className="gazette-private-messages">{messages.map(m=><div className={"gazette-private-message "+(m.sender_type==="character"?"mine":"") } key={m.id}><small>{m.sender_type==="character"?"Vous":"La Gazette du Sorcier"}</small>{m.body&&<p>{m.body}</p>}{m.media_url&&<img src={m.media_url} alt="Photo jointe"/>}<time>{new Date(m.created_at).toLocaleString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></div>)}{!messages.length&&<p className="gazette-empty-thread">Votre conversation privée avec la Gazette commencera ici.</p>}</div>
      {photo&&<div className="gazette-photo-preview"><span>{photo.name}</span><button type="button" onClick={()=>setPhoto(null)}><X size={14}/> Retirer</button></div>}
      <form className="gazette-composer" onSubmit={sendMessage}><label title="Joindre une photo"><Camera size={18}/><input type="file" accept="image/*" onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label><textarea value={body} onChange={e=>setBody(e.target.value)} rows={2} placeholder="Écris ton message à la Gazette…"/><button disabled={busy||(!body.trim()&&!photo)}><Send size={17}/></button></form>
    </div>}
  </section>;
}
