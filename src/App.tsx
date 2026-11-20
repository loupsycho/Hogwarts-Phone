import { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  Contact,
  HeartHandshake,
  Home,
  Instagram,
  LogOut,
  Mail,
  Newspaper,
  Sparkles,
  Users,
  WandSparkles,
} from 'lucide-react';
import { authClient } from './lib/auth-client';

type AppKey = 'home' | 'messages' | 'instagram' | 'gazette' | 'contacts' | 'links' | 'agenda';
type Character = {
  id: string;
  firstName: string;
  lastName: string;
  characterType: 'student' | 'staff';
  house: string | null;
  roleTitle: string | null;
  avatarUrl: string | null;
};
type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
type AuthScreen = 'checking' | 'signed-out' | 'pending' | 'rejected' | 'suspended' | 'no-characters' | 'select-character' | 'app' | 'admin' | 'error';

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
  const [authScreen, setAuthScreen] = useState<AuthScreen>('checking');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [activeApp, setActiveApp] = useState<AppKey>('home');
  const [authError, setAuthError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const loadPlayer = async () => {
    setAuthScreen('checking');
    try {
      const session = await authClient.getSession();
      if (!session.data?.user) {
        setAuthScreen('signed-out');
        return;
      }

      const response = await fetch('/api/account/bootstrap', { credentials: 'include' });
      if (response.status === 401) {
        setAuthScreen('signed-out');
        return;
      }
      if (!response.ok) throw new Error('Impossible de charger le compte joueur.');
      const data: { accountStatus: AccountStatus; characters: Character[]; isAdmin?: boolean } = await response.json();
      setCharacters(data.characters ?? []);

      if (data.isAdmin) setAuthScreen('admin');
      else if (data.accountStatus === 'pending') setAuthScreen('pending');
      else if (data.accountStatus === 'rejected') setAuthScreen('rejected');
      else if (data.accountStatus === 'suspended') setAuthScreen('suspended');
      else if (!data.characters?.length) setAuthScreen('no-characters');
      else setAuthScreen('select-character');
    } catch {
      setAuthError('La connexion au compte n’a pas pu être vérifiée. Réessaie dans quelques instants.');
      setAuthScreen('error');
    }
  };

  useEffect(() => {
    void loadPlayer();
  }, []);

  const signIn = async () => {
    if (isSigningIn) return;
    setAuthError('');
    setIsSigningIn(true);
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider: 'discord',
          callbackURL: window.location.origin,
          errorCallbackURL: window.location.origin,
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        url?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.message || data.error || `Erreur du serveur de connexion (HTTP ${response.status}).`);
      }
      window.location.assign(data.url);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'La connexion Discord a échoué.');
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    setSelectedCharacter(null);
    setCharacters([]);
    setActiveApp('home');
    setAuthScreen('signed-out');
  };

  const openApp = (key: AppKey) => setActiveApp(key);

  const renderMessageScreen = (title: string, message: string, action?: { label: string; onClick: () => void }) => (
    <div className="auth-content">
      <div className="auth-card">
        <div className="auth-crest"><WandSparkles size={29} /></div>
        <p className="eyebrow">HOGWARTS • A NEW ERA</p>
        <h2>{title}</h2>
        <p>{message}</p>
        {action && <button className="primary-action" onClick={action.onClick}>{action.label}</button>}
        <button className="quiet-action" onClick={signOut}>Se déconnecter</button>
      </div>
    </div>
  );

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
          {authScreen === 'app' && selectedCharacter ? (
            <button className="icon-button notification-button" aria-label="Changer de personnage" title="Changer de personnage" onClick={() => { setSelectedCharacter(null); setAuthScreen('select-character'); }}>
              <Users size={19} />
            </button>
          ) : null}
        </div>

        {authScreen === 'checking' && (
          <div className="auth-content">
            <div className="auth-card">
              <div className="auth-crest"><WandSparkles size={29} /></div>
              <p className="eyebrow">HOGWARTS • A NEW ERA</p>
              <h2>Un instant…</h2>
              <p>Nous préparons votre espace magique.</p>
              <span className="feature-status">CONNEXION EN COURS</span>
            </div>
          </div>
        )}

        {authScreen === 'signed-out' && (
          <div className="auth-content">
            <div className="auth-card">
              <div className="auth-crest"><WandSparkles size={29} /></div>
              <p className="eyebrow">VOTRE TÉLÉPHONE MAGIQUE</p>
              <h2>Bienvenue à<br /><em>Hogwarts Phone</em></h2>
              <p>Connecte-toi avec ton compte Discord pour retrouver tes personnages et accéder à leurs applications.</p>
              <button type="button" className="primary-action discord-action" onClick={() => { void signIn(); }} disabled={isSigningIn}>
                {isSigningIn ? 'Ouverture de Discord…' : 'Continuer avec Discord'}
              </button>
              {authError && <p className="auth-error">{authError}</p>}
              <p className="auth-footnote">L’accès est soumis à la validation de ton compte par l’administration.</p>
            </div>
          </div>
        )}

        {authScreen === 'admin' && renderMessageScreen('Espace administration', 'Ton compte propriétaire est reconnu. Le panneau de gestion Hogwarts Phone sera accessible ici : gestion des joueurs, des accès, des personnages, des contenus et des applications.')}
        {authScreen === 'pending' && renderMessageScreen('Compte en attente', 'Ta demande d’accès a bien été enregistrée. Tu pourras utiliser Hogwarts Phone dès que ton compte Discord aura été accepté par l’administration.')}
        {authScreen === 'rejected' && renderMessageScreen('Accès refusé', 'L’administration n’a pas autorisé l’accès à Hogwarts Phone pour ce compte.')}
        {authScreen === 'suspended' && renderMessageScreen('Compte suspendu', 'L’accès à Hogwarts Phone est temporairement suspendu pour ce compte.')}
        {authScreen === 'no-characters' && renderMessageScreen('Ton espace est prêt', 'Ton compte est accepté, mais aucun personnage ne t’a encore été attribué. Ils apparaîtront ici dès que l’administration les aura créés.')}
        {authScreen === 'error' && renderMessageScreen('Un petit souci magique', authError, { label: 'Réessayer', onClick: () => void loadPlayer() })}

        {authScreen === 'select-character' && (
          <div className="screen-content character-screen">
            <div className="section-heading character-heading">
              <div>
                <p className="eyebrow">ESPACE PERSONNEL</p>
                <h3>Qui incarnes-tu ?</h3>
              </div>
              <button className="quiet-icon-action" onClick={signOut} aria-label="Se déconnecter"><LogOut size={17} /></button>
            </div>
            <p className="character-intro">Choisis le personnage avec lequel tu souhaites entrer dans ton téléphone.</p>
            <div className="character-list">
              {characters.map((character) => (
                <button className="character-card" key={character.id} onClick={() => { setSelectedCharacter(character); setActiveApp('home'); setAuthScreen('app'); }}>
                  <span className="character-avatar">
                    {character.avatarUrl ? <img src={character.avatarUrl} alt="" /> : <WandSparkles size={22} />}
                  </span>
                  <span className="character-info">
                    <strong>{character.firstName} {character.lastName}</strong>
                    <small>{character.characterType === 'student' ? 'Élève' : character.roleTitle || 'Personnel'}{character.house ? ' · ' + character.house : ''}</small>
                  </span>
                  <ChevronLeft className="character-arrow" size={18} />
                </button>
              ))}
            </div>
            <button className="quiet-action" onClick={signOut}>Se déconnecter</button>
          </div>
        )}

        {authScreen === 'app' && selectedCharacter && (
          <>
            <div className="character-banner">
              <span>{selectedCharacter.firstName} {selectedCharacter.lastName}</span>
              <small>{selectedCharacter.house ?? selectedCharacter.roleTitle ?? 'Hogwarts'}</small>
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
                      <button className={'app-tile app-' + app.key} key={app.key} onClick={() => openApp(app.key)}>
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
          </>
        )}
        <div className="home-indicator" />
      </section>

      <footer className="outside-caption">HOGWARTS • A NEW ERA</footer>
    </main>
  );
}

export default App;
