import { useState } from 'react';
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronRight,
  Contact,
  Home,
  Mail,
  Moon,
  Sparkles,
  UserRound,
  WandSparkles,
} from 'lucide-react';

type AppKey = 'home' | 'messages' | 'contacts' | 'social' | 'agenda' | 'profile';

const applications: {
  key: AppKey;
  label: string;
  description: string;
  icon: typeof Mail;
}[] = [
  { key: 'messages', label: 'Messages', description: 'Vos conversations', icon: Mail },
  { key: 'contacts', label: 'Contacts', description: 'Les sorciers et sorcières', icon: Contact },
  { key: 'social', label: 'Réseau', description: 'La Gazette et les publications', icon: Camera },
  { key: 'agenda', label: 'Agenda', description: 'Vos rendez-vous', icon: CalendarDays },
  { key: 'profile', label: 'Profil', description: 'Votre personnage', icon: UserRound },
];

const pageCopy: Record<Exclude<AppKey, 'home'>, { title: string; subtitle: string }> = {
  messages: { title: 'Messages', subtitle: 'Vos hiboux et conversations apparaîtront ici.' },
  contacts: { title: 'Contacts', subtitle: 'Votre carnet de contacts magiques sera disponible ici.' },
  social: { title: 'Réseau', subtitle: 'Les publications et actualités du monde magique apparaîtront ici.' },
  agenda: { title: 'Agenda', subtitle: 'Vos cours, événements et rendez-vous seront réunis ici.' },
  profile: { title: 'Mon profil', subtitle: 'Les informations de votre personnage seront affichées ici.' },
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
          <span className="status-right"><Moon size={13} /> <span>Wi-Fi</span> <span className="battery">100%</span></span>
        </header>

        <div className="top-brand">
          <div className="crest"><WandSparkles size={25} /></div>
          <div>
            <p className="eyebrow">LE MONDE MAGIQUE À PORTÉE DE MAIN</p>
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
              <div className="welcome-stars"><Sparkles size={18} /></div>
              <p className="eyebrow">BIENVENUE</p>
              <h2>Votre monde<br /><em>vous attend.</em></h2>
              <p className="welcome-copy">Retrouvez vos échanges, vos contacts et votre quotidien magique au même endroit.</p>
              <div className="welcome-rule"><span /> <WandSparkles size={15} /> <span /></div>
            </section>

            <div className="section-heading">
              <div>
                <p className="eyebrow">VOTRE TÉLÉPHONE</p>
                <h3>Applications</h3>
              </div>
              <span className="app-count">05</span>
            </div>

            <div className="app-grid">
              {applications.map((app) => {
                const Icon = app.icon;
                return (
                  <button className="app-tile" key={app.key} onClick={() => openApp(app.key)}>
                    <span className="app-icon"><Icon size={22} strokeWidth={1.7} /></span>
                    <span className="app-label">{app.label}</span>
                    <span className="app-description">{app.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="coming-soon">
              <div className="coming-icon"><Sparkles size={17} /></div>
              <div>
                <strong>La magie se prépare…</strong>
                <p>Les connexions et les fonctionnalités arrivent étape par étape.</p>
              </div>
              <ChevronRight size={17} />
            </div>
          </div>
        ) : (
          <div className="screen-content subpage">
            <button className="back-link" onClick={() => openApp('home')}><Home size={15} /> Retour à l'accueil</button>
            <div className="subpage-card">
              <div className="subpage-icon"><WandSparkles size={26} /></div>
              <p className="eyebrow">HOGWARTS PHONE</p>
              <h2>{pageCopy[activeApp].title}</h2>
              <p>{pageCopy[activeApp].subtitle}</p>
              <span className="feature-status">EN PRÉPARATION</span>
            </div>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Navigation principale">
          <button className={activeApp === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('home')}>
            <Home size={19} /><span>Accueil</span>
          </button>
          <button className={activeApp === 'messages' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('messages')}>
            <Mail size={19} /><span>Messages</span>
          </button>
          <button className={activeApp === 'contacts' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('contacts')}>
            <Contact size={19} /><span>Contacts</span>
          </button>
          <button className={activeApp === 'profile' ? 'nav-item active' : 'nav-item'} onClick={() => openApp('profile')}>
            <UserRound size={19} /><span>Profil</span>
          </button>
        </nav>
        <div className="home-indicator" />
      </section>

      <footer className="outside-caption">UN PETIT MORCEAU DE MAGIE, DANS VOTRE POCHE</footer>
    </main>
  );
}

export default App;
