import { useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  Contact,
  HeartHandshake,
  Home,
  Instagram,
  Mail,
  Newspaper,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-react';

type AppKey = 'home' | 'messages' | 'instagram' | 'gazette' | 'contacts' | 'links' | 'agenda';

const applications: {
  key: Exclude<AppKey, 'home'>;
  label: string;
  description: string;
  icon: typeof Mail;
  seal: string;
}[] = [
  { key: 'messages', label: 'Messages', description: 'Hiboux et conversations', icon: Mail, seal: 'I' },
  { key: 'instagram', label: 'Instagram', description: 'La vie des sorciers', icon: Instagram, seal: 'II' },
  { key: 'gazette', label: 'Gazette du Sorcier', description: 'Les nouvelles du monde magique', icon: Newspaper, seal: 'III' },
  { key: 'contacts', label: 'Contacts', description: 'Maisons et personnel', icon: Contact, seal: 'IV' },
  { key: 'links', label: 'Demandes de liens', description: 'Vos relations entre personnages', icon: HeartHandshake, seal: 'V' },
  { key: 'agenda', label: 'Agenda', description: 'Événements et rendez-vous', icon: CalendarDays, seal: 'VI' },
];

const pageCopy: Record<Exclude<AppKey, 'home'>, { title: string; subtitle: string }> = {
  messages: { title: 'Messages', subtitle: 'Vos hiboux, conversations privées et groupes prendront place ici.' },
  instagram: { title: 'Instagram', subtitle: 'Chaque personnage aura son profil et retrouvera les publications dans un fil commun.' },
  gazette: { title: 'La Gazette du Sorcier', subtitle: 'Retrouvez les articles, rumeurs et actualités publiés dans le monde magique.' },
  contacts: { title: 'Contacts', subtitle: 'Les élèves seront classés par maison. Le personnel disposera de sa propre catégorie professionnelle.' },
  links: { title: 'Demandes de liens', subtitle: 'Envoyez, recevez et gérez les demandes de liens entre vos personnages.' },
  agenda: { title: 'Agenda', subtitle: 'Retrouvez les événements, rendez-vous et dates importantes.' },
};

function App() {
  const [activeApp, setActiveApp] = useState<AppKey>('home');
  const openApp = (key: AppKey) => setActiveApp(key);

  return (
    <main className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="phone-frame" aria-label="Hogwarts Phone">
        <header className="status-bar">
          <span>9:41</span>
          <span className="status-right"><span>✦</span><span>Wi-Fi</span><span className="battery">100%</span></span>
        </header>

        <div className="top-brand">
          <div className="crest"><WandSparkles size={25} /></div>
          <div>
            <p className="eyebrow">HOGWARTS • A NEW ERA</p>
            <h1>Hogwarts <span>Phone</span></h1>
          </div>
          <button className="icon-button notification-button" aria-label="Notifications">
            <Bell size={19} />
            <i />
          </button>
        </div>

        {activeApp === 'home' ? (
          <div className="screen-content">
            <section className="welcome-card">
              <div className="welcome-ornament">✦</div>
              <p className="eyebrow">LE MONDE DES SORCIERS</p>
              <h2>La magie<br /><em>dans votre poche.</em></h2>
              <p className="welcome-copy">Votre courrier, vos rencontres et toute votre vie magique réunis dans un seul endroit.</p>
              <div className="welcome-rule"><span /> <WandSparkles size={15} /> <span /></div>
            </section>

            <div className="section-heading">
              <div>
                <p className="eyebrow">VOTRE QUOTIDIEN MAGIQUE</p>
                <h3>Applications</h3>
              </div>
              <span className="app-count">06</span>
            </div>

            <div className="app-grid">
              {applications.map((app) => {
                const Icon = app.icon;
                return (
                  <button className={`app-tile app-${app.key}`} key={app.key} onClick={() => openApp(app.key)}>
                    <span className="app-seal">{app.seal}</span>
                    <span className="app-icon"><Icon size={22} strokeWidth={1.65} /></span>
                    <span className="app-label">{app.label}</span>
                    <span className="app-description">{app.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="parchment-note">
              <Sparkles size={16} />
              <span>Une nouvelle ère commence à Poudlard.</span>
            </div>
          </div>
        ) : (
          <div className="screen-content subpage">
            <button className="back-link" onClick={() => openApp('home')}><ChevronLeft size={16} /> Retour aux applications</button>
            <div className="subpage-card">
              <div className="subpage-icon"><WandSparkles size={27} /></div>
              <p className="eyebrow">HOGWARTS • A NEW ERA</p>
              <h2>{pageCopy[activeApp].title}</h2>
              <p>{pageCopy[activeApp].subtitle}</p>
              <span className="feature-status">EN PRÉPARATION</span>
            </div>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Navigation principale">
          <button className={activeApp === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('home')}>
            <Home size={18} /><span>Accueil</span>
          </button>
          <button className={activeApp === 'messages' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('messages')}>
            <Mail size={18} /><span>Messages</span>
          </button>
          <button className={activeApp === 'gazette' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('gazette')}>
            <Newspaper size={18} /><span>Gazette</span>
          </button>
          <button className={activeApp === 'contacts' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('contacts')}>
            <Users size={18} /><span>Contacts</span>
          </button>
        </nav>
        <div className="home-indicator" />
      </section>

      <footer className="outside-caption">HOGWARTS • A NEW ERA</footer>
    </main>
  );
}

export default App;
