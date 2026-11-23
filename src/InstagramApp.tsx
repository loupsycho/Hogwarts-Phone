import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft, Camera, Heart, Home, MessageCircle, PlusSquare, Search, Send,
  Trash2, UserRound, Video, X,
} from "lucide-react";
import "./instagram.css";

type InstagramCharacter = {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  house?: string | null;
  character_type?: string | null;
  role_title?: string | null;
  biography?: string | null;
  followers?: number | string | null;
};

type InstagramProps = {
  current: InstagramCharacter;
  uploadMedia: (file: File, kind: "avatar" | "instagram" | "message" | "gallery", crop?: { zoom: number; x: number; y: number }) => Promise<any>;
  setNotice: (message: string) => void;
};

const displayName = (person: InstagramCharacter) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ") || "Personnage";

const houseName = (house?: string | null) =>
  ({ Gryffindor: "Gryffondor", Slytherin: "Serpentard", Ravenclaw: "Serdaigle", Hufflepuff: "Poufsouffle" } as Record<string, string>)[house || ""] || house || "";

async function prepareInstagramUpload(file: File): Promise<File> {
  const limit = 2.8 * 1024 * 1024;
  if (file.type.startsWith("video/")) {
    if (file.size > limit) throw new Error("La vidéo doit faire 2,8 Mo maximum pour être envoyée.");
    return file;
  }
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= limit && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Cette image ne peut pas être lue sur l'appareil."));
      element.src = url;
    });
    let scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    let quality = 0.84;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 7; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Compression de l'image indisponible.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= limit) break;
      quality = Math.max(0.55, quality - 0.08);
      if (attempt >= 2) scale *= 0.82;
    }
    if (!blob || blob.size > limit) throw new Error("Cette image est trop volumineuse pour être envoyée.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function InstagramApp({ current, uploadMedia, setNotice }: InstagramProps) {
  const [section, setSection] = useState<"feed" | "search" | "publish" | "notifications" | "profile">("feed");
  const [feed, setFeed] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstagramCharacter[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [highlightPost, setHighlightPost] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<InstagramCharacter[]>([]);
  const [mentionedCharacters, setMentionedCharacters] = useState<InstagramCharacter[]>([]);

  async function call(action: string, method = "GET", data: Record<string, unknown> = {}, queryValues: Record<string, string> = {}) {
    const params = new URLSearchParams({ action, characterId: current.id, ...queryValues });
    const token = localStorage.getItem("hogwarts_session");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetch("/api/instagram?" + params.toString(), {
      method,
      credentials: "include",
      headers,
      ...(method === "GET" ? {} : { body: JSON.stringify({ ...data, action, characterId: current.id }) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Instagram est momentanément indisponible.");
    return result;
  }

  async function loadFeed() {
    const data = await call("feed");
    setFeed(data.posts || []);
  }

  async function loadNotifications() {
    const data = await call("notifications");
    setNotifications(data.notifications || []);
  }

  async function openProfile(characterId: string) {
    try {
      const data = await call("profile", "GET", {}, { profileCharacterId: characterId });
      setProfile(data);
      setSection("profile");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Profil indisponible.");
    }
  }

  useEffect(() => {
    void loadFeed().catch(error => setNotice(error instanceof Error ? error.message : "Fil indisponible."));
    void loadNotifications().catch(() => undefined);
    const timer = window.setInterval(() => { void loadNotifications().catch(() => undefined); }, 15000);
    return () => window.clearInterval(timer);
  }, [current.id]);

  useEffect(() => {
    if (section !== "search") return;
    const timer = window.setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      try {
        const data = await call("search", "GET", {}, { q: query.trim() });
        setResults(data.characters || []);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Recherche impossible.");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, section]);

  const unreadCount = notifications.filter(item => !item.read_at).length;
  async function openNotifications() {
    setSection("notifications");
    try {
      await loadNotifications();
      await call("read-all-notifications", "POST");
      await loadNotifications();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Notifications indisponibles.");
    }
  }
  const ownProfile = profile?.profile?.id === current.id;

  async function togglePostLike(post: any) {
    try {
      await call(post.liked ? "unlike" : "like", "POST", { postId: post.id });
      await loadFeed();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Action impossible."); }
  }

  async function sendComment(postId: string) {
    const text = (commentText[postId] || "").trim();
    if (!text) return;
    try {
      await call("comment", "POST", { postId, body: text });
      setCommentText(prev => ({ ...prev, [postId]: "" }));
      await loadFeed();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Commentaire impossible."); }
  }

  async function sendReply(postId: string) {
    if (!replyTo || !replyText.trim()) return;
    try {
      await call("reply", "POST", { postId, parentCommentId: replyTo, body: replyText.trim() });
      setReplyTo(null);
      setReplyText("");
      await loadFeed();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Réponse impossible."); }
  }

  async function toggleCommentLike(comment: any) {
    try {
      await call(comment.liked ? "comment-unlike" : "comment-like", "POST", { commentId: comment.id });
      await loadFeed();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Action impossible."); }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!caption.trim() && !media?.id) {
      setNotice("Ajoute une légende ou une photo/vidéo.");
      return;
    }
    setBusy(true);
    try {
      await call("post", "POST", {
        caption: caption.trim(),
        mediaId: media?.id,
        mentionCharacterIds: mentionedCharacters.map(person => person.id),
      });
      setCaption("");
      setMedia(null);
      setMentionQuery("");
      setMentionedCharacters([]);
      setMentionResults([]);
      await loadFeed();
      setSection("feed");
      setNotice("Ta publication est en ligne.");
      await loadNotifications();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Publication impossible.");
    } finally { setBusy(false); }
  }

  async function deletePost(postId: string) {
    if (!window.confirm("Supprimer définitivement cette publication ?")) return;
    try {
      await call("post", "DELETE", {}, { postId });
      await loadFeed();
      if (profile?.profile?.id) await openProfile(profile.profile.id);
      setNotice("Publication supprimée.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Suppression impossible."); }
  }

  async function toggleFollow() {
    if (!profile?.profile) return;
    try {
      await call(profile.profile.is_following ? "unfollow" : "follow", "POST", { targetCharacterId: profile.profile.id });
      await openProfile(profile.profile.id);
      await loadNotifications();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Abonnement impossible."); }
  }

  async function openNotification(item: any) {
    try {
      await call("read-notification", "POST", { notificationId: item.id });
      await loadNotifications();
      if (item.target_type === "instagram_profile" && item.target_id) {
        await openProfile(item.target_id);
      } else if (item.target_type === "instagram_post" && item.target_id) {
        const [allPosts, targetPost] = await Promise.all([
          call("feed"),
          call("feed", "GET", {}, { postId: item.target_id }),
        ]);
        const posts = allPosts.posts || [];
        const selectedPost = (targetPost.posts || [])[0];
        if (selectedPost && !posts.some((post: any) => post.id === selectedPost.id)) posts.unshift(selectedPost);
        setFeed(posts);
        setHighlightPost(item.target_id);
        setSection("feed");
        window.setTimeout(() => {
          document.getElementById("instagram-post-" + item.target_id)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Notification indisponible."); }
  }

  const commentsFor = (post: any) => post.comment_list || [];
  const renderComment = (post: any, comment: any, depth = 0): ReactNode => (
    <div className={"instagram-comment " + (depth ? "is-reply" : "")} key={comment.id}>
      <div className="instagram-comment-avatar">
        {comment.avatarUrl ? <img src={comment.avatarUrl} alt="" /> : <UserRound size={14} />}
      </div>
      <div className="instagram-comment-main">
        <p><strong>{comment.characterName}</strong> {comment.body}</p>
        <div className="instagram-comment-actions">
          <button type="button" onClick={() => void toggleCommentLike(comment)}><Heart size={12} fill={comment.liked ? "currentColor" : "none"} /> {comment.likes || 0}</button>
          <button type="button" onClick={() => { setReplyTo(comment.id); setReplyText(""); }}>Répondre</button>
        </div>
        {replyTo === comment.id && <form className="instagram-reply-form" onSubmit={event => { event.preventDefault(); void sendReply(post.id); }}>
          <input value={replyText} onChange={event => setReplyText(event.target.value)} placeholder={"Répondre à " + comment.characterName} />
          <button type="submit" disabled={!replyText.trim()}><Send size={14} /></button>
          <button type="button" onClick={() => setReplyTo(null)}><X size={14} /></button>
        </form>}
        {commentsFor(post).filter((child: any) => child.parentCommentId === comment.id).map((child: any) => renderComment(post, child, depth + 1))}
      </div>
    </div>
  );

  useEffect(() => {
    if (!mentionQuery.trim()) { setMentionResults([]); return; }
    const timer = window.setTimeout(async () => {
      try {
        const data = await call("search", "GET", {}, { q: mentionQuery.trim() });
        setMentionResults((data.characters || []).filter((person: InstagramCharacter) =>
          person.id !== current.id && !mentionedCharacters.some(selected => selected.id === person.id)
        ));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Recherche impossible.");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mentionQuery, mentionedCharacters, current.id]);

  const profilePosts = useMemo(() => profile?.posts || [], [profile]);

  return (
    <section className="instagram-app">
      <div className="instagram-heading">
        <div>
          <p className="eyebrow">LE RÉSEAU DES SORCIERS</p>
          <h3>Wizardgram <span>✦</span></h3>
        </div>
      </div>

      <nav className="instagram-bottom-nav" aria-label="Navigation Instagram">
        <button type="button" className={section === "feed" ? "active" : ""} onClick={() => { setSection("feed"); setProfile(null); }} aria-label="Accueil"><Home /></button>
        <button type="button" className={section === "search" ? "active" : ""} onClick={() => { setSection("search"); setProfile(null); }} aria-label="Rechercher"><Search /></button>
        <button type="button" className={section === "publish" ? "active" : ""} onClick={() => { setSection("publish"); setProfile(null); }} aria-label="Publier"><PlusSquare /></button>
        <button type="button" className={section === "notifications" ? "active" : ""} onClick={() => { setProfile(null); void openNotifications(); }} aria-label="Notifications">
          <Heart />
          {unreadCount > 0 && <span className="instagram-nav-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </button>
        <button type="button" className={section === "profile" ? "active" : ""} onClick={() => void openProfile(current.id)} aria-label="Mon profil"><UserRound /></button>
      </nav>

      {section === "feed" && <div className="instagram-feed">
        {feed.length === 0 && <div className="instagram-empty"><Camera size={25} /><strong>Aucune publication pour le moment</strong><span>Les photos et vidéos de la communauté apparaîtront ici.</span></div>}
        {feed.map(post => <article id={"instagram-post-" + post.id} className={"instagram-post " + (highlightPost === post.id ? "is-highlighted" : "")} key={post.id}>
          <button type="button" className="instagram-post-author" onClick={() => void openProfile(post.character_id)}>
            {post.avatar_url ? <img src={post.avatar_url} alt="" /> : <span><UserRound size={18} /></span>}
            <span><strong>{post.first_name} {post.last_name}</strong><small>{houseName(post.house)}</small></span>
          </button>
          {post.image_url && (post.media_mime_type?.startsWith("video/") ? <video className="instagram-post-media" src={post.image_url} controls playsInline /> : <img className="instagram-post-media" src={post.image_url} alt="Publication" />)}
          <div className="instagram-post-content">
            <div className="instagram-post-actions">
              <button type="button" onClick={() => void togglePostLike(post)} aria-label="Aimer la publication"><Heart fill={post.liked ? "currentColor" : "none"} className={post.liked ? "is-liked" : ""} /></button>
              <span>{post.likes || 0} J’aime</span>
              <span className="instagram-comment-count"><MessageCircle size={16} /> {post.comments || 0}</span>
              {post.character_id === current.id && <button type="button" className="instagram-delete-post" onClick={() => void deletePost(post.id)} aria-label="Supprimer la publication"><Trash2 size={16} /></button>}
            </div>
            {post.caption && <p className="instagram-caption"><strong>{post.first_name}</strong> {post.caption}</p>}
            <small className="instagram-date">{new Date(post.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</small>
            <div className="instagram-comments">
              {commentsFor(post).filter((comment: any) => !comment.parentCommentId).map((comment: any) => renderComment(post, comment))}
            </div>
            <form className="instagram-comment-form" onSubmit={event => { event.preventDefault(); void sendComment(post.id); }}>
              <input value={commentText[post.id] || ""} onChange={event => setCommentText(prev => ({ ...prev, [post.id]: event.target.value }))} placeholder="Ajouter un commentaire…" />
              <button type="submit" disabled={!(commentText[post.id] || "").trim()}><Send size={15} /></button>
            </form>
          </div>
        </article>)}
      </div>}

      {section === "search" && <div className="instagram-search-page">
        <label className="instagram-search-box"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un personnage…" /></label>
        <div className="instagram-search-results">
          {results.map(person => <button type="button" className="instagram-search-person" key={person.id} onClick={() => void openProfile(person.id)}>
            {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <span><UserRound size={18} /></span>}
            <span><strong>{displayName(person)}</strong><small>{houseName(person.house) || person.role_title || "Personnage"} · {person.followers || 0} abonnés</small></span>
            <ArrowLeft className="instagram-result-arrow" size={17} />
          </button>)}
          {query.trim() && results.length === 0 && <p className="instagram-empty-text">Aucun personnage trouvé.</p>}
        </div>
      </div>}

      {section === "publish" && <form className="instagram-publish" onSubmit={event => void publish(event)}>
        <p className="eyebrow">PARTAGER UN INSTANT</p>
        <h4>Nouvelle publication</h4>
        <textarea value={caption} onChange={event => setCaption(event.target.value)} placeholder="Quoi de neuf dans le monde des sorciers ?" rows={4} />
        <div className="instagram-mention-picker">
          <label className="instagram-mention-label">Identifier des personnages</label>
          {mentionedCharacters.length > 0 && <div className="instagram-mentioned-list">
            {mentionedCharacters.map(person => <button type="button" key={person.id} onClick={() => setMentionedCharacters(previous => previous.filter(item => item.id !== person.id))}>
              @{displayName(person)} <X size={12} />
            </button>)}
          </div>}
          <input value={mentionQuery} onChange={event => setMentionQuery(event.target.value)} placeholder="Rechercher un personnage à identifier…" />
          {mentionResults.length > 0 && <div className="instagram-mention-results">
            {mentionResults.map(person => <button type="button" key={person.id} onClick={() => {
              setMentionedCharacters(previous => [...previous, person]);
              setMentionQuery("");
              setMentionResults([]);
            }}>
              {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <UserRound size={16} />}
              <span>{displayName(person)}</span>
            </button>)}
          </div>}
        </div>
        <label className="instagram-upload">
          <Camera size={19} /><span>Choisir une photo ou une vidéo</span><input type="file" accept="image/*,video/mp4,video/webm" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const preparedFile = await prepareInstagramUpload(file);
              setMedia(await uploadMedia(preparedFile, "instagram"));
            }
            catch (error) { setNotice(error instanceof Error ? error.message : "Importation impossible."); }
            finally { setBusy(false); event.target.value = ""; }
          }} />
        </label>
        {media && <div className="instagram-upload-ready"><Video size={16} /> {media.fileName || "Média prêt à publier"} <button type="button" onClick={() => setMedia(null)}><X size={15} /></button></div>}
        <button className="instagram-publish-button" type="submit" disabled={busy}>{busy ? "Publication…" : "Publier"}</button>
      </form>}

      {section === "notifications" && <div className="instagram-notifications">
        <p className="eyebrow">ACTIVITÉ DE VOTRE COMPTE</p>
        <h4>Notifications</h4>
        {notifications.length === 0 && <p className="instagram-empty-text">Aucune notification pour le moment.</p>}
        {notifications.map(item => <button type="button" className={"instagram-notification " + (!item.read_at ? "unread" : "")} key={item.id} onClick={() => void openNotification(item)}>
          <span className="instagram-notification-icon"><Heart size={17} /></span>
          <span><strong>{item.title}</strong><small>{item.body}</small><small>{new Date(item.created_at).toLocaleString("fr-FR")}</small></span>
        </button>)}
      </div>}

      {section === "profile" && <div className="instagram-profile-page">
        {profile?.profile ? <>
          <div className="instagram-profile-summary">
            {profile.profile.avatar_url ? <img src={profile.profile.avatar_url} alt="" /> : <span><UserRound size={30} /></span>}
            <div><h4>{displayName(profile.profile)}</h4><p>{houseName(profile.profile.house) || profile.profile.role_title || "Personnage"}</p></div>
          </div>
          <div className="instagram-profile-stats">
            <span><strong>{profile.profile.posts_count}</strong> publications</span>
            <span><strong>{profile.profile.followers}</strong> abonnés</span>
            <span><strong>{profile.profile.following}</strong> abonnements</span>
          </div>
          {profile.profile.biography && <p className="instagram-bio">{profile.profile.biography}</p>}
          {!ownProfile && <button type="button" className="instagram-follow-button" onClick={() => void toggleFollow()}>{profile.profile.is_following ? "Ne plus suivre" : "S’abonner"}</button>}
          <div className="instagram-profile-grid">
            {profilePosts.map((post: any) => <button type="button" key={post.id} onClick={() => { setHighlightPost(post.id); setSection("feed"); }}>
              {post.image_url && (post.media_mime_type?.startsWith("video/") ? <video src={post.image_url} muted playsInline /> : <img src={post.image_url} alt="" />)}
            </button>)}
          </div>
          {profilePosts.filter((post: any) => post.character_id === current.id).map((post: any) => <button type="button" className="instagram-profile-delete" key={"delete-" + post.id} onClick={() => void deletePost(post.id)}><Trash2 size={14} /> Supprimer une publication</button>)}
        </> : <p className="instagram-empty-text">Chargement du profil…</p>}
      </div>}


    </section>
  );
}
