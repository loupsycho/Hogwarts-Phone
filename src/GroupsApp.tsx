import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Home, LogOut, MessageCircle, Plus, Search, Send, Shield, UserPlus, Users, X } from "lucide-react";

type Person = {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  house?: string | null;
  character_type?: string;
  role_title?: string | null;
};
type Group = {
  id: string;
  title: string | null;
  group_kind: "custom" | "house";
  house: string | null;
  created_by_character_id?: string | null;
  avatar_url?: string | null;
  participants?: string | null;
  last_message?: string | null;
  member_count: number;
  unread_count: number;
  is_admin: boolean;
  members: Person[];
};
type GroupMessage = {
  id: string;
  body: string;
  sent_at: string;
  sender_character_id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  media_url?: string | null;
  mime_type?: string | null;
};

type Props = {
  current: Person;
  uploadMedia: (file: File, kind: "avatar" | "instagram" | "message" | "gallery") => Promise<any>;
  setNotice: (message: string) => void;
  onRead: () => void;
};

const houseNames: Record<string, string> = {
  Gryffindor: "Gryffondor",
  Slytherin: "Serpentard",
  Ravenclaw: "Serdaigle",
  Hufflepuff: "Poufsouffle",
};
const personName = (person: Person) => [person.first_name, person.last_name].filter(Boolean).join(" ");
const houseName = (house?: string | null) => house ? houseNames[house] || house : "";
const houseImage = (house?: string | null) => ({Gryffindor:"/houses/gryffindor.svg",Slytherin:"/houses/slytherin.svg",Ravenclaw:"/houses/ravenclaw.svg",Hufflepuff:"/houses/hufflepuff.svg"} as Record<string,string>)[house||""];

export default function GroupsApp({ current, uploadMedia, setNotice, onRead }: Props) {
  const [section, setSection] = useState<"conversations" | "house" | "new" | "chat">("conversations");
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Person[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [uploadedMessage, setUploadedMessage] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);

  const request = async (action: string, method = "GET", data: Record<string, unknown> = {}, query: Record<string, string> = {}) => {
    const params = new URLSearchParams({ action, characterId: current.id, ...query });
    const token = localStorage.getItem("hogwarts_session");
    const response = await fetch("/api/groups?" + params.toString(), {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      ...(method === "GET" ? {} : { body: JSON.stringify({ ...data, action, characterId: current.id }) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Une erreur est survenue.");
    return result;
  };

  const refreshGroups = async () => {
    const result = await request("list");
    setGroups(result.groups || []);
    return (result.groups || []) as Group[];
  };

  const refreshContacts = async () => {
    const token = localStorage.getItem("hogwarts_session");
    const params = new URLSearchParams({ action: "contacts", characterId: current.id });
    const response = await fetch("/api/data?" + params.toString(), {
      credentials: "include",
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Impossible de charger les personnages.");
    setContacts(result.characters || []);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([request("list"), refreshContacts()])
      .then(([result]) => { if (!cancelled) setGroups(result.groups || []); })
      .catch(error => { if (!cancelled) setNotice(error instanceof Error ? error.message : "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [current.id]);

  const selectedGroup = groups.find(group => group.id === selectedGroupId) || null;
  const customGroups = groups.filter(group => group.group_kind === "custom");
  const houseGroups = groups.filter(group => group.group_kind === "house" && group.house === current.house);
  const filteredContacts = useMemo(() => contacts
    .filter(person => person.id !== current.id)
    .filter(person => personName(person).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))),
  [contacts, current.id, search]);
  const addableMembers = useMemo(() => contacts
    .filter(person => person.id !== current.id && !selectedGroup?.members?.some(member => member.id === person.id))
    .filter(person => personName(person).toLocaleLowerCase("fr").includes(memberSearch.toLocaleLowerCase("fr"))),
  [contacts, current.id, selectedGroup, memberSearch]);

  const openGroup = async (group: Group) => {
    setSelectedGroupId(group.id);
    setSection("chat");
    setManageOpen(false);
    setUploadedMessage(null);
    try {
      await request("read", "POST", { groupId: group.id });
      onRead();
      const result = await request("messages", "GET", {}, { groupId: group.id });
      setMessages(result.messages || []);
      await refreshGroups();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible d'ouvrir ce groupe.");
    }
  };

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.length < 2) {
      setNotice("Sélectionne au minimum deux autres personnages.");
      return;
    }
    setBusy(true);
    try {
      const result = await request("create", "POST", { title: title.trim(), participantIds: selectedIds });
      setTitle("");
      setSelectedIds([]);
      const updated = await refreshGroups();
      const created = updated.find(group => group.id === result.id);
      if (created) await openGroup(created);
      else setSection("conversations");
      setNotice("Le groupe a été créé.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGroupId || (!messageText.trim() && !uploadedMessage)) return;
    setBusy(true);
    try {
      await request("message", "POST", { groupId: selectedGroupId, body: messageText.trim(), mediaId: uploadedMessage?.id || null });
      setMessageText("");
      setUploadedMessage(null);
      const result = await request("messages", "GET", {}, { groupId: selectedGroupId });
      setMessages(result.messages || []);
      await refreshGroups();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  };

  const addMembers = async () => {
    if (!selectedGroupId || !newMemberIds.length) return;
    setBusy(true);
    try {
      await request("add-members", "POST", { groupId: selectedGroupId, participantIds: newMemberIds });
      setNewMemberIds([]);
      setMemberSearch("");
      await refreshGroups();
      setNotice("Les nouveaux membres ont été ajoutés.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (person: Person) => {
    if (!selectedGroupId || !window.confirm("Retirer " + personName(person) + " de ce groupe ?")) return;
    try {
      await request("remove-member", "POST", { groupId: selectedGroupId, targetCharacterId: person.id });
      await refreshGroups();
      setNotice("Le membre a été retiré.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Suppression impossible.");
    }
  };

  const leaveGroup = async () => {
    if (!selectedGroup || !window.confirm("Quitter le groupe « " + (selectedGroup.title || "Groupe") + " » ?")) return;
    try {
      await request("leave", "POST", { groupId: selectedGroup.id });
      setSelectedGroupId("");
      setMessages([]);
      setSection("conversations");
      await refreshGroups();
      setNotice("Tu as quitté le groupe.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible de quitter le groupe.");
    }
  };

  const backToList = async () => {
    setSection(selectedGroup?.group_kind === "house" ? "house" : "conversations");
    setSelectedGroupId("");
    setMessages([]);
    setUploadedMessage(null);
    setManageOpen(false);
    try { await refreshGroups(); } catch { /* keep the current list */ }
  };

  const tabButton = (value: "conversations" | "house", label: string, Icon: typeof Users) => (
    <button type="button" className={"groups-tab" + (section === value ? " active" : "")} onClick={() => { setSection(value); setSelectedGroupId(""); setMessages([]); setManageOpen(false); }}>
      <Icon size={16} />{label}
      {value === "conversations" && customGroups.reduce((sum, group) => sum + Number(group.unread_count || 0), 0) > 0 &&
        <span className="groups-tab-unread">{Math.min(99, customGroups.reduce((sum, group) => sum + Number(group.unread_count || 0), 0))}</span>}
      {value === "house" && houseGroups.reduce((sum, group) => sum + Number(group.unread_count || 0), 0) > 0 &&
        <span className="groups-tab-unread">{Math.min(99, houseGroups.reduce((sum, group) => sum + Number(group.unread_count || 0), 0))}</span>}
    </button>
  );

  const renderGroup = (group: Group) => (
    <button type="button" className="conversation-row groups-conversation-row" key={group.id} onClick={() => void openGroup(group)}>
      {group.avatar_url || (group.group_kind === "house" && houseImage(group.house)) ? <img className="conversation-avatar" src={group.avatar_url || houseImage(group.house)} alt={group.group_kind === "house" ? "Blason de " + houseName(group.house) : ""} /> : <span className="conversation-avatar groups-fallback"><Users size={20} /></span>}
      <span className="conversation-copy">
        <strong>{group.group_kind === "house" ? houseName(group.house) : group.title || "Groupe"}</strong>
        <small>{group.member_count} membre(s) · {group.last_message || "Aucun message pour le moment"}</small>
      </span>
      {group.unread_count > 0 && <span className="conversation-unread-badge">{group.unread_count > 9 ? "9+" : group.unread_count}</span>}
      <span className="conversation-chevron">›</span>
    </button>
  );

  return (
    <section className="messages-app groups-app">
      <nav className="groups-tabs" aria-label="Espaces de groupes">
        {tabButton("conversations", "Mes conversations", MessageCircle)}
        {tabButton("house", "Ma maison", Home)}
      </nav>

      {section === "conversations" && <>
        <div className="messages-page-heading">
          <div><p className="eyebrow">MESSAGERIE COLLECTIVE</p><h4>Mes conversations</h4></div>
          <button type="button" className="new-message-action" onClick={() => { setSearch(""); setSection("new"); }}><Plus size={16} /> Nouveau message</button>
        </div>
        <label className="groups-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un groupe…" /></label>
        <div className="conversation-list">{customGroups.filter(group => (group.title || "").toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")) || (group.participants || "").toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))).map(renderGroup)}</div>
        {!customGroups.length && <p className="empty-messages">Tu n'as pas encore de conversation de groupe. Appuie sur « Nouveau message » pour en créer une.</p>}
      </>}

      {section === "house" && <>
        <div className="messages-page-heading"><div><p className="eyebrow">VIE À POUDLARD</p><h4>Ma maison</h4></div></div>
        {current.house ? <p className="groups-house-intro">Le groupe privé des élèves de {houseName(current.house)}. Seuls les membres de cette maison peuvent y accéder.</p> : <p className="empty-messages">Le groupe de maison est réservé aux élèves.</p>}
        <div className="conversation-list">{houseGroups.map(renderGroup)}</div>
        {current.house && !houseGroups.length && <p className="empty-messages">Le groupe de ta maison sera disponible prochainement.</p>}
      </>}

      {section === "new" && <>
        <div className="messages-subpage-heading">
          <button type="button" className="messages-back" onClick={() => setSection("conversations")}><ArrowLeft size={18} /><span>Retour</span></button>
          <h4>Nouveau groupe</h4>
        </div>
        <form className="groups-create-form" onSubmit={createGroup}>
          <label className="field-label">Nom du groupe<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex. Les inséparables" required maxLength={80} /></label>
          <p className="groups-selection-note">Sélectionne au minimum deux autres personnages. Tu seras automatiquement ajouté(e) au groupe.</p>
          <label className="groups-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un personnage…" /></label>
          <div className="groups-contact-list">
            {filteredContacts.map(person => <label className="groups-contact-choice" key={person.id}>
              {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <span className="groups-contact-fallback"><Users size={16} /></span>}
              <span><strong>{personName(person)}</strong><small>{houseName(person.house) || person.role_title || "Personnage"}</small></span>
              <input type="checkbox" checked={selectedIds.includes(person.id)} onChange={event => setSelectedIds(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))} />
            </label>)}
            {!filteredContacts.length && <p className="empty-messages">Aucun personnage disponible.</p>}
          </div>
          <p className="groups-selection-count">{selectedIds.length + 1} membre(s) sélectionné(s) · 3 minimum</p>
          <button className="primary-action" type="submit" disabled={busy || selectedIds.length < 2 || !title.trim()}>{busy ? "Création…" : "Créer le groupe"}</button>
        </form>
      </>}

      {section === "chat" && selectedGroup && <>
        <div className="chat-page-heading groups-chat-heading">
          <button type="button" className="messages-back" onClick={() => void backToList()}><ArrowLeft size={18} /><span>Retour</span></button>
          <div className="chat-recipient">
            {selectedGroup.avatar_url || (selectedGroup.group_kind === "house" && houseImage(selectedGroup.house)) ? <img src={selectedGroup.avatar_url || houseImage(selectedGroup.house)} alt={selectedGroup.group_kind === "house" ? "Blason de " + houseName(selectedGroup.house) : ""} /> : <span className="conversation-avatar fallback"><Users size={18} /></span>}
            <span><strong>{selectedGroup.group_kind === "house" ? houseName(selectedGroup.house) : selectedGroup.title || "Groupe"}</strong><small>{selectedGroup.member_count} membre(s) · {selectedGroup.group_kind === "house" ? "Groupe de maison" : selectedGroup.is_admin ? "Administrateur" : "Conversation de groupe"}</small></span>
          </div>
        </div>

        <div className="groups-chat-actions">
          <button type="button" onClick={() => setManageOpen(value => !value)}><Users size={15} /> {manageOpen ? "Masquer les membres" : "Voir les membres"}</button>
          {selectedGroup.is_admin && selectedGroup.group_kind === "custom" && <button type="button" onClick={() => setManageOpen(true)}><UserPlus size={15} /> Gérer</button>}
          {selectedGroup.group_kind === "custom" && <button type="button" className="groups-leave-action" onClick={() => void leaveGroup()}><LogOut size={15} /> Quitter</button>}
        </div>

        {manageOpen && <section className="groups-members-panel">
          <div className="groups-members-title"><strong>Membres du groupe</strong><span>{selectedGroup.members?.length || 0}</span></div>
          {(selectedGroup.members || []).map(person => <div className="groups-member-row" key={person.id}>
            {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <span className="groups-contact-fallback"><Users size={15} /></span>}
            <span><strong>{personName(person)}</strong>{person.id === selectedGroup.created_by_character_id && <small><Shield size={11} /> Administrateur</small>}</span>
            {selectedGroup.is_admin && selectedGroup.group_kind === "custom" && person.id !== current.id && <button type="button" onClick={() => void removeMember(person)}>Retirer</button>}
          </div>)}
          {selectedGroup.is_admin && selectedGroup.group_kind === "custom" && <>
            <label className="groups-search"><Search size={15} /><input value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="Rechercher un personnage à ajouter…" /></label>
            <div className="groups-contact-list groups-add-list">{addableMembers.map(person => <label className="groups-contact-choice" key={person.id}>
              {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <span className="groups-contact-fallback"><Users size={16} /></span>}
              <span><strong>{personName(person)}</strong><small>{houseName(person.house) || person.role_title || "Personnage"}</small></span>
              <input type="checkbox" checked={newMemberIds.includes(person.id)} onChange={event => setNewMemberIds(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))} />
            </label>)}</div>
            {newMemberIds.length > 0 && <button type="button" className="primary-action" disabled={busy} onClick={() => void addMembers()}>Ajouter {newMemberIds.length} membre(s)</button>}
          </>}
        </section>}

        <div className="message-list groups-message-list">
          {messages.map(message => {
            const mine = message.sender_character_id === current.id;
            return <div className={"message-row " + (mine ? "mine" : "received")} key={message.id}>
              <span className="message-avatar">{(mine ? current.avatar_url : message.avatar_url) ? <img src={mine ? current.avatar_url! : message.avatar_url!} alt="" /> : <Users size={16} />}</span>
              <div className={"message-bubble " + (mine ? "mine" : "")}>
                <small>{mine ? personName(current) : [message.first_name, message.last_name].filter(Boolean).join(" ")}</small>
                {message.body && <p>{message.body}</p>}
                {message.media_url && (message.mime_type?.startsWith("video/") ? <video className="message-attachment" src={message.media_url} controls playsInline /> : <img className="message-attachment" src={message.media_url} alt="Photo envoyée" />)}
                <time>{new Date(message.sent_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
            </div>;
          })}
          {!messages.length && <p className="empty-messages">Aucun message pour le moment. Lance la conversation !</p>}
        </div>
        {uploadedMessage && <div className="message-upload-preview"><span><Camera size={15} /> Photo prête à envoyer</span><button type="button" onClick={() => setUploadedMessage(null)}><X size={14} /> Retirer</button></div>}
        <form className="chat-composer" onSubmit={sendMessage}>
          <label className="chat-camera-button" title="Ajouter une photo"><Camera size={20} /><input type="file" accept="image/*" onChange={async event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            setUploading(true);
            try { setUploadedMessage(await uploadMedia(file, "message")); }
            catch (error) { setNotice(error instanceof Error ? error.message : "Importation impossible."); }
            finally { setUploading(false); input.value = ""; }
          }} /></label>
          <textarea value={messageText} onChange={event => setMessageText(event.target.value)} rows={1} placeholder="Écrire un message…" aria-label="Écrire un message" />
          <button className="chat-send-button" type="submit" disabled={busy || uploading || (!messageText.trim() && !uploadedMessage)}><Send size={18} /><span>Envoyer</span></button>
        </form>
      </>}
    </section>
  );
}
