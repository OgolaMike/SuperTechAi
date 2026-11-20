import { FormEvent, useEffect, useState } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { Activity, ArrowRight, CheckCircle2, Cloud, Copy, LockKeyhole, LogOut, RefreshCw, ShieldCheck, Smartphone, Wifi, WifiOff, Zap } from 'lucide-react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

type Account = {
  login: string; server: string; bridge_status: string; last_seen_at: string | null;
  auto_trade_enabled: boolean; place_new_orders: boolean; live_execution_enabled: boolean;
  emergency_stop: boolean; risk_controls_enabled: boolean;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [login, setLogin] = useState('');
  const [server, setServer] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [workerId, setWorkerId] = useState('');
  const [workerToken, setWorkerToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function refreshAccount() {
    if (!supabase || !session) return;
    const { data, error: queryError } = await supabase.from('mt5_account_settings')
      .select('login,server,bridge_status,last_seen_at,auto_trade_enabled,place_new_orders,live_execution_enabled,emergency_stop,risk_controls_enabled')
      .maybeSingle();
    if (queryError) throw queryError;
    setAccount(data as Account | null);
  }

  useEffect(() => {
    if (!session) { setAccount(null); return; }
    void refreshAccount().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load MT5 account.'));
  }, [session?.user.id]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (signup) {
        const { error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
        if (authError) throw authError;
        setMessage('Check your email to confirm your account, then sign in. Email verification remains enabled.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }

  async function pairAccount(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(''); setMessage('Pairing your MT5 account…'); setWorkerToken('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('mt5-bridge', {
        body: { action: 'pair', accountLogin: login.trim(), server: server.trim() },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok || !data.workerId || !data.workerToken) throw new Error(data?.error ?? 'Account pairing was not completed.');
      setWorkerId(data.workerId);
      setWorkerToken(data.workerToken);
      setMessage('Pairing created. Copy the one-time worker token now; it cannot be retrieved again.');
      await refreshAccount();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not pair this account.'); }
    finally { setBusy(false); }
  }

  async function signOut() { await supabase?.auth.signOut(); }
  async function copyToken() {
    try { await navigator.clipboard.writeText(workerToken); setMessage('Worker token copied. Store it only in the Windows Credential Manager using provision_token.py.'); }
    catch { setError('Clipboard access failed. Select and copy the token manually, then store it securely on the private Windows host.'); }
  }

  if (!url || !anonKey) return <main className="center"><section className="card"><h1>Configuration required</h1><p>Copy .env.example to .env.local and add the Supabase project URL and publishable/anon key. Never use a service-role key in this app.</p></section></main>;
  if (loading) return <main className="center"><div className="brand"><Zap /></div><p>Preparing your secure workspace…</p></main>;

  return <main className="shell">
    <header className="topbar"><div className="brand-lockup"><div className="brand"><Zap /></div><div><b>SUPERTECH AI</b><small>TRADER</small></div></div>{session && <button className="ghost" onClick={signOut}><LogOut size={16}/> Sign out</button>}</header>
    {!session ? <section className="auth card">
      <div className="eyebrow"><span className="pulse"/> CLOUD TRADING CONTROL</div>
      <h1>Trade with intelligence.<br/><em>Stay in control.</em></h1>
      <p className="muted">A secure control centre for your MT5 account and automation connection.</p>
      <form onSubmit={authenticate}>
        <label>Email address</label><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
        <label>Password</label><input type="password" required minLength={8} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/>
        <button className="primary" disabled={busy}>{busy?'Please wait…':signup?'Create account':'Sign in'} <ArrowRight size={16}/></button>
      </form>
      <p className="switch">{signup?'Already registered?':'New to SuperTech AI Trader?'} <button onClick={()=>{setSignup(!signup);setError('');setMessage('');}}>{signup?'Sign in':'Create account'}</button></p>
      <p className="security"><LockKeyhole size={14}/> Email verification stays enabled. This app never asks for your MT5 trading password.</p>
    </section> : <div className="content">
      <div className="welcome"><div><div className="eyebrow">CLOUD TRADING CONTROL</div><h1>Your trading command centre</h1><p className="muted">{session.user.email}</p></div><span className="pill">DEMO-FIRST RELEASE</span></div>
      <section className="hero card"><div><Cloud/><div className="eyebrow">MT5 CONNECTION</div><h2>{account ? account.bridge_status.replaceAll('_',' ') : 'Not paired yet'}</h2><p className="muted">{account ? account.login+' · '+account.server : 'Pair your broker account to register its private MT5 worker.'}</p></div><div className="hero-state"><Activity size={28}/><b>{account?.bridge_status === 'connected' ? 'BRIDGE CONNECTED' : 'NOT EXECUTING'}</b><small>{account?.last_seen_at ? 'Last heartbeat '+new Date(account.last_seen_at).toLocaleString() : 'Waiting for worker heartbeat'}</small></div></section>
      <div className="grid">
        <section className="card"><div className="section-title"><div><span className="eyebrow">ACCOUNT CONNECTION</span><h2>MetaTrader 5</h2></div><Smartphone/></div>
          {account ? <div className="details"><div><small>Account login</small><b>{account.login}</b></div><div><small>Broker server</small><b>{account.server}</b></div><div><small>Risk controls</small><b>{account.risk_controls_enabled?'Enabled':'Disabled'}</b></div><div><small>Emergency stop</small><b>{account.emergency_stop?'On':'Off'}</b></div></div> : <form onSubmit={pairAccount} className="pair-form">
            <label>MT5 account number</label><input inputMode="numeric" pattern="[0-9]{4,20}" required value={login} onChange={e=>setLogin(e.target.value)} placeholder="Broker account login"/>
            <label>Exact broker server name</label><input required maxLength={120} value={server} onChange={e=>setServer(e.target.value)} placeholder="e.g. Broker-Live 2"/>
            <button className="primary" disabled={busy}>{busy?'Pairing…':'Pair MT5 account'} <ArrowRight size={16}/></button>
            <p className="hint">The MT5 desktop terminal must already be logged into this account on your private Windows host. Do not share your trading password.</p>
          </form>}
          {account && <button className="secondary" onClick={()=>void refreshAccount().catch(e=>setError(e.message))}><RefreshCw size={15}/> Refresh account status</button>}
          {workerToken && <div className="token-box"><b>One-time worker token</b><p>This token is shown only once. Copy it now and provision it on your private Windows host.</p><code>{workerToken}</code><button className="secondary" onClick={()=>void copyToken()}><Copy size={15}/> Copy token</button><small>Never paste this token into chat, GitHub, screenshots or source code.</small></div>}
          {workerId && <p className="hint">Worker ID: {workerId}</p>}
        </section>
        <section className="card"><div className="section-title"><div><span className="eyebrow">EXECUTION SAFETY</span><h2>Current permissions</h2></div><ShieldCheck/></div>
          <div className="safety-row"><CheckCircle2/><div><b>Live trading disabled by default</b><small>New live orders remain locked until separately configured and verified.</small></div></div>
          <div className="safety-row"><WifiOff/><div><b>Worker not assumed online</b><small>A paired account is not considered connected until the worker sends a fresh heartbeat.</small></div></div>
          <div className="safety-row"><LockKeyhole/><div><b>Broker password stays private</b><small>Only the official MT5 terminal on your private Windows host holds broker login access.</small></div></div>
          <div className="safety-row"><Wifi/><div><b>Read-only account diagnostics</b><small>Balance, positions and pending orders can be synchronized after the worker is online.</small></div></div>
        </section>
      </div>
      <section className="card ai-studio">
        <div className="ai-heading"><div><span className="eyebrow">THE SUPERTECH AI EXPERIENCE</span><h2>Your AI trading companion</h2><p className="muted">Less chart-watching. More clarity, context and control.</p></div><span className="ai-orb"><Zap size={22}/></span></div>
        <div className="ai-grid">
          <article className="ai-feature"><span className="ai-icon">✦</span><div><b>Personal market briefing</b><p>Start with the markets that matter, what changed overnight and what deserves attention today.</p><small>PLANNED · MULTI-MARKET INTELLIGENCE</small></div></article>
          <article className="ai-feature"><span className="ai-icon">◈</span><div><b>Signals that explain themselves</b><p>Every H4-led opportunity gets a plain-language reason, confirmation status, entry area and invalidation level.</p><small>PLANNED · H4 + LOWER-TIMEFRAME CONFIRMATION</small></div></article>
          <article className="ai-feature"><span className="ai-icon">⌁</span><div><b>Personal risk guardian</b><p>Check exposure, daily loss limits, open positions and trade permissions before an order can proceed.</p><small>SAFETY FOUNDATION · AUTOMATION STILL IN DEVELOPMENT</small></div></article>
          <article className="ai-feature"><span className="ai-icon">◎</span><div><b>Trade memory and coaching</b><p>Turn completed trades into a searchable journal: what worked, what failed and where discipline can improve.</p><small>PLANNED · PERSONAL PERFORMANCE INTELLIGENCE</small></div></article>
          <article className="ai-feature"><span className="ai-icon">⌘</span><div><b>Ask in everyday language</b><p>Ask questions such as “Why is this trade waiting?” or “How much risk is open?” and get an answer grounded in your account.</p><small>PLANNED · SECURE ACCOUNT-AWARE COPILOT</small></div></article>
          <article className="ai-feature"><span className="ai-icon">⇄</span><div><b>One engine, your own account</b><p>Central intelligence can monitor many broker markets while execution remains isolated, permissioned and risk-checked per member.</p><small>FOUNDATION · MEMBER ACCOUNT PAIRING</small></div></article>
        </div>
        <div className="ai-note"><ShieldCheck size={16}/><span>AI can explain and recommend; deterministic risk controls decide whether an order is allowed. No AI suggestion can bypass your account permissions or emergency stop.</span></div>
      </section>
      <section className="card next"><div className="section-title"><div><span className="eyebrow">NEXT STEP</span><h2>Install the MT5 cloud worker</h2></div><Cloud/></div><ol><li>Use a private Windows 10/11 PC or Windows Server with MT5 installed.</li><li>Install Python 3.11 (64-bit) and the worker requirements.</li><li>Run <code>provision_token.py</code> and enter the one-time token above when prompted.</li><li>Start <code>worker.py</code> and keep MT5 logged into the exact paired account.</li></ol><p className="hint">This first repository release prepares secure pairing and account control. It does not yet run unattended signal execution or manage open positions.</p></section>
    </div>}
    {(message||error) && <div className={error?'alert error':'alert'}>{error||message}</div>}
    <footer><ShieldCheck size={15}/> Live execution remains disabled in this release. <span>SuperTech AI · Be part of the AI revolution.</span></footer>
  </main>;
}
