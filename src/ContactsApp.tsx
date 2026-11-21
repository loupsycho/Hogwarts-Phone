import { useMemo, useState } from "react";
import { ArrowLeft, Instagram, MessageCircle, UserRound, Users, X } from "lucide-react";
import "./contacts.css";

type Person = {
  id: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  character_type?: string;
  characterType?: string;
  house?: string | null;
  role_title?: string | null;
  roleTitle?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  age?: number | null;
  character_kind?: string | null;
  quidditch_position?: string | null;
  optional_courses?: string[];
  important_role?: string | null;
  house_responsibility?: string | null;
  sexual_orientation?: string | null;
};

type ContactLink = { relationship_type: string; first_name: string; last_name: string };

type Props = {
  characters: Person[];
  current: Person;
  loadLinks: (targetId: string) => Promise<ContactLink[]>;
  onMessage: (person: Person) => void;
  onInstagram: (person: Person) => void;
};

const nameOf = (p: Person) => [p.first_name ?? p.firstName, p.last_name ?? p.lastName].filter(Boolean).join(" ");
const typeOf = (p: Person) => p.character_type ?? p.characterType ?? "student";
const avatarOf = (p: Person) => p.avatar_url ?? p.avatarUrl;
const houseName = (house?: string | null) => ({
  Gryffindor: "Gryffondor", Slytherin: "Serpentard", Ravenclaw: "Serdaigle", Hufflepuff: "Poufsouffle"
} as Record<string, string>)[house || ""] || house || "";

const categories = [
  { id: "all", label: "Tous" },
  { id: "Slytherin", label: "🐍" },
  { id: "Gryffindor", label: "🦁" },
  { id: "Ravenclaw", label: "🦅" },
  { id: "Hufflepuff", label: "🦡" },
  { id: "staff", label: "Employés" }
];

export default function ContactsApp({ characters, current, loadLinks, onMessage, onInstagram }: Props) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [links, setLinks] = useState<ContactLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const visible = useMemo(() => characters
    .filter(person => person.id !== current.id)
    .filter(person => category === "all"
      ? true
      : category === "staff"
        ? typeOf(person) === "staff"
        : typeOf(person) === "student" && person.house === category)
    .filter(person => nameOf(person).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), "fr", { sensitivity: "base" })), [characters, current.id, category, search]);

  async function openProfile(person: Person) {
    setSelected(person);
    setLinks([]);
    setLoadingLinks(true);
    try { setLinks(await loadLinks(person.id)); }
    finally { setLoadingLinks(false); }
  }

  return <div className="contacts-app">
    <div className="contacts-category-strip" role="tablist" aria-label="Catégories de contacts">
      {categories.map(item => <button key={item.id} type="button" role="tab" aria-selected={category === item.id}
        className={category === item.id ? "contacts-category active" : "contacts-category"}
        onClick={() => setCategory(item.id)}>{item.label}</button>)}
    </div>
    <input className="search-field contacts-search" placeholder="Rechercher un personnage…" value={search} onChange={event => setSearch(event.target.value)} />
    <p className="contacts-count">{visible.length} contact{visible.length > 1 ? "s" : ""}</p>
    <div className="contacts-list">
      {visible.map(person => <button type="button" className="contact-person-row" key={person.id} onClick={() => void openProfile(person)}>
        {avatarOf(person) ? <img className="contact-person-avatar" src={avatarOf(person)!} alt="" /> : <span className="contact-person-avatar fallback"><UserRound size={21}/></span>}
        <span className="contact-person-copy"><strong>{nameOf(person)}</strong><small>{typeOf(person) === "student" ? houseName(person.house) : (person.role_title ?? person.roleTitle ?? "Employé")}</small></span>
        <span className="contact-person-chevron">›</span>
      </button>)}
      {!visible.length && <p className="empty-messages">Aucun contact dans cette catégorie.</p>}
    </div>

    {selected && <div className="contact-profile-backdrop" onClick={() => setSelected(null)}>
      <section className="contact-profile-panel" role="dialog" aria-modal="true" aria-label={"Fiche de " + nameOf(selected)} onClick={event => event.stopPropagation()}>
        <div className="contact-profile-top"><button type="button" className="messages-back" onClick={() => setSelected(null)}><ArrowLeft size={17}/> Retour</button><button type="button" className="contact-profile-close" aria-label="Fermer" onClick={() => setSelected(null)}><X size={19}/></button></div>
        <div className="contact-profile-hero">
          {avatarOf(selected) ? <img src={avatarOf(selected)!} alt={"Portrait de " + nameOf(selected)} /> : <span><UserRound size={38}/></span>}
          <p className="eyebrow">CARNET DE CONTACTS • HOGWARTS</p>
          <h2>{nameOf(selected)}</h2>
          <small>{typeOf(selected) === "student" ? "Élève" : (selected.role_title ?? selected.roleTitle ?? "Employé")}</small>
        </div>
        <div className="contact-profile-actions">
          <button type="button" onClick={() => onMessage(selected)}><MessageCircle size={17}/> Envoyer un message</button>
          <button type="button" onClick={() => onInstagram(selected)}><Instagram size={17}/> Consulter son profil Instagram</button>
        </div>
        <section className="contact-profile-section">
          <h3>Informations</h3>
          <div className="contact-info-grid">
            <div><small>Maison</small><strong>{houseName(selected.house) || (selected.house_responsibility && selected.house_responsibility !== "Non" ? "Responsable " + houseName(selected.house_responsibility) : "Personnel")}</strong></div>
            <div><small>Quidditch</small><strong>{selected.quidditch_position || "Non renseigné"}</strong></div>
            <div><small>Cours optionnels</small><strong>{selected.optional_courses?.length ? selected.optional_courses.join(", ") : "Aucun"}</strong></div>
            <div><small>Rôle important</small><strong>{selected.important_role && selected.important_role !== "Aucun" ? selected.important_role : "Aucun"}</strong></div>
            <div className="wide"><small>Orientation sexuelle</small><strong>{selected.sexual_orientation || "Non renseignée"}</strong></div>
          </div>
        </section>
        <section className="contact-profile-section">
          <h3>Liens avec les personnages</h3>
          {loadingLinks ? <p className="contact-profile-empty">Chargement des liens…</p> : links.length
            ? <div className="contact-links-list">{links.map((link, index) => <p key={index}><strong>{link.relationship_type} :</strong> {link.first_name} {link.last_name}</p>)}</div>
            : <p className="contact-profile-empty">Aucun lien validé pour le moment.</p>}
          <small className="contact-links-note">Seuls les liens acceptés sont affichés.</small>
        </section>
      </section>
    </div>}
  </div>;
}
